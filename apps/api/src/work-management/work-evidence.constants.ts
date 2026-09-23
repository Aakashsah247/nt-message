export const MAX_WORK_EVIDENCE_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_WORK_EVIDENCE_FILES_PER_STAGE = 50;

export const WORK_EVIDENCE_MIME_TYPES = new Set([
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
