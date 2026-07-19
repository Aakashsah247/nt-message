import type { Prisma } from '../generated/prisma/client';

/**
 * Combines recipient visibility with an optional management scope.
 *
 * Employees intentionally have no management scope. Returning the recipient
 * predicate directly keeps UUID columns type-safe and prevents fake sentinel
 * values from ever reaching PostgreSQL.
 */
export function buildAnnouncementVisibilityWhere(
  receivedScope: Prisma.AnnouncementWhereInput,
  managementScope: Prisma.AnnouncementWhereInput | null,
): Prisma.AnnouncementWhereInput {
  if (!managementScope) {
    return receivedScope;
  }

  return {
    OR: [receivedScope, managementScope],
  };
}
