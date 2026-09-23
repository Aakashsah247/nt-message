import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client';
import { AttachmentStorageService } from '../src/attachments/attachment-storage.service';
import {
  MESSAGE_ATTACHMENT_SECURITY_VERSION,
  MessageAttachmentContentSecurity,
  type MessageAttachmentSecurityContext,
  type StoredMessageAttachmentSecurityFields,
} from '../src/conversations/message-attachment-content-security';

config({ path: '../../.env' });

type AttachmentRow = {
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
  purgedAt: Date | null;
};

function context(row: AttachmentRow, storageKey = row.storageKey): MessageAttachmentSecurityContext {
  return {
    id: row.id,
    messageId: row.messageId,
    storageKey,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    contentType: row.contentType,
  };
}

function fields(row: AttachmentRow): StoredMessageAttachmentSecurityFields {
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

function secureStorageKey(oldKey: string): string {
  const normalized = oldKey.replace(/\\/g, '/');
  const directory = path.posix.dirname(normalized);
  const name = `${randomUUID()}.secure`;
  return directory === '.' ? name : `${directory}/${name}`;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const storage = new AttachmentStorageService();
  const security = new MessageAttachmentContentSecurity(process.env);

  try {
    const pending = await prisma.messageAttachment.findMany({
      where: { contentSecurityVersion: 0, purgedAt: null },
      select: { storageKey: true },
      distinct: ['storageKey'],
      orderBy: { storageKey: 'asc' },
    });

    console.log(`Attachment security backfill: ${pending.length} legacy physical object(s) pending.`);

    let convertedObjects = 0;
    let convertedReferences = 0;

    for (const pendingObject of pending) {
      const references = (await prisma.messageAttachment.findMany({
        where: { storageKey: pendingObject.storageKey, purgedAt: null },
        orderBy: { id: 'asc' },
      })) as AttachmentRow[];

      if (references.length === 0) continue;

      const protectedReference = references.find(
        (row) => row.contentSecurityVersion === MESSAGE_ATTACHMENT_SECURITY_VERSION,
      );

      if (protectedReference) {
        const stored = await storage.readFile('messages', protectedReference.storageKey);
        const plaintext = security.unprotectBuffer(
          stored,
          context(protectedReference),
          fields(protectedReference),
        );
        plaintext.fill(0);

        const shared = fields(protectedReference);
        for (const row of references.filter((item) => item.contentSecurityVersion === 0)) {
          const signed = security.signExistingProtectedReference(context(row), {
            contentSecurityVersion: shared.contentSecurityVersion,
            contentEncryptionKeyVersion: shared.contentEncryptionKeyVersion,
            contentEncryptionIv: shared.contentEncryptionIv,
            contentEncryptionTag: shared.contentEncryptionTag,
            contentSignatureKeyVersion: shared.contentSignatureKeyVersion,
            ciphertextSha256: shared.ciphertextSha256,
            encryptedSizeBytes: shared.encryptedSizeBytes,
          });
          await prisma.messageAttachment.update({
            where: { id: row.id },
            data: signed,
          });
          convertedReferences += 1;
        }
        continue;
      }

      const plaintext = await storage.readFile('messages', pendingObject.storageKey);
      const newStorageKey = secureStorageKey(pendingObject.storageKey);
      const first = references[0];
      if (!first) continue;

      const protectedContent = security.protectBuffer(
        plaintext,
        context(first, newStorageKey),
      );
      plaintext.fill(0);

      await storage.writeFile(
        'messages',
        newStorageKey,
        protectedContent.ciphertext,
        'application/octet-stream',
      );

      try {
        await prisma.$transaction(async (tx) => {
          const shared = protectedContent.fields;
          for (const row of references) {
            const signed =
              row.id === first.id
                ? shared
                : security.signExistingProtectedReference(context(row, newStorageKey), {
                    contentSecurityVersion: shared.contentSecurityVersion,
                    contentEncryptionKeyVersion: shared.contentEncryptionKeyVersion,
                    contentEncryptionIv: shared.contentEncryptionIv,
                    contentEncryptionTag: shared.contentEncryptionTag,
                    contentSignatureKeyVersion: shared.contentSignatureKeyVersion,
                    ciphertextSha256: shared.ciphertextSha256,
                    encryptedSizeBytes: shared.encryptedSizeBytes,
                  });

            await tx.messageAttachment.update({
              where: { id: row.id },
              data: {
                storageKey: newStorageKey,
                ...signed,
              },
            });
          }
        });
      } catch (error) {
        await storage.deleteFile('messages', newStorageKey).catch(() => false);
        throw error;
      }

      const remainingOldReferences = await prisma.messageAttachment.count({
        where: { storageKey: pendingObject.storageKey, purgedAt: null },
      });
      if (remainingOldReferences === 0) {
        await storage.deleteFile('messages', pendingObject.storageKey);
      }

      convertedObjects += 1;
      convertedReferences += references.length;
      console.log(
        `Protected attachment object ${convertedObjects}/${pending.length}: ${references.length} reference(s).`,
      );
    }

    const remaining = await prisma.messageAttachment.count({
      where: { contentSecurityVersion: 0, purgedAt: null },
    });

    if (remaining !== 0) {
      throw new Error(`${remaining} active legacy attachment reference(s) remain after backfill.`);
    }

    console.log(
      `Attachment security backfill complete: ${convertedObjects} physical object(s), ${convertedReferences} reference(s) upgraded; 0 active legacy references remain.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Attachment security backfill failed:',
    error instanceof Error ? error : String(error),
  );
  process.exitCode = 1;
});
