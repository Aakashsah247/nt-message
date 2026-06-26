import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';

import { AccessTokenValidationService } from '../auth/services/access-token-validation.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';

interface MessagingReadyPayload {
  accountId: string;
  sessionId: string;
  connectedAt: string;
}

interface MessagingErrorPayload {
  message: string;
}

interface MessagingPongPayload {
  serverTime: string;
}

interface ServerToClientEvents {
  'messaging:ready': (payload: MessagingReadyPayload) => void;
  'messaging:error': (payload: MessagingErrorPayload) => void;
  'messaging:pong': (payload: MessagingPongPayload) => void;
}

interface ClientToServerEvents {
  'messaging:ping': () => void;
}

interface MessagingSocketData {
  user?: AuthenticatedUser;
}

type MessagingSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  MessagingSocketData
>;

type MessagingNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  MessagingSocketData
>;

@WebSocketGateway({
  namespace: '/messaging',
})
export class ConversationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly accessTokenValidationService: AccessTokenValidationService,
  ) {}

  afterInit(server: MessagingNamespace): void {
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

    client.emit('messaging:ready', {
      accountId: user.accountId,
      sessionId: user.sessionId,
      connectedAt: new Date().toISOString(),
    });
  }

  handleDisconnect(_client: MessagingSocket): void {
    // Socket.IO removes disconnected clients from all rooms automatically.
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
