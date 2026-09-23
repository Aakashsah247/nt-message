export const WORK_ATTACHMENT_RETENTION_DAYS = 90;
export const WORK_ATTACHMENT_RETENTION_MS =
  WORK_ATTACHMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const WORK_ATTACHMENT_RETENTION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const WORK_ATTACHMENT_RETENTION_CLEANUP_BATCH_SIZE = 100;

export function workAttachmentExpiresAt(terminalAt: Date): Date {
  return new Date(terminalAt.getTime() + WORK_ATTACHMENT_RETENTION_MS);
}
