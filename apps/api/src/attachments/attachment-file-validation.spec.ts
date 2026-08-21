import { BadRequestException } from '@nestjs/common';

import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import { assertAttachmentFileMatchesDeclaredType } from './attachment-file-validation';

function file(
  originalname: string,
  mimetype: string,
  buffer: Buffer,
): UploadedMessageAttachmentFile {
  return { originalname, mimetype, buffer, size: buffer.length };
}

describe('attachment file validation', () => {
  it('accepts a PNG whose extension, MIME type and signature agree', () => {
    expect(() =>
      assertAttachmentFileMatchesDeclaredType(
        file(
          'field-photo.png',
          'image/png',
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ),
      ),
    ).not.toThrow();
  });

  it('rejects a disguised image whose content signature is not PNG', () => {
    expect(() =>
      assertAttachmentFileMatchesDeclaredType(
        file('field-photo.png', 'image/png', Buffer.from('not-a-png')),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a mismatched extension before permanent storage', () => {
    expect(() =>
      assertAttachmentFileMatchesDeclaredType(
        file('report.exe', 'application/pdf', Buffer.from('%PDF-1.7')),
      ),
    ).toThrow('file extension does not match');
  });

  it('accepts browser WebM voice-note signatures', () => {
    expect(() =>
      assertAttachmentFileMatchesDeclaredType(
        file(
          'voice-note.webm',
          'audio/webm',
          Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
        ),
      ),
    ).not.toThrow();
  });
});
