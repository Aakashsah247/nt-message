import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client';
import { MessageContentSecurity } from '../src/conversations/message-content-security';

config({ path: '../../.env' });

async function main() {
  const messageId = process.argv[2]?.trim();

  if (!messageId) {
    throw new Error('Usage: tsx scripts/decrypt_message_security.ts <message-id>');
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const security = new MessageContentSecurity(process.env);

  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
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
    });

    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const plaintext = security.unprotectText(
      {
        textContent: message.textContent,
        textSecurityVersion: message.textSecurityVersion,
        textEncryptionKeyVersion: message.textEncryptionKeyVersion,
        textEncryptionIv: message.textEncryptionIv,
        textEncryptionTag: message.textEncryptionTag,
        textSignatureKeyVersion: message.textSignatureKeyVersion,
        textSignature: message.textSignature,
        textSearchTokens: message.textSearchTokens,
      },
      {
        id: message.id,
        conversationId: message.conversationId,
        senderAccountId: message.senderAccountId,
        contentType: message.contentType,
        sentAt: message.sentAt,
        editedAt: message.editedAt,
      },
    );

    console.log('');
    console.log('Message ID:', message.id);
    console.log('Security Version:', message.textSecurityVersion);
    console.log('Integrity: VALID');
    console.log('Decrypted message:', plaintext ?? '[no text]');
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Decrypt failed:', error);
  process.exitCode = 1;
});
