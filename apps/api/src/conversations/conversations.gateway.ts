import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';

import { AccessTokenValidationService } from '../auth/services/access-token-validation.service';
import {
  MessagingEventsService,
  type MessagingClientToServerEvents,
  type MessagingNamespace,
  type MessagingServerToClientEvents,
  type MessagingSocketData,
  type MessagingTypingPayload,
} from '../realtime/messaging-events.service';
import { MessagingPresenceService } from '../realtime/messaging-presence.service';
import { ConversationsService } from './conversations.service';

type MessagingSocket = Socket<
  MessagingClientToServerEvents,
  MessagingServerToClientEvents,
  Record<string, never>,
  MessagingSocketData
>;

interface TypingConversationState {
  participantAccountIds: string[];
  isTyping: boolean;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPING_EVENT_THROTTLE_MS = 300;
const TYPING_EXPIRY_MS = 3500;

@WebSocketGateway({
  namespace: '/messaging',
})
export class ConversationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly typingStates = new Map<
    string,
    Map<string, TypingConversationState>
  >();
  private readonly typingSocketsByConversation = new Map<
    string,
    Map<string, Set<string>>
  >();
  private readonly lastTypingEventAtBySocket = new Map<string, number>();

  constructor(
    private readonly accessTokenValidationService: AccessTokenValidationService,
    private readonly conversationsService: ConversationsService,
    private readonly messagingEventsService: MessagingEventsService,
    private readonly messagingPresenceService: MessagingPresenceService,
  ) {}

  afterInit(server: MessagingNamespace): void {
    this.messagingEventsService.bindServer(server);

    server.use(async (client, next) => {
      const accessToken = this.extractAccessToken(client);

      if (!accessToken) {
        next(new Error('Authentication is required.'));
        return;
      }

      try {
        client.data.user =
          await this.accessTokenValidationService.verifyAccessToken(
            accessToken,
          );

        next();
      } catch {
        next(new Error('Authentication session is invalid or expired.'));
      }
    });
  }

  async handleConnection(client: MessagingSocket): Promise<void> {
    const user = client.data.user;

    if (!user) {
      client.emit('messaging:error', {
        message: 'Authentication session is unavailable.',
      });

      client.disconnect(true);
      return;
    }

    await client.join(this.accountRoom(user.accountId));

    const connection = this.messagingPresenceService.connect(
      user.accountId,
      client.id,
    );
    const connectedAt = new Date().toISOString();

    client.emit('messaging:ready', {
      accountId: user.accountId,
      sessionId: user.sessionId,
      connectedAt,
    });

    client.emit('messaging:presence-snapshot', {
      presences: this.messagingPresenceService.getSnapshot(),
      occurredAt: connectedAt,
    });

    if (connection.becameOnline) {
      this.messagingEventsService.emitPresenceUpdated(
        connection.presence,
      );
    }
  }

  handleDisconnect(client: MessagingSocket): void {
    const user = client.data.user;

    if (!user) {
      return;
    }

    this.clearTypingForSocket(client.id, user.accountId);

    const disconnection = this.messagingPresenceService.disconnect(
      user.accountId,
      client.id,
    );

    if (disconnection?.becameOffline) {
      this.messagingEventsService.emitPresenceUpdated(
        disconnection.presence,
      );
    }
  }

  @SubscribeMessage('messaging:ping')
  handlePing(
    @ConnectedSocket()
    client: MessagingSocket,
  ): void {
    client.emit('messaging:pong', {
      serverTime: new Date().toISOString(),
    });
  }

  @SubscribeMessage('messaging:typing')
  async handleTyping(
    @ConnectedSocket()
    client: MessagingSocket,

    @MessageBody()
    payload: MessagingTypingPayload,
  ): Promise<void> {
    const user = client.data.user;

    if (
      !user ||
      !this.isValidTypingPayload(payload)
    ) {
      return;
    }

    if (payload.isTyping) {
      const now = Date.now();
      const lastEventAt =
        this.lastTypingEventAtBySocket.get(client.id) ?? 0;

      if (now - lastEventAt < TYPING_EVENT_THROTTLE_MS) {
        return;
      }

      this.lastTypingEventAtBySocket.set(client.id, now);
    }

    const socketStates = this.getSocketTypingStates(client.id);
    let state = socketStates.get(payload.conversationId);

    if (!payload.isTyping && !state) {
      return;
    }

    if (!state) {
      try {
        const participantAccountIds =
          await this.conversationsService.getActiveParticipantAccountIds(
            user,
            payload.conversationId,
          );

        state = {
          participantAccountIds,
          isTyping: false,
          stopTimer: null,
        };
        socketStates.set(payload.conversationId, state);
      } catch {
        if (socketStates.size === 0) {
          this.typingStates.delete(client.id);
        }

        client.emit('messaging:error', {
          message: 'Typing status could not be shared for this conversation.',
        });
        return;
      }
    }

    if (!payload.isTyping) {
      this.stopTyping(
        client.id,
        user.accountId,
        payload.conversationId,
      );
      return;
    }

    for (const activeConversationId of [...socketStates.keys()]) {
      if (activeConversationId !== payload.conversationId) {
        this.stopTyping(
          client.id,
          user.accountId,
          activeConversationId,
        );
      }
    }

    if (!state.isTyping) {
      state.isTyping = true;
      this.startTyping(
        client.id,
        state.participantAccountIds,
        user.accountId,
        payload.conversationId,
      );
    }

    if (state.stopTimer) {
      clearTimeout(state.stopTimer);
    }

    state.stopTimer = setTimeout(() => {
      this.stopTyping(
        client.id,
        user.accountId,
        payload.conversationId,
      );
    }, TYPING_EXPIRY_MS);
  }

