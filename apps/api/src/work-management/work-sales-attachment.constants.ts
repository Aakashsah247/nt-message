export const MAX_WORK_SALES_ATTACHMENT_FILES = 5;
export const MAX_WORK_SALES_ATTACHMENT_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_WORK_SALES_ATTACHMENT_TOTAL_BYTES = 50 * 1024 * 1024;

export const WORK_SALES_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);
