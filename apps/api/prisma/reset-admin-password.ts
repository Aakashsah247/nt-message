import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";

config({
  path: resolve(process.cwd(), "../../.env"),
  quiet: true,
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
  const account =
    await prisma.account.findUnique({
      where: {
        username: adminUsername,
      },
    });

  if (!account) {
    throw new Error(
      `Admin account "${adminUsername}" does not exist.`,
    );
  }

  const passwordHash =
    await argon2.hash(
      adminPassword,
      {
        type: argon2.argon2id,
      },
    );

  const now = new Date();

  await prisma.$transaction([
    prisma.account.update({
      where: {
        id: account.id,
      },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: now,
      },
    }),

    /*
     * Revoke existing login sessions after a
     * password reset.
     */
    prisma.authSession.updateMany({
      where: {
        accountId: account.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    }),
  ]);

  console.log(
    `Password for admin "${adminUsername}" reset successfully.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      "Admin password reset failed:",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
