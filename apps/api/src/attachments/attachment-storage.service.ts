import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import { resolveAttachmentUploadTempRoot } from './attachment-upload-temp-storage';

export type AttachmentStorageNamespace = 'messages' | 'announcements';

interface AttachmentStorageRoots {
  messages: string;
  announcements: string;
}

@Injectable()
export class AttachmentStorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentStorageService.name);
  private readonly roots: AttachmentStorageRoots;
  private temporaryCleanupTimer?: NodeJS.Timeout;
  private static readonly TEMP_UPLOAD_MAX_AGE_MS = 60 * 60 * 1000;
  private static readonly TEMP_UPLOAD_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

  constructor() {
    this.roots = this.resolveRoots();
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'production' && !process.env.ATTACHMENT_STORAGE_ROOT?.trim()) {
      throw new Error(
        'ATTACHMENT_STORAGE_ROOT must be configured to an absolute Nepal Telecom managed storage path in production.',
      );
    }

    await Promise.all([
      this.assertStorageHealthy('messages'),
      this.assertStorageHealthy('announcements'),
      this.assertTemporaryStorageHealthy(),
    ]);

    if (process.env.NODE_ENV !== 'test') {
      void this.cleanupTemporaryUploads();
      this.temporaryCleanupTimer = setInterval(() => {
        void this.cleanupTemporaryUploads();
      }, AttachmentStorageService.TEMP_UPLOAD_CLEANUP_INTERVAL_MS);
      this.temporaryCleanupTimer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.temporaryCleanupTimer) {
      clearInterval(this.temporaryCleanupTimer);
    }
  }

  private resolveRoots(): AttachmentStorageRoots {
    const configuredRoot = process.env.ATTACHMENT_STORAGE_ROOT?.trim();

    if (configuredRoot) {
      if (!path.isAbsolute(configuredRoot)) {
        throw new Error('ATTACHMENT_STORAGE_ROOT must be an absolute path.');
      }

      const root = path.resolve(configuredRoot);
      return {
        messages: path.join(root, 'messages'),
        announcements: path.join(root, 'announcements'),
      };
    }

    /*
     * Preserve the existing development paths so current local attachments do
     * not disappear when Phase 2C is applied. Production must use the new root.
     */
    const legacyMessageRoot = path.resolve(
      process.env.MESSAGE_ATTACHMENT_STORAGE_DIR ??
        path.join(process.cwd(), 'storage', 'message-attachments'),
    );

    return {
      messages: legacyMessageRoot,
      announcements: path.resolve(
        process.env.MESSAGE_ATTACHMENT_STORAGE_DIR
          ? path.join(process.env.MESSAGE_ATTACHMENT_STORAGE_DIR, 'announcements')
          : path.join(process.cwd(), 'storage', 'announcement-attachments'),
      ),
    };
  }

  getRoot(namespace: AttachmentStorageNamespace): string {
    return this.roots[namespace];
  }

  resolvePath(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
  ): string {
    const root = this.getRoot(namespace);
    const absolutePath = path.resolve(root, storageKey);
    const relativePath = path.relative(root, absolutePath);

    if (
      !relativePath ||
      relativePath.startsWith(`..${path.sep}`) ||
      relativePath === '..' ||
      path.isAbsolute(relativePath)
    ) {
      throw new ConflictException('An attachment storage reference is invalid.');
    }

    return absolutePath;
  }

  async writeFile(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
    buffer: Buffer,
  ): Promise<void> {
    const absolutePath = this.resolvePath(namespace, storageKey);

    try {
      await fs.mkdir(path.dirname(absolutePath), {
        recursive: true,
        mode: 0o700,
      });
      await fs.writeFile(absolutePath, buffer, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      this.logger.error(
        `Attachment storage write failed (namespace=${namespace}).`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Attachment storage is temporarily unavailable. Please try again.',
      );
    }
  }

  async writeUploadedFile(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
    file: UploadedMessageAttachmentFile,
  ): Promise<void> {
    if (!file.path) {
      if (!file.buffer) {
        throw new ServiceUnavailableException(
          'Attachment upload data is unavailable. Please try again.',
        );
      }
      await this.writeFile(namespace, storageKey, file.buffer);
      return;
    }

    const absolutePath = this.resolvePath(namespace, storageKey);

    try {
      await fs.mkdir(path.dirname(absolutePath), {
        recursive: true,
        mode: 0o700,
      });
      await fs.copyFile(file.path, absolutePath, fsConstants.COPYFILE_EXCL);
      await fs.chmod(absolutePath, 0o600);
    } catch (error) {
      await fs.rm(absolutePath, { force: true }).catch(() => undefined);
      this.logger.error(
        `Attachment storage write failed (namespace=${namespace}).`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Attachment storage is temporarily unavailable. Please try again.',
      );
    }

    // The permanent object is already durable. Temporary-file cleanup is
    // best-effort because the scheduled stale-upload cleanup can retry later.
    await fs.rm(file.path, { force: true }).catch(() => undefined);
    delete file.path;
  }

  async cleanupTemporaryUploads(
    now = new Date(),
    maxAgeMs = AttachmentStorageService.TEMP_UPLOAD_MAX_AGE_MS,
  ): Promise<number> {
    const root = resolveAttachmentUploadTempRoot();
    let entries: Dirent[];

    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      this.logger.warn('Attachment temporary-upload cleanup could not read its private directory.');
      return 0;
    }

    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absolutePath = path.join(root, entry.name);
      try {
        const stat = await fs.stat(absolutePath);
        if (now.getTime() - stat.mtimeMs < maxAgeMs) continue;
        await fs.rm(absolutePath, { force: true });
        removed += 1;
      } catch {
        // Another request or cleanup pass may have already removed the file.
      }
    }

    if (removed > 0) {
      this.logger.log(`Attachment temporary-upload cleanup removed ${removed} stale file(s).`);
    }
    return removed;
  }

  async exists(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
  ): Promise<boolean> {
    try {
      await fs.access(this.resolvePath(namespace, storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
  ): Promise<boolean> {
    try {
      await fs.unlink(this.resolvePath(namespace, storageKey));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return true;
      }

      this.logger.error(
        `Attachment storage deletion failed (namespace=${namespace}).`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  async listDirectories(
    namespace: AttachmentStorageNamespace,
  ): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.getRoot(namespace), {
        withFileTypes: true,
      });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async removeDirectory(
    namespace: AttachmentStorageNamespace,
    directoryKey: string,
  ): Promise<void> {
    const markerPath = this.resolvePath(namespace, `${directoryKey}/.marker`);
    await fs.rm(path.dirname(markerPath), {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }


  private async assertTemporaryStorageHealthy(): Promise<void> {
    const root = resolveAttachmentUploadTempRoot();
    const probePath = path.join(
      root,
      `.nt-message-upload-probe-${randomUUID()}`,
    );

    try {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      await fs.writeFile(probePath, Buffer.from('ok'), {
        flag: 'wx',
        mode: 0o600,
      });
      await fs.unlink(probePath);
    } catch (error) {
      this.logger.error(
        'Attachment temporary storage health check failed.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(
        'Attachment temporary storage is not writable. Check the NTC storage mount and permissions.',
      );
    }
  }

  private async assertStorageHealthy(
    namespace: AttachmentStorageNamespace,
  ): Promise<void> {
    const root = this.getRoot(namespace);
    const probeName = `.nt-message-storage-probe-${randomUUID()}`;
    const probePath = path.join(root, probeName);

    try {
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      await fs.writeFile(probePath, Buffer.from('ok'), {
        flag: 'wx',
        mode: 0o600,
      });
      await fs.unlink(probePath);
    } catch (error) {
      this.logger.error(
        `Attachment storage health check failed (namespace=${namespace}).`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(
        `Attachment storage for ${namespace} is not writable. Check the NTC storage mount and permissions.`,
      );
    }
  }
}
