const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_PRIVATE_DAYS = 90;
const DEFAULT_PERSONAL_GROUP_DAYS = 30;
const DEFAULT_OFFICIAL_GROUP_DAYS = 30;
const DEFAULT_ANNOUNCEMENT_DAYS = 90;
const MAX_RETENTION_DAYS = 3650;

function readRetentionDays(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  // Invalid deployment configuration must never create a zero-day or negative
  // retention window. Fall back to the approved NT Message default instead.
  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    parsed > MAX_RETENTION_DAYS
  ) {
    return fallback;
  }

  return parsed;
}

export function getMessageAttachmentRetentionDays(
  conversationType: string,
  groupKind: string | null,
): number {
  if (conversationType === 'PRIVATE') {
    return readRetentionDays(
      'MESSAGE_PRIVATE_ATTACHMENT_RETENTION_DAYS',
      DEFAULT_PRIVATE_DAYS,
    );
  }

  if (groupKind === 'OFFICIAL') {
    return readRetentionDays(
      'MESSAGE_OFFICIAL_GROUP_ATTACHMENT_RETENTION_DAYS',
      DEFAULT_OFFICIAL_GROUP_DAYS,
    );
  }

  return readRetentionDays(
    'MESSAGE_PERSONAL_GROUP_ATTACHMENT_RETENTION_DAYS',
    DEFAULT_PERSONAL_GROUP_DAYS,
  );
}

export function getMessageAttachmentExpiresAt(
  conversationType: string,
  groupKind: string | null,
  referenceCreatedAt: Date,
): Date {
  return new Date(
    referenceCreatedAt.getTime() +
      getMessageAttachmentRetentionDays(conversationType, groupKind) * DAY_MS,
  );
}

export function getAnnouncementAttachmentRetentionDays(): number {
  return readRetentionDays(
    'ANNOUNCEMENT_ATTACHMENT_RETENTION_DAYS',
    DEFAULT_ANNOUNCEMENT_DAYS,
  );
}

export function getAnnouncementAttachmentExpiresAt(
  referenceCreatedAt: Date,
): Date {
  return new Date(
    referenceCreatedAt.getTime() +
      getAnnouncementAttachmentRetentionDays() * DAY_MS,
  );
}

export function isAttachmentReferenceExpired(
  expiresAt: Date | string | null | undefined,
  expiredAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (expiredAt) {
    return true;
  }

  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= now.getTime();
}
