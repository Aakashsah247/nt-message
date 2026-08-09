import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  ConversationParticipantRole,
  ConversationType,
  MessageContentType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';

const MESSAGE_ATTACHMENT_STORAGE_DIR = path.resolve(
  process.env.MESSAGE_ATTACHMENT_STORAGE_DIR ??
    path.join(process.cwd(), 'storage', 'message-attachments'),
);

const STORAGE_CATEGORY_DEFINITIONS = [
  {
    key: 'IMAGES',
    label: 'Images',
    contentType: MessageContentType.IMAGE,
  },
  {
    key: 'VIDEOS',
    label: 'Videos',
    contentType: MessageContentType.VIDEO,
  },
  {
    key: 'DOCUMENTS',
    label: 'Documents',
    contentType: MessageContentType.FILE,
  },
  {
    key: 'AUDIO',
    label: 'Audio and voice notes',
    contentType: MessageContentType.AUDIO,
  },
] as const;

/*
 * These SQL fragments contain only fixed application text. Runtime values are
 * always supplied as PostgreSQL bind parameters to prevent SQL injection.
 */
const USER_VISIBLE_ATTACHMENT_FROM_SQL = `
  FROM "message_attachments" ma
  INNER JOIN "messages" m ON m."id" = ma."message_id"
  INNER JOIN "conversations" c ON c."id" = m."conversation_id"
  INNER JOIN "conversation_participants" cp
    ON cp."conversation_id" = m."conversation_id"
    AND cp."account_id" = $1::uuid
    AND cp."left_at" IS NULL
  INNER JOIN "accounts" sender ON sender."id" = m."sender_account_id"
  LEFT JOIN "employees" sender_employee ON sender_employee."id" = sender."employee_id"
  WHERE m."deleted_at" IS NULL
    AND m."sent_at" >= cp."joined_at"
    AND (
      cp."history_cleared_at" IS NULL
      OR cp."history_cleared_at" < cp."joined_at"
      OR m."sent_at" > cp."history_cleared_at"
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "message_hidden_for_accounts" hidden
      WHERE hidden."message_id" = m."id"
        AND hidden."account_id" = $1::uuid
    )
    AND ma."scan_status" NOT IN ('FAILED', 'QUARANTINED')
`;

const CONVERSATION_VISIBLE_ATTACHMENT_FROM_SQL = `
  ${USER_VISIBLE_ATTACHMENT_FROM_SQL}
    AND m."conversation_id" = $2::uuid
`;

const CONVERSATION_LABEL_SQL = `
  COALESCE(
    c."title",
    CASE
      WHEN c."type"::text = 'PRIVATE' THEN (
        SELECT COALESCE(peer_employee."emp_name", peer_account."username", 'Private conversation')
        FROM "conversation_participants" peer_participant
        INNER JOIN "accounts" peer_account
          ON peer_account."id" = peer_participant."account_id"
        LEFT JOIN "employees" peer_employee
          ON peer_employee."id" = peer_account."employee_id"
        WHERE peer_participant."conversation_id" = c."id"
          AND peer_participant."account_id" <> $1::uuid
        ORDER BY peer_participant."joined_at" ASC
        LIMIT 1
      )
      ELSE 'Group conversation'
    END
  )
`;

type DatabaseNumber = bigint | number | string | null;

interface StorageCategoryDatabaseRow {
  contentType: string;
  logicalBytes: DatabaseNumber;
  itemCount: DatabaseNumber;
}

interface StorageConversationDatabaseRow {
  conversationId: string;
  conversationTitle: string | null;
  conversationType: string;
  groupKind: string | null;
  logicalBytes: DatabaseNumber;
  itemCount: DatabaseNumber;
}

interface StorageLargestFileDatabaseRow {
  attachmentId: string;
  messageId: string;
  conversationId: string;
  conversationTitle: string | null;
  conversationType: string;
  groupKind: string | null;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  contentType: string;
  senderAccountId: string;
  senderDisplayName: string;
  sentAt: Date | string;
}

interface StorageQueryResult {
  categoryRows: StorageCategoryDatabaseRow[];
  largestFileRows: StorageLargestFileDatabaseRow[];
  conversationRows?: StorageConversationDatabaseRow[];
}

@Injectable()
export class ConversationStorageService {
  private readonly logger = new Logger(ConversationStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  private databaseNumber(value: DatabaseNumber): number {
    const parsed = Number(value ?? 0);

    // Storage totals are returned as JSON numbers, so unsafe integers must never be rounded silently.
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new ConflictException(
        'Storage usage is too large to represent safely. Contact the system administrator.',
      );
    }

    return parsed;
  }

