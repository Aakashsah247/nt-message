import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { from, type Observable } from 'rxjs';
import { concatMap, dematerialize, map, materialize } from 'rxjs/operators';

import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';

interface AttachmentUploadRequest {
  file?: UploadedMessageAttachmentFile;
  files?:
    | UploadedMessageAttachmentFile[]
    | Record<string, UploadedMessageAttachmentFile[]>;
}

/**
 * Removes request-scoped temporary upload files after the controller handler
 * finishes, including validation/scanner failures and idempotent early returns.
 */
@Injectable()
export class AttachmentTempCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AttachmentUploadRequest>();

    return next.handle().pipe(
      // `finalize` cannot await an async callback. Materializing the terminal
      // notification lets request completion/error wait for temp-file cleanup.
      materialize(),
      concatMap((notification) => {
        if (notification.kind === 'N') return [notification];

        return from(this.cleanupFiles(request)).pipe(
          map(() => notification),
        );
      }),
      dematerialize(),
    );
  }

  private async cleanupFiles(request: AttachmentUploadRequest): Promise<void> {
    const files = this.collectFiles(request);
    await Promise.all(
      files.map(async (file) => {
        if (!file.path) return;
        const tempPath = file.path;
        delete file.path;
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
      }),
    );
  }

  private collectFiles(
    request: AttachmentUploadRequest,
  ): UploadedMessageAttachmentFile[] {
    const collected: UploadedMessageAttachmentFile[] = [];
    if (request.file) collected.push(request.file);

    if (Array.isArray(request.files)) {
      collected.push(...request.files);
    } else if (request.files) {
      for (const files of Object.values(request.files)) {
        collected.push(...files);
      }
    }

    return collected;
  }
}
