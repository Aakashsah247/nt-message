export type OrganizationEffectiveStatus =
  | "CURRENT"
  | "UPCOMING"
  | "HISTORY";

export function toOptionalOrganizationIso(
  value: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function normalizeOrganizationReason(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getOrganizationScopeKey(
  orgUnitId: string | null,
): string {
  return orgUnitId ?? "__OFFICE__";
}

export function getOrganizationEffectiveStatus(
  effectiveFrom: string,
  effectiveUntil: string | null,
  now = Date.now(),
): OrganizationEffectiveStatus {
  const startsAt = new Date(effectiveFrom).getTime();
  const endsAt = effectiveUntil ? new Date(effectiveUntil).getTime() : null;

  if (Number.isFinite(startsAt) && startsAt > now) {
    return "UPCOMING";
  }

  if (endsAt !== null && Number.isFinite(endsAt) && endsAt <= now) {
    return "HISTORY";
  }

  return "CURRENT";
}
