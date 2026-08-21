import { BadRequestException } from '@nestjs/common';
import path from 'node:path';

import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';

const MIME_EXTENSIONS = new Map<string, Set<string>>([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])],
  ['video/mp4', new Set(['.mp4', '.m4v'])],
  ['video/webm', new Set(['.webm'])],
  ['audio/aac', new Set(['.aac'])],
  ['audio/m4a', new Set(['.m4a'])],
  ['audio/mp4', new Set(['.m4a', '.mp4'])],
  ['audio/mpeg', new Set(['.mp3'])],
  ['audio/ogg', new Set(['.ogg', '.oga'])],
  ['audio/wav', new Set(['.wav'])],
  ['audio/webm', new Set(['.webm'])],
  ['audio/x-m4a', new Set(['.m4a'])],
  ['application/pdf', new Set(['.pdf'])],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    new Set(['.docx']),
  ],
  [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    new Set(['.xlsx']),
  ],
  [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    new Set(['.pptx']),
  ],
  ['text/plain', new Set(['.txt'])],
  ['text/csv', new Set(['.csv'])],
  ['application/zip', new Set(['.zip'])],
  ['application/x-zip-compressed', new Set(['.zip'])],
]);

function hasZipSignature(buffer: Buffer): boolean {
  const startsWith = (...bytes: number[]): boolean =>
    bytes.every((byte, index) => buffer[index] === byte);

  return (
    startsWith(0x50, 0x4b, 0x03, 0x04) ||
    startsWith(0x50, 0x4b, 0x05, 0x06) ||
    startsWith(0x50, 0x4b, 0x07, 0x08)
  );
}

/**
 * Validate the browser-declared type against both the file extension and the
 * file signature before the object reaches permanent attachment storage.
 * This is format validation, not a replacement for malware scanning.
 */
export function assertAttachmentFileMatchesDeclaredType(
  file: UploadedMessageAttachmentFile,
): void {
  const buffer = file.buffer;

  if (!buffer || buffer.length === 0 || file.size <= 0) {
    throw new BadRequestException('Attachment file is empty.');
  }

  const expectedExtensions = MIME_EXTENSIONS.get(file.mimetype);

  // The feature-specific service owns the allow-list and size error message.
  if (!expectedExtensions) {
    return;
  }

  const extension = path.extname(file.originalname ?? '').toLowerCase();

  if (extension && !expectedExtensions.has(extension)) {
    throw new BadRequestException(
      'The attachment file extension does not match its declared file type.',
    );
  }

  const startsWith = (...bytes: number[]): boolean =>
    bytes.every((byte, index) => buffer[index] === byte);
  const ascii = (start: number, end: number): string =>
    buffer.subarray(start, end).toString('ascii');
  const firstBytes = buffer.subarray(0, Math.min(buffer.length, 8192));

  let valid = true;

  switch (file.mimetype) {
    case 'image/jpeg':
      valid = startsWith(0xff, 0xd8, 0xff);
      break;
    case 'image/png':
      valid = startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
      break;
    case 'image/webp':
      valid = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
      break;
    case 'video/mp4':
    case 'audio/mp4':
    case 'audio/m4a':
    case 'audio/x-m4a':
      valid = ascii(4, 8) === 'ftyp';
      break;
    case 'video/webm':
    case 'audio/webm':
      valid = startsWith(0x1a, 0x45, 0xdf, 0xa3);
      break;
    case 'audio/mpeg':
      valid =
        ascii(0, 3) === 'ID3' ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
      break;
    case 'audio/aac':
      valid =
        buffer[0] === 0xff &&
        (buffer[1] === 0xf1 || buffer[1] === 0xf9);
      break;
    case 'audio/wav':
      valid = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
      break;
    case 'audio/ogg':
      valid = ascii(0, 4) === 'OggS';
      break;
    case 'application/pdf':
      valid = ascii(0, 5) === '%PDF-';
      break;
    case 'application/zip':
    case 'application/x-zip-compressed':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      valid = hasZipSignature(buffer);
      break;
    case 'text/plain':
    case 'text/csv':
      valid = !firstBytes.includes(0);
      break;
    default:
      valid = false;
  }

  if (!valid) {
    throw new BadRequestException(
      'The attachment content does not match its declared file type.',
    );
  }
}
