import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import net from 'node:net';
import { Readable } from 'node:stream';

import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';

type AttachmentScanMode = 'disabled' | 'clamav';
export type AcceptedAttachmentScanStatus = 'FORMAT_VALIDATED' | 'CLEAN';

@Injectable()
export class AttachmentSecurityService implements OnModuleInit {
  private readonly scanMode: AttachmentScanMode;
  private readonly clamAvHost: string;
  private readonly clamAvPort: number;
  private readonly clamAvTimeoutMs: number;

  constructor() {
    const configuredMode = process.env.ATTACHMENT_SCAN_MODE
      ?.trim()
      .toLowerCase();
    this.scanMode = configuredMode === 'clamav' ? 'clamav' : 'disabled';
    this.clamAvHost = process.env.CLAMAV_HOST?.trim() || '127.0.0.1';
    this.clamAvPort = this.parsePositiveInteger(process.env.CLAMAV_PORT, 3310);
    this.clamAvTimeoutMs = this.parsePositiveInteger(
      process.env.CLAMAV_TIMEOUT_MS,
      30_000,
    );
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    if (this.scanMode !== 'clamav') {
      throw new Error(
        'ATTACHMENT_SCAN_MODE=clamav is required in production so uploaded files are malware-scanned before use.',
      );
    }

    // Production must fail closed if the approved scanner is not reachable at startup.
    await this.assertClamAvHealthy();
  }

  async scanValidatedUpload(
    file: UploadedMessageAttachmentFile,
  ): Promise<AcceptedAttachmentScanStatus> {
    if (this.scanMode === 'disabled') {
      // Development keeps current behavior explicit without pretending a malware scan occurred.
      return 'FORMAT_VALIDATED';
    }

    await this.scanWithClamAv(file);
    return 'CLEAN';
  }

  isStrictScanMode(): boolean {
    return this.scanMode === 'clamav';
  }

  async scanStoredFile(absolutePath: string): Promise<'CLEAN'> {
    if (this.scanMode !== 'clamav') {
      throw new ServiceUnavailableException(
        'Attachment malware scanning is not enabled.',
      );
    }

    await this.scanStreamWithClamAv(createReadStream(absolutePath));
    return 'CLEAN';
  }

  canAccessStoredAttachment(scanStatus: string): boolean {
    if (scanStatus === 'CLEAN') {
      return true;
    }

    if (this.scanMode === 'disabled') {
      // PENDING is accepted only for legacy local-development rows created before Phase 2C.
      return scanStatus === 'FORMAT_VALIDATED' || scanStatus === 'PENDING';
    }

    return false;
  }

  private parsePositiveInteger(
    value: string | undefined,
    fallback: number,
  ): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async assertClamAvHealthy(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({
        host: this.clamAvHost,
        port: this.clamAvPort,
      });
      let response = '';
      let settled = false;

      const fail = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        reject(
          new Error(
            'The required ClamAV attachment scanner is unavailable. Check the NTC scanner service before starting NT Message.',
          ),
        );
      };

      socket.setTimeout(this.clamAvTimeoutMs, fail);
      socket.on('error', fail);
      socket.on('data', (chunk: Buffer) => {
        response += chunk.toString('utf8');
      });
      socket.on('end', () => {
        if (settled) {
          return;
        }
        settled = true;
        if (/PONG/i.test(response)) {
          resolve();
        } else {
          reject(
            new Error(
              'The required ClamAV attachment scanner did not pass its startup health check.',
            ),
          );
        }
      });
      socket.on('connect', () => {
        socket.end(Buffer.from('zPING\0'));
      });
    });
  }

  private async scanWithClamAv(
    file: UploadedMessageAttachmentFile,
  ): Promise<void> {
    if (file.path) {
      await this.scanStreamWithClamAv(createReadStream(file.path));
      return;
    }

    if (!file.buffer) {
      throw new ServiceUnavailableException(
        'Attachment security scanning could not access the uploaded file.',
      );
    }

    await this.scanStreamWithClamAv(Readable.from([file.buffer]));
  }

  private async scanStreamWithClamAv(stream: Readable): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({
        host: this.clamAvHost,
        port: this.clamAvPort,
      });
      let response = '';
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        stream.destroy();
        socket.destroy();
        reject(error);
      };

      socket.setTimeout(this.clamAvTimeoutMs, () => {
        fail(
          new ServiceUnavailableException(
            'Attachment security scanning timed out. Please try again.',
          ),
        );
      });

      socket.on('error', () => {
        fail(
          new ServiceUnavailableException(
            'Attachment security scanning is temporarily unavailable. Please try again.',
          ),
        );
      });

      stream.on('error', () => {
        fail(
          new ServiceUnavailableException(
            'Attachment security scanning could not read the uploaded file.',
          ),
        );
      });

      socket.on('data', (chunk: Buffer) => {
        response += chunk.toString('utf8');
      });

      socket.on('end', () => {
        if (settled) return;
        settled = true;

        if (/\bFOUND\b/i.test(response)) {
          reject(
            new BadRequestException(
              'The attachment was rejected by the security scanner.',
            ),
          );
          return;
        }

        if (!/\bOK\b/i.test(response)) {
          reject(
            new ServiceUnavailableException(
              'Attachment security scanning could not be completed. Please try again.',
            ),
          );
          return;
        }

        resolve();
      });

      socket.on('connect', () => {
        void (async () => {
          socket.write(Buffer.from('zINSTREAM\0'));
          const chunkSize = 64 * 1024;

          for await (const value of stream) {
            const source = Buffer.isBuffer(value) ? value : Buffer.from(value);
            for (let offset = 0; offset < source.length; offset += chunkSize) {
              const chunk = source.subarray(
                offset,
                Math.min(offset + chunkSize, source.length),
              );
              const length = Buffer.allocUnsafe(4);
              length.writeUInt32BE(chunk.length, 0);
              if (!socket.write(length)) await once(socket, 'drain');
              if (!socket.write(chunk)) await once(socket, 'drain');
            }
          }

          socket.end(Buffer.alloc(4));
        })().catch((error: Error) => fail(error));
      });
    });
  }

}
