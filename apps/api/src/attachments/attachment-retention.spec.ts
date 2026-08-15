import {
  getAnnouncementAttachmentExpiresAt,
  getAnnouncementAttachmentRetentionDays,
  getMessageAttachmentExpiresAt,
  getMessageAttachmentRetentionDays,
  isAttachmentReferenceExpired,
} from './attachment-retention';

const RETENTION_ENV_NAMES = [
  'MESSAGE_PRIVATE_ATTACHMENT_RETENTION_DAYS',
  'MESSAGE_PERSONAL_GROUP_ATTACHMENT_RETENTION_DAYS',
  'MESSAGE_OFFICIAL_GROUP_ATTACHMENT_RETENTION_DAYS',
  'ANNOUNCEMENT_ATTACHMENT_RETENTION_DAYS',
] as const;

describe('attachment retention policy', () => {
  const originalValues = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of RETENTION_ENV_NAMES) {
      originalValues.set(name, process.env[name]);
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of RETENTION_ENV_NAMES) {
      const originalValue = originalValues.get(name);

      if (originalValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalValue;
      }
    }
  });

  it('uses the finalized NT Message default retention windows', () => {
    expect(getMessageAttachmentRetentionDays('PRIVATE', null)).toBe(90);
    expect(getMessageAttachmentRetentionDays('GROUP', 'PERSONAL')).toBe(30);
    expect(getMessageAttachmentRetentionDays('GROUP', 'OFFICIAL')).toBe(30);
    expect(getAnnouncementAttachmentRetentionDays()).toBe(90);
  });

  it('allows deployment configuration to change retention without code changes', () => {
    process.env.MESSAGE_PRIVATE_ATTACHMENT_RETENTION_DAYS = '60';
    process.env.MESSAGE_PERSONAL_GROUP_ATTACHMENT_RETENTION_DAYS = '20';
    process.env.MESSAGE_OFFICIAL_GROUP_ATTACHMENT_RETENTION_DAYS = '25';
    process.env.ANNOUNCEMENT_ATTACHMENT_RETENTION_DAYS = '45';

    expect(getMessageAttachmentRetentionDays('PRIVATE', null)).toBe(60);
    expect(getMessageAttachmentRetentionDays('GROUP', 'PERSONAL')).toBe(20);
    expect(getMessageAttachmentRetentionDays('GROUP', 'OFFICIAL')).toBe(25);
    expect(getAnnouncementAttachmentRetentionDays()).toBe(45);
  });

  it('falls back to approved defaults for unsafe configuration', () => {
    process.env.MESSAGE_PRIVATE_ATTACHMENT_RETENTION_DAYS = '0';
    process.env.MESSAGE_PERSONAL_GROUP_ATTACHMENT_RETENTION_DAYS = '-1';
    process.env.MESSAGE_OFFICIAL_GROUP_ATTACHMENT_RETENTION_DAYS = 'abc';
    process.env.ANNOUNCEMENT_ATTACHMENT_RETENTION_DAYS = '999999';

    expect(getMessageAttachmentRetentionDays('PRIVATE', null)).toBe(90);
    expect(getMessageAttachmentRetentionDays('GROUP', 'PERSONAL')).toBe(30);
    expect(getMessageAttachmentRetentionDays('GROUP', 'OFFICIAL')).toBe(30);
    expect(getAnnouncementAttachmentRetentionDays()).toBe(90);
  });

  it('starts each forwarded/reference retention clock from the new reference time', () => {
    const forwardedAt = new Date('2026-03-25T10:00:00.000Z');

    expect(
      getMessageAttachmentExpiresAt('GROUP', 'PERSONAL', forwardedAt),
    ).toEqual(new Date('2026-04-24T10:00:00.000Z'));
  });

  it('recognizes expired logical references without requiring physical deletion', () => {
    const now = new Date('2026-08-15T00:00:00.000Z');

    expect(
      isAttachmentReferenceExpired(
        new Date('2026-08-14T23:59:59.000Z'),
        null,
        now,
      ),
    ).toBe(true);
    expect(
      isAttachmentReferenceExpired(
        new Date('2026-08-16T00:00:00.000Z'),
        null,
        now,
      ),
    ).toBe(false);
    expect(
      isAttachmentReferenceExpired(
        getAnnouncementAttachmentExpiresAt(
          new Date('2026-08-15T00:00:00.000Z'),
        ),
        new Date('2026-08-15T01:00:00.000Z'),
        now,
      ),
    ).toBe(true);
  });
});
