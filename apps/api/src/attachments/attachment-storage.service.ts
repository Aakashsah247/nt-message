import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, constants as fsConstants, promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import { resolveAttachmentUploadTempRoot } from './attachment-upload-temp-storage';

export type AttachmentStorageNamespace =
  | 'messages'
  | 'announcements'
  | 'profile-photos'
  | 'group-photos'
  | 'work';

type AttachmentStorageDriver = 'filesystem' | 'supabase';

interface AttachmentStorageRoots {
  messages: string;
  announcements: string;
  'profile-photos': string;
  'group-photos': string;
  work: string;
}

interface SupabaseStorageConfig {
  baseUrl: string;
  secretKey: string;
  bucket: string;
  signedUrlTtlSeconds: number;
}

interface RemoteStorageErrorPayload {
  message?: unknown;
  error?: unknown;
  statusCode?: unknown;
}

@Injectable()
export class AttachmentStorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentStorageService.name);
  private readonly driver: AttachmentStorageDriver;
  private readonly roots: AttachmentStorageRoots;
  private readonly supabase: SupabaseStorageConfig | null;
  private temporaryCleanupTimer?: NodeJS.Timeout;
  private static readonly TEMP_UPLOAD_MAX_AGE_MS = 60 * 60 * 1000;
  private static readonly TEMP_UPLOAD_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

  constructor() {
    this.driver = this.resolveDriver();
    this.roots = this.resolveRoots();
    this.supabase = this.resolveSupabaseConfig();
  }

  async onModuleInit(): Promise<void> {
    if (this.driver === 'filesystem') {
      if (
        process.env.NODE_ENV === 'production' &&
        !process.env.ATTACHMENT_STORAGE_ROOT?.trim()
      ) {
        throw new Error(
          'ATTACHMENT_STORAGE_ROOT must be configured to an absolute Nepal Telecom managed storage path in production.',
        );
      }

      await Promise.all([
        this.assertStorageHealthy('messages'),
        this.assertStorageHealthy('announcements'),
        this.assertStorageHealthy('profile-photos'),
        this.assertStorageHealthy('group-photos'),
        this.assertStorageHealthy('work'),
      ]);
    } else {
      await this.assertSupabaseStorageHealthy();
    }

    await this.assertTemporaryStorageHealthy();

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

  isFilesystemDriver(): boolean {
    return this.driver === 'filesystem';
  }

  private resolveDriver(): AttachmentStorageDriver {
    const configured =
      process.env.ATTACHMENT_STORAGE_DRIVER?.trim().toLowerCase() ??
      process.env.NT_MESSAGE_STORAGE_DRIVER?.trim().toLowerCase();

    return configured === 'supabase' ? 'supabase' : 'filesystem';
  }

  private resolveSupabaseConfig(): SupabaseStorageConfig | null {
    if (this.driver !== 'supabase') return null;

    const projectUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
    const secretKey =
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
    const parsedTtl = Number(process.env.SUPABASE_SIGNED_URL_TTL_SECONDS);

    if (!projectUrl || !secretKey || !bucket) {
      throw new Error(
        'Supabase storage requires SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), and SUPABASE_STORAGE_BUCKET.',
      );
    }

    return {
      baseUrl: `${projectUrl}/storage/v1`,
      secretKey,
      bucket,
      signedUrlTtlSeconds:
        Number.isInteger(parsedTtl) && parsedTtl >= 30 && parsedTtl <= 3600
          ? parsedTtl
          : 300,
    };
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
        'profile-photos': path.resolve(
          process.env.PROFILE_PHOTO_STORAGE_DIR ?? path.join(root, 'profile-photos'),
        ),
        'group-photos': path.resolve(
          process.env.GROUP_PHOTO_STORAGE_DIR ?? path.join(root, 'group-photos'),
        ),
        work: path.join(root, 'work'),
      };
    }

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
      'profile-photos': path.resolve(
        process.env.PROFILE_PHOTO_STORAGE_DIR ??
          path.join(process.cwd(), 'storage', 'profile-photos'),
      ),
      'group-photos': path.resolve(
        process.env.GROUP_PHOTO_STORAGE_DIR ??
          path.join(process.cwd(), 'storage', 'group-photos'),
      ),
      work: path.resolve(
        process.env.WORK_ATTACHMENT_STORAGE_DIR ??
          path.join(process.cwd(), 'storage', 'work-attachments'),
      ),
    };
  }

  getRoot(namespace: AttachmentStorageNamespace): string {
    return this.roots[namespace];
  }

  resolvePath(namespace: AttachmentStorageNamespace, storageKey: string): string {
    if (this.driver !== 'filesystem') {
      throw new ConflictException(
        'A filesystem path is not available for the configured object-storage driver.',
      );
    }

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

  private normalizeObjectKey(storageKey: string): string {
    const normalized = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/');

    if (
      !normalized ||
      parts.some((part) => !part || part === '.' || part === '..')
    ) {
      throw new ConflictException('An attachment storage reference is invalid.');
    }

    return normalized;
  }

  private objectKey(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
  ): string {
    return `${namespace}/${this.normalizeObjectKey(storageKey)}`;
  }

  private encodeObjectKey(key: string): string {
    return key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  private supabaseHeaders(extra?: Record<string, string>): Record<string, string> {
    const config = this.requireSupabaseConfig();
    return {
      apikey: config.secretKey,
      Authorization: `Bearer ${config.secretKey}`,
      ...extra,
    };
  }

  private requireSupabaseConfig(): SupabaseStorageConfig {
    if (!this.supabase) {
      throw new Error('Supabase storage is not configured.');
    }
    return this.supabase;
  }

  private async remoteError(response: Response): Promise<string> {
    const body = (await response.json().catch(() => null)) as
      | RemoteStorageErrorPayload
      | null;
    const message = body?.message ?? body?.error;
    return typeof message === 'string'
      ? message
      : `HTTP ${response.status}`;
  }

  private async uploadSupabaseObject(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const config = this.requireSupabaseConfig();
    const objectKey = this.objectKey(namespace, storageKey);

    // Node Buffer is backed by ArrayBufferLike, while the Fetch BodyInit type
    // requires a concrete ArrayBuffer in the current Node/TypeScript typings.
    // Copy into an ArrayBuffer so binary uploads stay type-safe and byte-exact.
    const payload = new ArrayBuffer(body.byteLength);
    new Uint8Array(payload).set(body);

    const response = await fetch(
      `${config.baseUrl}/object/${encodeURIComponent(config.bucket)}/${this.encodeObjectKey(objectKey)}`,
      {
        method: 'POST',
        headers: this.supabaseHeaders({
          'Content-Type': contentType || 'application/octet-stream',
          'Cache-Control': 'no-store',
          'x-upsert': 'false',
        }),
        body: payload,
      },
    );

    if (!response.ok) {
      throw new Error(await this.remoteError(response));
    }
  }

  async writeFile(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
    buffer: Buffer,
    contentType = 'application/octet-stream',
  ): Promise<void> {
    if (this.driver === 'supabase') {
      try {
        await this.uploadSupabaseObject(
          namespace,
          storageKey,
          buffer,
          contentType,
        );
        return;
      } catch (error) {
        this.logger.error(
          `Supabase storage write failed (namespace=${namespace}).`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new ServiceUnavailableException(
          'Attachment storage is temporarily unavailable. Please try again.',
        );
      }
    }

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
    if (this.driver === 'supabase') {
      try {
        const buffer = file.path ? await fs.readFile(file.path) : file.buffer ?? null;
        if (!buffer) {
          throw new Error('Upload data is unavailable.');
        }
        await this.uploadSupabaseObject(
          namespace,
          storageKey,
          buffer,
          file.mimetype || 'application/octet-stream',
        );
      } catch (error) {
        this.logger.error(
          `Supabase storage write failed (namespace=${namespace}).`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new ServiceUnavailableException(
          'Attachment storage is temporarily unavailable. Please try again.',
        );
      } finally {
        if (file.path) {
          await fs.rm(file.path, { force: true }).catch(() => undefined);
          delete file.path;
        }
      }
      return;
    }

    if (!file.path) {
      if (!file.buffer) {
        throw new ServiceUnavailableException(
          'Attachment upload data is unavailable. Please try again.',
        );
      }
      await this.writeFile(namespace, storageKey, file.buffer, file.mimetype);
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

  async createSignedReadUrl(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
    options?: { expiresInSeconds?: number; downloadFileName?: string | boolean },
  ): Promise<string> {
    if (this.driver !== 'supabase') {
      throw new ConflictException(
        'Signed object URLs are only available for object-storage deployments.',
      );
    }

    const config = this.requireSupabaseConfig();
    const objectKey = this.objectKey(namespace, storageKey);
    const expiresIn =
      options?.expiresInSeconds ?? config.signedUrlTtlSeconds;
    const response = await fetch(
      `${config.baseUrl}/object/sign/${encodeURIComponent(config.bucket)}/${this.encodeObjectKey(objectKey)}`,
      {
        method: 'POST',
        headers: this.supabaseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn }),
      },
    );

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Stored file is unavailable (${await this.remoteError(response)}).`,
      );
    }

    const data = (await response.json()) as { signedURL?: unknown };
    if (typeof data.signedURL !== 'string' || !data.signedURL) {
      throw new ServiceUnavailableException('Stored file access could not be prepared.');
    }

    const signedUrl = /^https?:\/\//i.test(data.signedURL)
      ? data.signedURL
      : `${config.baseUrl}${data.signedURL}`;

    if (options?.downloadFileName === undefined) return signedUrl;

    const value =
      options.downloadFileName === true ? '' : options.downloadFileName;
    const separator = signedUrl.includes('?') ? '&' : '?';
    return `${signedUrl}${separator}download=${encodeURIComponent(value)}`;
  }

  async openReadStream(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    if (this.driver === 'filesystem') {
      return createReadStream(this.resolvePath(namespace, storageKey), range);
    }

    const signedUrl = await this.createSignedReadUrl(namespace, storageKey);
    const response = await fetch(signedUrl, {
      headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined,
    });

    if (!response.ok && response.status !== 206) {
      throw new ServiceUnavailableException(
        'Stored file could not be read from temporary staging storage.',
      );
    }

    if (!response.body) {
      throw new ServiceUnavailableException('Stored file returned an empty response.');
    }

    return Readable.fromWeb(
      response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
  }

  async exists(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
  ): Promise<boolean> {
    if (this.driver === 'filesystem') {
      try {
        await fs.access(this.resolvePath(namespace, storageKey));
        return true;
      } catch {
        return false;
      }
    }

    try {
      await this.createSignedReadUrl(namespace, storageKey, {
        expiresInSeconds: 30,
      });
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(
    namespace: AttachmentStorageNamespace,
    storageKey: string,
  ): Promise<boolean> {
    if (this.driver === 'filesystem') {
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

    const config = this.requireSupabaseConfig();
    try {
      const response = await fetch(
        `${config.baseUrl}/object/${encodeURIComponent(config.bucket)}`,
        {
          method: 'DELETE',
          headers: this.supabaseHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ prefixes: [this.objectKey(namespace, storageKey)] }),
        },
      );
      return response.ok;
    } catch (error) {
      this.logger.error(
        `Supabase storage deletion failed (namespace=${namespace}).`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  private async listSupabaseObjects(prefix: string): Promise<Array<{ name: string }>> {
    const config = this.requireSupabaseConfig();
    const response = await fetch(
      `${config.baseUrl}/object/list/${encodeURIComponent(config.bucket)}`,
      {
        method: 'POST',
        headers: this.supabaseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prefix,
          limit: 1000,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await this.remoteError(response));
    }

    const data = (await response.json()) as Array<{ name?: unknown }>;
    return data
      .filter((item): item is { name: string } => typeof item.name === 'string')
      .map((item) => ({ name: item.name }));
  }

  async listDirectories(
    namespace: AttachmentStorageNamespace,
  ): Promise<string[]> {
    if (this.driver === 'filesystem') {
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

    const entries = await this.listSupabaseObjects(`${namespace}/`);
    return [...new Set(entries.map((entry) => entry.name.split('/')[0]).filter(Boolean))];
  }

  async removeDirectory(
    namespace: AttachmentStorageNamespace,
    directoryKey: string,
  ): Promise<void> {
    if (this.driver === 'filesystem') {
      const markerPath = this.resolvePath(namespace, `${directoryKey}/.marker`);
      await fs.rm(path.dirname(markerPath), {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      return;
    }

    const safeDirectory = this.normalizeObjectKey(directoryKey);
    const prefix = `${namespace}/${safeDirectory}/`;
    const entries = await this.listSupabaseObjects(prefix);
    const keys = entries.map((entry) => `${prefix}${entry.name}`);
    if (keys.length === 0) return;

    const config = this.requireSupabaseConfig();
    const response = await fetch(
      `${config.baseUrl}/object/${encodeURIComponent(config.bucket)}`,
      {
        method: 'DELETE',
        headers: this.supabaseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prefixes: keys }),
      },
    );

    if (!response.ok) {
      throw new Error(await this.remoteError(response));
    }
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
        'Attachment temporary storage is not writable. Check the runtime filesystem permissions.',
      );
    }
  }

  private async assertSupabaseStorageHealthy(): Promise<void> {
    const probeKey = `.health/${randomUUID()}.txt`;
    try {
      await this.uploadSupabaseObject(
        'messages',
        probeKey,
        Buffer.from('ok'),
        'text/plain',
      );
      const readable = await this.createSignedReadUrl('messages', probeKey, {
        expiresInSeconds: 30,
      });
      if (!readable) throw new Error('Signed URL health check failed.');
      const deleted = await this.deleteFile('messages', probeKey);
      if (!deleted) throw new Error('Probe cleanup failed.');
      this.logger.log('Temporary Supabase object storage health check passed.');
    } catch (error) {
      this.logger.error(
        'Supabase storage health check failed.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new Error(
        'Supabase staging storage is unavailable. Verify the project URL, backend secret key, private bucket, and free-tier limits.',
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
