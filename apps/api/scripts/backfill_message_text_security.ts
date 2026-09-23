import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';

import { PrismaClient } from '../src/generated/prisma/client';
import { MessageContentSecurity } from '../src/conversations/message-content-security';

config({
  path: resolve(process.cwd(), '../../.env'),
});

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error('DATABASE_URL is required to backfill message security.');
}

const BATCH_SIZE = 200;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const security = new MessageContentSecurity(process.env);

async function main(): Promise<void> {
  const before = await prisma.message.count({
    where: {
      textContent: { not: null },
      textSecurityVersion: { not: 1 },
    },
  });

  console.log(`Message security backfill: ${before} plaintext row(s) pending.`);

  let converted = 0;

  while (true) {
    const rows = await prisma.message.findMany({
      where: {
        textContent: { not: null },
        textSecurityVersion: { not: 1 },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        conversationId: true,
        senderAccountId: true,
        contentType: true,
        textContent: true,
        sentAt: true,
        editedAt: true,
        textSecurityVersion: true,
      },
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      if (row.textContent === null) {
        continue;
      }

      const secured = security.protectText(row.textContent, {
        id: row.id,
        conversationId: row.conversationId,
        senderAccountId: row.senderAccountId,
        contentType: row.contentType,
        sentAt: row.sentAt,
        editedAt: row.editedAt,
      });

      const result = await prisma.message.updateMany({
        where: {
          id: row.id,
          textSecurityVersion: row.textSecurityVersion,
        },
        data: secured,
      });

      if (result.count === 1) {
        converted += 1;
      }
    }

    console.log(`Message security backfill: ${converted}/${before} converted.`);
  }

  const remaining = await prisma.message.count({
    where: {
      textContent: { not: null },
      textSecurityVersion: { not: 1 },
    },
  });

  const protectedCount = await prisma.message.count({
    where: {
      textContent: { not: null },
      textSecurityVersion: 1,
    },
  });

  if (remaining !== 0) {
    throw new Error(
      `Message security backfill incomplete: ${remaining} plaintext row(s) remain.`,
    );
  }

  console.log(
    `Message security backfill complete: ${converted} converted in this run; ${protectedCount} protected text row(s) total; 0 plaintext rows remain.`,
  );
}

void main()
  .catch((error: unknown) => {
    console.error('Message security backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