  private getSocketTypingStates(
    socketId: string,
  ): Map<string, TypingConversationState> {
    const existing = this.typingStates.get(socketId);

    if (existing) {
      return existing;
    }

    const created = new Map<string, TypingConversationState>();
    this.typingStates.set(socketId, created);

    return created;
  }

  private stopTyping(
    socketId: string,
    accountId: string,
    conversationId: string,
  ): void {
    const socketStates = this.typingStates.get(socketId);
    const state = socketStates?.get(conversationId);

    if (!socketStates || !state) {
      return;
    }

    if (state.stopTimer) {
      clearTimeout(state.stopTimer);
    }

    if (state.isTyping) {
      this.finishTyping(
        socketId,
        state.participantAccountIds,
        accountId,
        conversationId,
      );
    }

    socketStates.delete(conversationId);

    if (socketStates.size === 0) {
      this.typingStates.delete(socketId);
    }
  }

  private clearTypingForSocket(
    socketId: string,
    accountId: string,
  ): void {
    const socketStates = this.typingStates.get(socketId);

    if (!socketStates) {
      return;
    }

    for (const [conversationId, state] of socketStates) {
      if (state.stopTimer) {
        clearTimeout(state.stopTimer);
      }

      if (state.isTyping) {
        this.finishTyping(
          socketId,
          state.participantAccountIds,
          accountId,
          conversationId,
        );
      }
    }

    this.typingStates.delete(socketId);
    this.lastTypingEventAtBySocket.delete(socketId);
  }

  private startTyping(
    socketId: string,
    participantAccountIds: string[],
    accountId: string,
    conversationId: string,
  ): void {
    const accountSockets =
      this.typingSocketsByConversation.get(conversationId) ??
      new Map<string, Set<string>>();
    const socketIds = accountSockets.get(accountId) ?? new Set<string>();
    const wasTyping = socketIds.size > 0;

    socketIds.add(socketId);
    accountSockets.set(accountId, socketIds);
    this.typingSocketsByConversation.set(
      conversationId,
      accountSockets,
    );

    if (!wasTyping) {
      this.emitTypingState(
        participantAccountIds,
        accountId,
        conversationId,
        true,
      );
    }
  }

  private finishTyping(
    socketId: string,
    participantAccountIds: string[],
    accountId: string,
    conversationId: string,
  ): void {
    const accountSockets =
      this.typingSocketsByConversation.get(conversationId);
    const socketIds = accountSockets?.get(accountId);

    if (!accountSockets || !socketIds) {
      return;
    }

    socketIds.delete(socketId);

    if (socketIds.size > 0) {
      return;
    }

    accountSockets.delete(accountId);

    if (accountSockets.size === 0) {
      this.typingSocketsByConversation.delete(conversationId);
    }

    this.emitTypingState(
      participantAccountIds,
      accountId,
      conversationId,
      false,
    );
  }

  private emitTypingState(
    participantAccountIds: string[],
    accountId: string,
    conversationId: string,
    isTyping: boolean,
  ): void {
    this.messagingEventsService.emitTypingUpdated(
      participantAccountIds.filter(
        (participantAccountId) => participantAccountId !== accountId,
      ),
      {
        conversationId,
        accountId,
        isTyping,
        occurredAt: new Date().toISOString(),
      },
    );
  }

  private isValidTypingPayload(
    payload: MessagingTypingPayload,
  ): boolean {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      typeof payload.conversationId === 'string' &&
      UUID_V4_PATTERN.test(payload.conversationId) &&
      typeof payload.isTyping === 'boolean'
    );
  }

  private extractAccessToken(client: MessagingSocket): string | null {
    const authToken = client.handshake.auth?.accessToken;

    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const authorization = client.handshake.headers.authorization;

    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      return authorization.slice('Bearer '.length).trim() || null;
    }

    return null;
  }

  private accountRoom(accountId: string): string {
    return `account:${accountId}`;
  }
}