  private resolveAttachmentPath(storageKey: string): string {
    const absolutePath = path.resolve(
      MESSAGE_ATTACHMENT_STORAGE_DIR,
      storageKey,
    );

    // A database value must never be allowed to escape the private attachment root.
    if (
      !absolutePath.startsWith(`${MESSAGE_ATTACHMENT_STORAGE_DIR}${path.sep}`)
    ) {
      throw new ConflictException(
        'An attachment storage reference is invalid.',
      );
    }

    return absolutePath;
  }

  private async isPhysicalObjectAvailable(
    storageKey: string,
  ): Promise<boolean> {
    try {
      await fs.access(this.resolveAttachmentPath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  private buildCategories(rows: StorageCategoryDatabaseRow[]) {
    const byType = new Map(rows.map((row) => [row.contentType, row]));

    // Return zero-value categories so the web contract remains stable for empty accounts.
    return STORAGE_CATEGORY_DEFINITIONS.map((definition) => {
      const row = byType.get(definition.contentType);

      return {
        key: definition.key,
        label: definition.label,
        contentType: definition.contentType,
        logicalBytes: this.databaseNumber(row?.logicalBytes ?? 0),
        itemCount: this.databaseNumber(row?.itemCount ?? 0),
      };
    });
  }

  private async buildLargestFiles(
    rows: StorageLargestFileDatabaseRow[],
    viewerAccountId: string,
  ) {
    return Promise.all(
      rows.map(async (row) => {
        const available = await this.isPhysicalObjectAvailable(row.storageKey);

        if (!available) {
          /*
           * Storage integrity is an infrastructure concern. Record the
           * technical identifiers only in protected server logs; never return
           * physical health or storage-key details to organizational users.
           */
          this.logger.warn(
            `Message attachment file is unavailable (attachmentId=${row.attachmentId}, messageId=${row.messageId}, storageKey=${row.storageKey}).`,
          );
        }

        return {
          attachmentId: row.attachmentId,
          messageId: row.messageId,
          conversationId: row.conversationId,
          conversationTitle: row.conversationTitle,
          conversationType: row.conversationType,
          groupKind: row.groupKind,
          originalFileName: row.originalFileName,
          mimeType: row.mimeType,
          fileSizeBytes: row.fileSizeBytes,
          contentType: row.contentType,
          sender: {
            accountId: row.senderAccountId,
            displayName: row.senderDisplayName,
          },
          sentAt:
            row.sentAt instanceof Date ? row.sentAt.toISOString() : row.sentAt,
          // Delete for everyone remains sender-only; group authority never overrides message ownership.
          canDeleteForMe: true,
          canDeleteForEveryone: row.senderAccountId === viewerAccountId,
        };
      }),
    );
  }

  private async queryUserStorage(
    accountId: string,
    limit: number,
  ): Promise<StorageQueryResult> {
    const [categoryRows, conversationRows, largestFileRows] =
      await Promise.all([
        this.prisma.$queryRawUnsafe<StorageCategoryDatabaseRow[]>(
          `
            SELECT
              ma."content_type"::text AS "contentType",
              COALESCE(SUM(ma."file_size_bytes"), 0)::bigint AS "logicalBytes",
              COUNT(*)::bigint AS "itemCount"
            ${USER_VISIBLE_ATTACHMENT_FROM_SQL}
            GROUP BY ma."content_type"
          `,
          accountId,
        ),
        this.prisma.$queryRawUnsafe<StorageConversationDatabaseRow[]>(
          `
            SELECT
              c."id" AS "conversationId",
              ${CONVERSATION_LABEL_SQL} AS "conversationTitle",
              c."type"::text AS "conversationType",
              c."group_kind"::text AS "groupKind",
              COALESCE(SUM(ma."file_size_bytes"), 0)::bigint AS "logicalBytes",
              COUNT(*)::bigint AS "itemCount"
            ${USER_VISIBLE_ATTACHMENT_FROM_SQL}
            GROUP BY c."id", c."title", c."type", c."group_kind"
            ORDER BY "logicalBytes" DESC, "conversationTitle" ASC
          `,
          accountId,
        ),
        this.prisma.$queryRawUnsafe<StorageLargestFileDatabaseRow[]>(
          `
            SELECT
              ma."id" AS "attachmentId",
              m."id" AS "messageId",
              c."id" AS "conversationId",
              ${CONVERSATION_LABEL_SQL} AS "conversationTitle",
              c."type"::text AS "conversationType",
              c."group_kind"::text AS "groupKind",
              ma."storage_key" AS "storageKey",
              ma."original_file_name" AS "originalFileName",
              ma."mime_type" AS "mimeType",
              ma."file_size_bytes" AS "fileSizeBytes",
              ma."content_type"::text AS "contentType",
              sender."id" AS "senderAccountId",
              COALESCE(sender_employee."emp_name", sender."username", 'NT Message User') AS "senderDisplayName",
              m."sent_at" AS "sentAt"
            ${USER_VISIBLE_ATTACHMENT_FROM_SQL}
            ORDER BY ma."file_size_bytes" DESC, m."sent_at" DESC, ma."id" DESC
            LIMIT $2::int
          `,
          accountId,
          limit,
        ),
      ]);

    return {
      categoryRows,
      conversationRows,
      largestFileRows,
    };
  }

  private async queryConversationStorage(
    accountId: string,
    conversationId: string,
    limit: number,
  ): Promise<StorageQueryResult> {
    const [categoryRows, largestFileRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<StorageCategoryDatabaseRow[]>(
        `
          SELECT
            ma."content_type"::text AS "contentType",
            COALESCE(SUM(ma."file_size_bytes"), 0)::bigint AS "logicalBytes",
            COUNT(*)::bigint AS "itemCount"
          ${CONVERSATION_VISIBLE_ATTACHMENT_FROM_SQL}
          GROUP BY ma."content_type"
        `,
        accountId,
        conversationId,
      ),
      this.prisma.$queryRawUnsafe<StorageLargestFileDatabaseRow[]>(
        `
          SELECT
            ma."id" AS "attachmentId",
            m."id" AS "messageId",
            c."id" AS "conversationId",
            ${CONVERSATION_LABEL_SQL} AS "conversationTitle",
            c."type"::text AS "conversationType",
            c."group_kind"::text AS "groupKind",
            ma."storage_key" AS "storageKey",
            ma."original_file_name" AS "originalFileName",
            ma."mime_type" AS "mimeType",
            ma."file_size_bytes" AS "fileSizeBytes",
            ma."content_type"::text AS "contentType",
            sender."id" AS "senderAccountId",
            COALESCE(sender_employee."emp_name", sender."username", 'NT Message User') AS "senderDisplayName",
            m."sent_at" AS "sentAt"
          ${CONVERSATION_VISIBLE_ATTACHMENT_FROM_SQL}
          ORDER BY ma."file_size_bytes" DESC, m."sent_at" DESC, ma."id" DESC
          LIMIT $3::int
        `,
        accountId,
        conversationId,
        limit,
      ),
    ]);

    return {
      categoryRows,
      largestFileRows,
    };
  }

  async getUserStorageUsage(user: AuthenticatedUser, limit: number) {
    const result = await this.queryUserStorage(user.accountId, limit);
    const categories = this.buildCategories(result.categoryRows);
    const largestFiles = await this.buildLargestFiles(
      result.largestFileRows,
      user.accountId,
    );

    return {
      scope: 'USER' as const,
      generatedAt: new Date().toISOString(),
      totals: {
        logicalVisibleBytes: categories.reduce(
          (total, category) => total + category.logicalBytes,
          0,
        ),
        logicalItemCount: categories.reduce(
          (total, category) => total + category.itemCount,
          0,
        ),
      },
      categories,
      storageByConversation: (result.conversationRows ?? []).map((row) => ({
        conversationId: row.conversationId,
        conversationTitle: row.conversationTitle,
        conversationType: row.conversationType,
        groupKind: row.groupKind,
        logicalBytes: this.databaseNumber(row.logicalBytes),
        itemCount: this.databaseNumber(row.itemCount),
      })),
      largestFiles,
      privacyNotice:
        'Storage details include only conversations and files currently visible to this authenticated account.',
    };
  }

  async getConversationStorageUsage(
    user: AuthenticatedUser,
    conversationId: string,
    limit: number,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            accountId: user.accountId,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
        title: true,
        type: true,
        groupKind: true,
        participants: {
          where: {
            accountId: user.accountId,
            leftAt: null,
          },
          take: 1,
          select: {
            accountId: true,
            role: true,
          },
        },
      },
    });

