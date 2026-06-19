import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  AccountRole,
  PrismaClient,
} from "../src/generated/prisma/client";

config({
  path: resolve(process.cwd(), "../../.env"),
});

function getRequiredEnvironmentVariable(
  name: string,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing or empty.`,
    );
  }

  return value;
}

const connectionString =
  getRequiredEnvironmentVariable(
    "DATABASE_URL",
  );

const adminUsername =
  getRequiredEnvironmentVariable(
    "INITIAL_ADMIN_USERNAME",
  ).toLowerCase();

const adminPassword =
  getRequiredEnvironmentVariable(
    "INITIAL_ADMIN_PASSWORD",
  );

if (adminPassword.length < 16) {
  throw new Error(
    "INITIAL_ADMIN_PASSWORD must contain at least 16 characters.",
  );
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main(): Promise<void> {
  const existingAdmin =
    await prisma.account.findUnique({
      where: {
        username: adminUsername,
      },
    });

  if (existingAdmin) {
    await prisma.account.update({
      where: {
        id: existingAdmin.id,
      },
      data: {
        role: AccountRole.SUPER_ADMIN,
        isEnabled: true,
      },
    });

    console.log(
      `Super Admin account "${adminUsername}" updated successfully.`,
    );

    return;
  }

  const passwordHash = await argon2.hash(
    adminPassword,
    {
      type: argon2.argon2id,
    },
  );

  await prisma.account.create({
    data: {
      username: adminUsername,
      role: AccountRole.SUPER_ADMIN,
      passwordHash,
      isEnabled: true,
    },
  });

  console.log(
    `Super Admin account "${adminUsername}" created successfully.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      "Database seed failed:",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });