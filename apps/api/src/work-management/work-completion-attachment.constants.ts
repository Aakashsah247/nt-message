export const MAX_WORK_COMPLETION_ATTACHMENT_FILES = 5;
export const MAX_WORK_COMPLETION_ATTACHMENT_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_WORK_COMPLETION_ATTACHMENT_TOTAL_BYTES = 50 * 1024 * 1024;

// Completion evidence is intentionally limited to visual proof and PDFs.
// This platform-owned rule applies equally to all three Work templates.
export const WORK_COMPLETION_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
