import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';

import {
  AccountClass,
  PrismaClient,
} from '../src/generated/prisma/client';
import { ensureDefaultWorkTypeCatalog } from '../src/work-management/default-work-type-catalog';

config({
  path: resolve(process.cwd(), '../../.env'),
});

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error('DATABASE_URL is required to restore default Work Types.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main(): Promise<void> {
  const superAdmin = await prisma.account.findFirst({
    where: {
      accountClass: AccountClass.SUPER_ADMIN,
      isEnabled: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });

  if (!superAdmin) {
    throw new Error(
      'An enabled Super Admin account is required to restore default Work Types.',
    );
  }

  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, code: true, name: true },
  });

  let definitions = 0;
  let drafts = 0;

  for (const office of offices) {
    const result = await prisma.$transaction((tx) =>
      ensureDefaultWorkTypeCatalog(tx, office.id, superAdmin.id),
    );
    definitions += result.createdDefinitions;
    drafts += result.createdDrafts;

    console.log(
      `${office.code} ${office.name}: ${result.createdDefinitions} definitions, ${result.createdDrafts} drafts restored.`,
    );
  }

  console.log(
    `Default Work Type bootstrap complete: ${definitions} definitions, ${drafts} drafts restored across ${offices.length} active Office(s).`,
  );
}

void main()
  .catch((error: unknown) => {
    console.error('Default Work Type bootstrap failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
