import { PayloadTooLargeException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';

const aggregateUploadBytes = Symbol('messageAttachmentAggregateUploadBytes');

interface AggregateUploadRequest extends IncomingMessage {
  [aggregateUploadBytes]?: number;
}

interface IncomingAttachmentFile {
  stream: Readable;
}

interface StoredAttachmentFile {
  buffer?: Buffer;
  size?: number;
}

type StorageCallback = (
  error: Error | null,
  file?: { buffer: Buffer; size: number },
) => void;

/**
 * Multer's default memory storage limits each file but not the combined batch.
 * This request-scoped storage engine rejects the stream before a multi-file
 * upload can exceed the allowed aggregate memory budget.
 */
export function createBoundedMessageAttachmentMemoryStorage(
  maxTotalBytes: number,
) {
  return {
    _handleFile(
      request: AggregateUploadRequest,
      file: IncomingAttachmentFile,
      callback: StorageCallback,
    ): void {
      const chunks: Buffer[] = [];
      let fileBytes = 0;
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }

        settled = true;
        chunks.length = 0;
        file.stream.resume();
        callback(error);
      };

      file.stream.on('data', (value: Buffer | string) => {
        if (settled) {
          return;
        }

        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        const currentTotal = request[aggregateUploadBytes] ?? 0;
        const nextTotal = currentTotal + chunk.length;

        if (nextTotal > maxTotalBytes) {
          fail(
            new PayloadTooLargeException(
              'Attachments in one message must total 250 MB or smaller.',
            ),
          );
          return;
        }

        request[aggregateUploadBytes] = nextTotal;
        fileBytes += chunk.length;
        chunks.push(chunk);
      });

      file.stream.once('error', fail);
      file.stream.once('end', () => {
        if (settled) {
          return;
        }

        settled = true;
        callback(null, {
          buffer: Buffer.concat(chunks, fileBytes),
          size: fileBytes,
        });
      });
    },

    _removeFile(
      _request: AggregateUploadRequest,
      file: StoredAttachmentFile,
      callback: (error: Error | null) => void,
    ): void {
      delete file.buffer;
      delete file.size;
      callback(null);
    },
  };
}
