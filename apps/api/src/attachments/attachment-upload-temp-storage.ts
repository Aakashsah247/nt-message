import { PayloadTooLargeException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs, createWriteStream } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';

const aggregateUploadBytes = Symbol('attachmentAggregateUploadBytes');
const FILE_SIGNATURE_PREVIEW_BYTES = 8192;
const DEFAULT_AGGREGATE_LIMIT_MESSAGE =
  'Attachments in one message must total 250 MB or smaller.';

interface AggregateUploadRequest extends IncomingMessage {
  [aggregateUploadBytes]?: number;
}

interface IncomingAttachmentFile {
  stream: Readable;
}

interface StoredAttachmentFile {
  path?: string;
  buffer?: Buffer;
  size?: number;
}

type StorageCallback = (
  error: Error | null,
  file?: { path: string; buffer: Buffer; size: number },
) => void;

export function resolveAttachmentUploadTempRoot(): string {
  const configured = process.env.ATTACHMENT_UPLOAD_TEMP_DIR?.trim();

  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error('ATTACHMENT_UPLOAD_TEMP_DIR must be an absolute path.');
    }
    return path.resolve(configured);
  }

  const storageRoot = process.env.ATTACHMENT_STORAGE_ROOT?.trim();
  if (storageRoot && path.isAbsolute(storageRoot)) {
    return path.join(path.resolve(storageRoot), '.incoming');
  }

  // Development uploads stay outside the JavaScript heap while remaining local.
  return path.join(os.tmpdir(), 'nt-message-attachment-uploads');
}

/**
 * Multer storage engine that streams attachment bytes to a private temporary
 * file instead of buffering an entire multi-file request in the NestJS heap.
 * Only the first 8 KiB is retained in memory for file-signature validation.
 */
export function createBoundedAttachmentTempStorage(
  maxTotalBytes: number,
  aggregateLimitMessage: string = DEFAULT_AGGREGATE_LIMIT_MESSAGE,
) {
  return {
    async _handleFile(
      request: AggregateUploadRequest,
      file: IncomingAttachmentFile,
      callback: StorageCallback,
    ): Promise<void> {
      const tempRoot = resolveAttachmentUploadTempRoot();
      const tempPath = path.join(tempRoot, randomUUID());
      const previewChunks: Buffer[] = [];
      let previewBytes = 0;
      let fileBytes = 0;
      let settled = false;

      try {
        await fs.mkdir(tempRoot, { recursive: true, mode: 0o700 });
      } catch {
        callback(new Error('Attachment temporary storage is unavailable.'));
        file.stream.resume();
        return;
      }

      const output = createWriteStream(tempPath, {
        flags: 'wx',
        mode: 0o600,
      });

      const cleanupAndFail = (error: Error): void => {
        if (settled) return;
        settled = true;
        file.stream.unpipe(output);
        file.stream.resume();
        output.destroy();
        void fs.rm(tempPath, { force: true }).finally(() => callback(error));
      };

      file.stream.on('data', (value: Buffer | string) => {
        if (settled) return;

        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        const currentTotal = request[aggregateUploadBytes] ?? 0;
        const nextTotal = currentTotal + chunk.length;

        if (nextTotal > maxTotalBytes) {
          cleanupAndFail(
            new PayloadTooLargeException(
              aggregateLimitMessage,
            ),
          );
          return;
        }

        request[aggregateUploadBytes] = nextTotal;
        fileBytes += chunk.length;

        if (previewBytes < FILE_SIGNATURE_PREVIEW_BYTES) {
          const remaining = FILE_SIGNATURE_PREVIEW_BYTES - previewBytes;
          const preview = chunk.subarray(0, Math.min(chunk.length, remaining));
          previewChunks.push(preview);
          previewBytes += preview.length;
        }
      });

      file.stream.once('error', cleanupAndFail);
      output.once('error', cleanupAndFail);
      output.once('finish', () => {
        if (settled) return;
        settled = true;
        callback(null, {
          path: tempPath,
          buffer: Buffer.concat(previewChunks, previewBytes),
          size: fileBytes,
        });
      });

      file.stream.pipe(output);
    },

    _removeFile(
      _request: AggregateUploadRequest,
      file: StoredAttachmentFile,
      callback: (error: Error | null) => void,
    ): void {
      const tempPath = file.path;
      delete file.path;
      delete file.buffer;
      delete file.size;

      if (!tempPath) {
        callback(null);
        return;
      }

      void fs
        .rm(tempPath, { force: true })
        .then(() => callback(null))
        .catch((error: Error) => callback(error));
    },
  };
}
