import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client';
import { AttachmentStorageService } from '../src/attachments/attachment-storage.service';
import {
  MessageAttachmentContentSecurity,
  type StoredMessageAttachmentSecurityFields,
} from '../src/conversations/message-attachment-content-security';
import {
  MessageContentSecurity,
  type StoredMessageTextSecurityFields,
} from '../src/conversations/message-content-security';

config({ path: '../../.env' });

type AuditableMessage = {
  id: string;
  conversationId: string;
  senderAccountId: string;
  contentType: string;
  textContent: string | null;
  textSecurityVersion: number;
  textEncryptionKeyVersion: number | null;
  textEncryptionIv: string | null;
  textEncryptionTag: string | null;
  textSignatureKeyVersion: number | null;
  textSignature: string | null;
  textSearchTokens: string[];
  sentAt: Date;
  editedAt: Date | null;
};

type TombstoneRow = {
  message_id: string;
  conversation_id: string;
  sender_account_id: string;
  content_type: string;
  text_content: string | null;
  text_security_version: number;
  text_encryption_key_version: number | null;
  text_encryption_iv: string | null;
  text_encryption_tag: string | null;
  text_signature_key_version: number | null;
  text_signature: string | null;
  text_search_tokens: string[];
  sent_at: Date;
  edited_at: Date | null;
};


type AuditableAttachment = {
  id: string;
  messageId: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  contentType: string;
  contentSecurityVersion: number;
  contentEncryptionKeyVersion: number | null;
  contentEncryptionIv: string | null;
  contentEncryptionTag: string | null;
  contentSignatureKeyVersion: number | null;
  contentSignature: string | null;
  ciphertextSha256: string | null;
  encryptedSizeBytes: number | null;
};

function attachmentFields(
  row: AuditableAttachment,
): StoredMessageAttachmentSecurityFields {
  return {
    contentSecurityVersion: row.contentSecurityVersion,
    contentEncryptionKeyVersion: row.contentEncryptionKeyVersion,
    contentEncryptionIv: row.contentEncryptionIv,
    contentEncryptionTag: row.contentEncryptionTag,
    contentSignatureKeyVersion: row.contentSignatureKeyVersion,
    contentSignature: row.contentSignature,
    ciphertextSha256: row.ciphertextSha256,
    encryptedSizeBytes: row.encryptedSizeBytes,
  };
}

function securityFields(row: AuditableMessage): StoredMessageTextSecurityFields {
  return {
    textContent: row.textContent,
    textSecurityVersion: row.textSecurityVersion,
    textEncryptionKeyVersion: row.textEncryptionKeyVersion,
    textEncryptionIv: row.textEncryptionIv,
    textEncryptionTag: row.textEncryptionTag,
    textSignatureKeyVersion: row.textSignatureKeyVersion,
    textSignature: row.textSignature,
    textSearchTokens: row.textSearchTokens,
  };
}

function verifyOne(security: MessageContentSecurity, row: AuditableMessage): void {
  if (row.textContent !== null && row.textSecurityVersion !== 1) {
    throw new Error(`message ${row.id} still contains non-v1 stored text`);
  }

  security.unprotectText(securityFields(row), {
    id: row.id,
    conversationId: row.conversationId,
    senderAccountId: row.senderAccountId,
    contentType: row.contentType,
    sentAt: row.sentAt,
    editedAt: row.editedAt,
  });
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const security = new MessageContentSecurity(process.env);
  const attachmentSecurity = new MessageAttachmentContentSecurity(process.env);
  const attachmentStorage = new AttachmentStorageService();

  try {
    const active = (await prisma.message.findMany({
      select: {
        id: true,
        conversationId: true,
        senderAccountId: true,
        contentType: true,
        textContent: true,
        textSecurityVersion: true,
        textEncryptionKeyVersion: true,
        textEncryptionIv: true,
        textEncryptionTag: true,
        textSignatureKeyVersion: true,
        textSignature: true,
        textSearchTokens: true,
        sentAt: true,
        editedAt: true,
      },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    })) as AuditableMessage[];

    const tombstones = await prisma.$queryRaw<TombstoneRow[]>`
      SELECT
        "message_id",
        "conversation_id",
        "sender_account_id",
        "content_type"::text AS "content_type",
        "text_content",
        "text_security_version",
        "text_encryption_key_version",
        "text_encryption_iv",
        "text_encryption_tag",
        "text_signature_key_version",
        "text_signature",
        "text_search_tokens",
        "sent_at",
        "edited_at"
      FROM "message_security_tombstones"
      ORDER BY "recorded_at" ASC, "message_id" ASC
    `;

    for (const row of active) {
      verifyOne(security, row);
    }

    for (const row of tombstones) {
      verifyOne(security, {
        id: row.message_id,
        conversationId: row.conversation_id,
        senderAccountId: row.sender_account_id,
        contentType: row.content_type,
        textContent: row.text_content,
        textSecurityVersion: row.text_security_version,
        textEncryptionKeyVersion: row.text_encryption_key_version,
        textEncryptionIv: row.text_encryption_iv,
        textEncryptionTag: row.text_encryption_tag,
        textSignatureKeyVersion: row.text_signature_key_version,
        textSignature: row.text_signature,
        textSearchTokens: row.text_search_tokens,
        sentAt: row.sent_at,
        editedAt: row.edited_at,
      });
    }

    const attachments = (await prisma.messageAttachment.findMany({
      where: { purgedAt: null },
      select: {
        id: true,
        messageId: true,
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        fileSizeBytes: true,
        contentType: true,
        contentSecurityVersion: true,
        contentEncryptionKeyVersion: true,
        contentEncryptionIv: true,
        contentEncryptionTag: true,
        contentSignatureKeyVersion: true,
        contentSignature: true,
        ciphertextSha256: true,
        encryptedSizeBytes: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })) as AuditableAttachment[];

    for (const row of attachments) {
      if (row.contentSecurityVersion !== 1) {
        throw new Error(`attachment ${row.id} still uses legacy content security`);
      }
      const stored = await attachmentStorage.readFile('messages', row.storageKey);
      const plaintext = attachmentSecurity.unprotectBuffer(
        stored,
        {
          id: row.id,
          messageId: row.messageId,
          storageKey: row.storageKey,
          originalFileName: row.originalFileName,
          mimeType: row.mimeType,
          fileSizeBytes: row.fileSizeBytes,
          contentType: row.contentType,
        },
        attachmentFields(row),
      );
      plaintext.fill(0);
    }

    console.log(
      `Message security audit passed: ${active.length} active message row(s), ${tombstones.length} deletion tombstone(s), ${attachments.length} protected attachment reference(s), 0 integrity failures.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Message security audit failed:',
    error instanceof Error ? error : String(error),
  );
  process.exitCode = 1;
});
