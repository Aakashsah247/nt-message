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

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(
      "SUPER_ADMIN_EMAIL must be a valid official email address.",
    );
  }

  return email;
}

const connectionString =
  getRequiredEnvironmentVariable(
    "DATABASE_URL",
  );

const superAdminEmail = normalizeEmail(
  getRequiredEnvironmentVariable(
    "SUPER_ADMIN_EMAIL",
  ),
);

const superAdminPassword =
  getRequiredEnvironmentVariable(
    "SUPER_ADMIN_INITIAL_PASSWORD",
  );

if (superAdminPassword.length < 16) {
  throw new Error(
    "SUPER_ADMIN_INITIAL_PASSWORD must contain at least 16 characters.",
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
        username: superAdminEmail,
      },
    });

  if (!account) {
    throw new Error(
      `Super Admin account "${superAdminEmail}" does not exist. Run the seed script first.`,
    );
  }

  /*
   * BREAK-GLASS ONLY: this maintenance script intentionally replaces the
   * database password from the protected deployment secret. It must never
   * run during application startup, normal seeding or routine Y31 flows.
   */
  const passwordHash = await argon2.hash(superAdminPassword, {
    type: argon2.argon2id,
  });

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
    `Password for Super Admin "${superAdminEmail}" reset successfully.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      "Super Admin password reset failed:",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
