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

function getOptionalEnvironmentVariable(
  name: string,
): string | null {
  return process.env[name]?.trim() || null;
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

function normalizeNepalPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const localNumber =
    digits.length === 13 && digits.startsWith("977")
      ? digits.slice(3)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits;

  if (localNumber.length !== 10 || !localNumber.startsWith("9")) {
    throw new Error(
      "SUPER_ADMIN_PHONE must be a valid Nepal mobile number like 98XXXXXXXX or +97798XXXXXXXX.",
    );
  }

  return `+977${localNumber}`;
}

function getPhoneVariants(phoneNumber: string): string[] {
  const localNumber = phoneNumber.replace(/^\+977/, "");

  return [phoneNumber, localNumber, `0${localNumber}`];
}

const connectionString =
  getRequiredEnvironmentVariable(
    "DATABASE_URL",
  );

const superAdminName =
  getRequiredEnvironmentVariable(
    "SUPER_ADMIN_NAME",
  );

const superAdminEmail = normalizeEmail(
  getRequiredEnvironmentVariable(
    "SUPER_ADMIN_EMAIL",
  ),
);

const superAdminPhone = normalizeNepalPhone(
  getRequiredEnvironmentVariable(
    "SUPER_ADMIN_PHONE",
  ),
);

const legacyAdminUsername =
  getOptionalEnvironmentVariable(
    "INITIAL_ADMIN_USERNAME",
  )?.toLowerCase();

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

async function assertSuperAdminIdentityIsUnique(): Promise<void> {
  const duplicateEmployeeEmail = await prisma.employee.findFirst({
    where: {
      officialEmail: {
        equals: superAdminEmail,
        mode: "insensitive",
      },
    },
    select: {
      empName: true,
    },
  });

  if (duplicateEmployeeEmail) {
    throw new Error(
      `SUPER_ADMIN_EMAIL is already assigned to employee "${duplicateEmployeeEmail.empName}".`,
    );
  }

  const duplicateEmployeePhone = await prisma.employee.findFirst({
    where: {
      phoneNumber: {
        in: getPhoneVariants(superAdminPhone),
      },
    },
    select: {
      empName: true,
    },
  });

  if (duplicateEmployeePhone) {
    throw new Error(
      `SUPER_ADMIN_PHONE is already assigned to employee "${duplicateEmployeePhone.empName}".`,
    );
  }
}

async function findSuperAdminAccount() {
  const officialEmailAccount = await prisma.account.findUnique({
    where: {
      username: superAdminEmail,
    },
  });

  if (
    officialEmailAccount &&
    officialEmailAccount.role !== AccountRole.SUPER_ADMIN
  ) {
    throw new Error(
      `SUPER_ADMIN_EMAIL is already used by a non-Super Admin account.`,
    );
  }

  const allSuperAdmins = await prisma.account.findMany({
    where: {
      role: AccountRole.SUPER_ADMIN,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (allSuperAdmins.length > 1) {
    throw new Error(
      "Multiple Super Admin accounts exist. Clean the duplicate account before seeding.",
    );
  }

  const existingSuperAdmin = allSuperAdmins[0] ?? null;

  if (
    officialEmailAccount &&
    existingSuperAdmin &&
    officialEmailAccount.id !== existingSuperAdmin.id
  ) {
    throw new Error(
      "SUPER_ADMIN_EMAIL belongs to a different account than the existing Super Admin.",
    );
  }

  const legacyAccount =
    legacyAdminUsername && legacyAdminUsername !== superAdminEmail
      ? await prisma.account.findUnique({
          where: {
            username: legacyAdminUsername,
          },
        })
      : null;

  if (legacyAccount && legacyAccount.role !== AccountRole.SUPER_ADMIN) {
    throw new Error(
      `INITIAL_ADMIN_USERNAME points to a non-Super Admin account.`,
    );
  }

  if (
    legacyAccount &&
    existingSuperAdmin &&
    legacyAccount.id !== existingSuperAdmin.id
  ) {
    throw new Error(
      "INITIAL_ADMIN_USERNAME belongs to a different account than the existing Super Admin.",
    );
  }

  // Migrate the existing Super Admin account instead of creating a duplicate.
  return officialEmailAccount ?? existingSuperAdmin ?? legacyAccount;
}

async function main(): Promise<void> {
  await assertSuperAdminIdentityIsUnique();

  const existingAdmin = await findSuperAdminAccount();

  if (existingAdmin) {
    await prisma.$transaction([
      prisma.account.update({
        where: {
          id: existingAdmin.id,
        },
        data: {
          username: superAdminEmail,
          role: AccountRole.SUPER_ADMIN,
          isEnabled: true,
        },
      }),

      prisma.superAdminProfile.upsert({
        where: {
          accountId: existingAdmin.id,
        },
        update: {
          fullName: superAdminName,
          email: superAdminEmail,
          phoneNumber: superAdminPhone,
        },
        create: {
          accountId: existingAdmin.id,
          fullName: superAdminName,
          email: superAdminEmail,
          phoneNumber: superAdminPhone,
        },
      }),
    ]);

    console.log(
      `Super Admin account "${superAdminEmail}" updated successfully.`,
    );

    return;
  }

  const passwordHash = await argon2.hash(
    superAdminPassword,
    {
      type: argon2.argon2id,
    },
  );

  await prisma.account.create({
    data: {
      username: superAdminEmail,
      role: AccountRole.SUPER_ADMIN,
      passwordHash,
      isEnabled: true,
      superAdminProfile: {
        create: {
          fullName: superAdminName,
          email: superAdminEmail,
          phoneNumber: superAdminPhone,
        },
      },
    },
  });

  console.log(
    `Super Admin account "${superAdminEmail}" created successfully.`,
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
