import { ConflictException } from '@nestjs/common';

/**
 * WM-V2 rows remain readable during the additive V3 cutover. Database checks
 * guarantee these values for legacy rows; this helper mirrors that invariant
 * at the TypeScript boundary after the shared WorkItem columns become nullable
 * for native V3 Work.
 */
export function requireLegacyWorkValue<T>(
  value: T | null | undefined,
  label: string,
): T {
  if (value === null || value === undefined) {
    throw new ConflictException(
      `Legacy Work record is missing required ${label}.`,
    );
  }
  return value;
}
