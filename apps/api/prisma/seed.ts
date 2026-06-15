import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  AccountRole,
  PrismaClient,
} from "../src/generated/prisma/client";

/*
 * Load environment variables from:
 *
 * nt-message/.env
 *
 * This script normally runs from apps/api, so ../../.env
 * points back to the root project folder.
 */
config({
  path: resolve(process.cwd(), "../../.env"),
});

/*
 * Read a required environment variable.
 *
 * This function guarantees that the returned value is a string.
 * If the variable is missing or empty, the seed stops immediately.
 */
function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing or empty.`);
  }

  return value;
}

const connectionString =
  getRequiredEnvironmentVariable("DATABASE_URL");

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
  const existingAdmin = await prisma.account.findUnique({
    where: {
      username: adminUsername,
    },
  });

  if (existingAdmin) {
    console.log(
      `Admin account "${adminUsername}" already exists.`,
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
      role: AccountRole.ADMIN,
      passwordHash,
      isEnabled: true,
    },
  });

  console.log(
    `Admin account "${adminUsername}" created successfully.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