    // Return a generic 404 so unauthorized users cannot confirm a conversation exists.
    const viewerParticipant = conversation?.participants.find(
      (participant) => participant.accountId === user.accountId,
    );

    if (!conversation || !viewerParticipant) {
      throw new NotFoundException('Conversation was not found.');
    }

    const [result, privatePeer] = await Promise.all([
      this.queryConversationStorage(user.accountId, conversationId, limit),
      conversation.type === ConversationType.PRIVATE
        ? this.prisma.conversationParticipant.findFirst({
            where: {
              conversationId,
              accountId: {
                not: user.accountId,
              },
              leftAt: null,
            },
            select: {
              account: {
                select: {
                  username: true,
                  employee: {
                    select: {
                      empName: true,
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve(null),
    ]);
    const categories = this.buildCategories(result.categoryRows);
    const largestFiles = await this.buildLargestFiles(
      result.largestFileRows,
      user.accountId,
    );
    const participantRole = viewerParticipant.role;
    const conversationTitle =
      conversation.title ??
      privatePeer?.account.employee?.empName ??
      privatePeer?.account.username ??
      null;

    return {
      scope: 'CONVERSATION' as const,
      generatedAt: new Date().toISOString(),
      conversation: {
        id: conversation.id,
        title: conversationTitle,
        type: conversation.type,
        groupKind: conversation.groupKind,
        participantRole,
        canManageGroup:
          conversation.type === ConversationType.GROUP &&
          (participantRole === ConversationParticipantRole.OWNER ||
            participantRole === ConversationParticipantRole.ADMIN),
      },
      totals: {
        logicalVisibleBytes: categories.reduce(
          (total, category) => total + category.logicalBytes,
          0,
        ),
        logicalItemCount: categories.reduce(
          (total, category) => total + category.itemCount,
          0,
        ),
      },
      categories,
      largestFiles,
      privacyNotice:
        conversation.type === ConversationType.PRIVATE
          ? 'Private storage details are available only to active participants and are never exposed through management monitoring.'
          : 'Group storage details are available only to active group participants.',
    };
  }

  async lockStorageKeys(
    transaction: Prisma.TransactionClient,
    storageKeys: readonly string[],
  ): Promise<void> {
    const uniqueStorageKeys = [...new Set(storageKeys)].sort();

    for (const storageKey of uniqueStorageKeys) {
      /*
       * A transaction-scoped advisory lock serializes forwarding and final
       * reference removal across application instances without exposing keys.
       */
      await transaction.$queryRawUnsafe<Array<{ lockResult: string | null }>>(
        // PostgreSQL exposes pg_advisory_xact_lock() as void. Prisma 7's
        // pg adapter cannot deserialize void raw-query columns, so cast the
        // side-effect result to text while retaining the transaction lock.
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS "lockResult"',
        storageKey,
      );
    }
  }

  async assertAttachmentReferencesAvailable(
    transaction: Prisma.TransactionClient,
    attachmentIds: readonly string[],
  ): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }

    const availableCount = await transaction.messageAttachment.count({
      where: {
        id: {
          in: [...attachmentIds],
        },
        message: {
          deletedAt: null,
        },
      },
    });

    // Revalidation happens after the advisory locks to close the delete/forward race.
    if (availableCount !== attachmentIds.length) {
      throw new ConflictException(
        'One or more attachment references changed. Refresh and try again.',
      );
    }
  }

  async removeDeletedMessageAttachmentReferences(
    transaction: Prisma.TransactionClient,
    messageId: string,
    storageKeys: readonly string[],
  ): Promise<string[]> {
    const uniqueStorageKeys = [...new Set(storageKeys)];

    if (uniqueStorageKeys.length === 0) {
      return [];
    }

    await this.lockStorageKeys(transaction, uniqueStorageKeys);

    // Delete the logical references only after the canonical message is marked deleted.
    await transaction.messageAttachment.deleteMany({
      where: {
        messageId,
      },
    });

    const unreferencedStorageKeys: string[] = [];

    for (const storageKey of uniqueStorageKeys) {
      const activeReferenceCount = await transaction.messageAttachment.count({
        where: {
          storageKey,
          message: {
            deletedAt: null,
          },
        },
      });

      if (activeReferenceCount > 0) {
        continue;
      }

      // Remove legacy soft-deleted references before deleting the last physical object.
      await transaction.messageAttachment.deleteMany({
        where: {
          storageKey,
          message: {
            deletedAt: {
              not: null,
            },
          },
        },
      });

      const remainingReferenceCount = await transaction.messageAttachment.count(
        {
          where: {
            storageKey,
          },
        },
      );

      if (remainingReferenceCount === 0) {
        unreferencedStorageKeys.push(storageKey);
      }
    }

    return unreferencedStorageKeys;
  }

  async deletePhysicalStorageObjects(
    storageKeys: readonly string[],
  ): Promise<void> {
    for (const storageKey of [...new Set(storageKeys)]) {
      try {
        await fs.unlink(this.resolveAttachmentPath(storageKey));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // Missing files are already physically absent, so cleanup remains idempotent.
          continue;
        }

        // Message deletion remains authoritative even if infrastructure cleanup needs retrying.
        this.logger.error(
          'An unreferenced message attachment could not be removed from storage.',
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }
}
