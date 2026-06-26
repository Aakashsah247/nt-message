import { Injectable } from '@nestjs/common';

export interface MessagingPresenceState {
  accountId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  occurredAt: string;
}

interface PresenceEntry {
  socketIds: Set<string>;
  lastSeenAt: string | null;
}

@Injectable()
export class MessagingPresenceService {
  private readonly entries = new Map<string, PresenceEntry>();

  connect(
    accountId: string,
    socketId: string,
  ): {
    becameOnline: boolean;
    presence: MessagingPresenceState;
  } {
    const occurredAt = new Date().toISOString();
    const existing = this.entries.get(accountId);
    const entry = existing ?? {
      socketIds: new Set<string>(),
      lastSeenAt: null,
    };
    const wasOnline = entry.socketIds.size > 0;

    entry.socketIds.add(socketId);
    this.entries.set(accountId, entry);

    return {
      becameOnline: !wasOnline,
      presence: this.serialize(accountId, entry, occurredAt),
    };
  }

  disconnect(
    accountId: string,
    socketId: string,
  ): {
    becameOffline: boolean;
    presence: MessagingPresenceState;
  } | null {
    const entry = this.entries.get(accountId);

    if (!entry) {
      return null;
    }

    entry.socketIds.delete(socketId);

    if (entry.socketIds.size > 0) {
      return {
        becameOffline: false,
        presence: this.serialize(
          accountId,
          entry,
          new Date().toISOString(),
        ),
      };
    }

    const lastSeenAt = new Date().toISOString();
    entry.lastSeenAt = lastSeenAt;

    return {
      becameOffline: true,
      presence: this.serialize(accountId, entry, lastSeenAt),
    };
  }

  getSnapshot(): MessagingPresenceState[] {
    const occurredAt = new Date().toISOString();

    return [...this.entries.entries()]
      .map(([accountId, entry]) =>
        this.serialize(accountId, entry, occurredAt),
      )
      .sort((first, second) =>
        first.accountId.localeCompare(second.accountId),
      );
  }

  private serialize(
    accountId: string,
    entry: PresenceEntry,
    occurredAt: string,
  ): MessagingPresenceState {
    return {
      accountId,
      isOnline: entry.socketIds.size > 0,
      lastSeenAt: entry.lastSeenAt,
      occurredAt,
    };
  }
}
