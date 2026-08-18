import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AttachmentStorageService } from './attachment-storage.service';

describe('AttachmentStorageService', () => {
  const originalRoot = process.env.ATTACHMENT_STORAGE_ROOT;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDriver = process.env.ATTACHMENT_STORAGE_DRIVER;
  const originalLegacyDriver = process.env.NT_MESSAGE_STORAGE_DRIVER;
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'nt-message-attachments-'));
    process.env.ATTACHMENT_STORAGE_ROOT = root;
    process.env.NODE_ENV = 'test';
    delete process.env.ATTACHMENT_STORAGE_DRIVER;
    delete process.env.NT_MESSAGE_STORAGE_DRIVER;
  });

  afterEach(async () => {
    if (originalRoot === undefined) {
      delete process.env.ATTACHMENT_STORAGE_ROOT;
    } else {
      process.env.ATTACHMENT_STORAGE_ROOT = originalRoot;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalDriver === undefined) delete process.env.ATTACHMENT_STORAGE_DRIVER;
    else process.env.ATTACHMENT_STORAGE_DRIVER = originalDriver;
    if (originalLegacyDriver === undefined) delete process.env.NT_MESSAGE_STORAGE_DRIVER;
    else process.env.NT_MESSAGE_STORAGE_DRIVER = originalLegacyDriver;
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores message binaries under the configured NTC root and deletes them safely', async () => {
    const service = new AttachmentStorageService();
    await service.onModuleInit();

    await service.writeFile(
      'messages',
      'conversation-id/object-id',
      Buffer.from('content'),
    );

    expect(
      service.resolvePath('messages', 'conversation-id/object-id'),
    ).toBe(path.join(root, 'messages', 'conversation-id', 'object-id'));
    await expect(
      service.exists('messages', 'conversation-id/object-id'),
    ).resolves.toBe(true);
    await expect(
      service.deleteFile('messages', 'conversation-id/object-id'),
    ).resolves.toBe(true);
    await expect(
      service.exists('messages', 'conversation-id/object-id'),
    ).resolves.toBe(false);
  });

  it('rejects storage keys that try to escape the private root', () => {
    const service = new AttachmentStorageService();
    expect(() => service.resolvePath('messages', '../outside')).toThrow(
      'storage reference is invalid',
    );
  });

  it('requires an explicit NTC storage root in production', () => {
    delete process.env.ATTACHMENT_STORAGE_ROOT;
    process.env.NODE_ENV = 'production';
    const service = new AttachmentStorageService();

    return expect(service.onModuleInit()).rejects.toThrow(
      'ATTACHMENT_STORAGE_ROOT must be configured',
    );
  });
  it('fails an upload safely when NTC storage cannot write the object', async () => {
    const service = new AttachmentStorageService();
    const writeError = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    const writeSpy = jest.spyOn(fs, 'writeFile').mockRejectedValue(writeError);

    try {
      await expect(
        service.writeFile('messages', 'conversation-id/object-id', Buffer.from('x')),
      ).rejects.toThrow('Attachment storage is temporarily unavailable');
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('treats a missing object as already deleted for idempotent cleanup', async () => {
    const service = new AttachmentStorageService();
    await expect(
      service.deleteFile('messages', 'conversation-id/missing-object'),
    ).resolves.toBe(true);
  });


  it('copies a streamed temporary upload into permanent NTC storage without requiring the full file in memory', async () => {
    const service = new AttachmentStorageService();
    await service.onModuleInit();
    const temporaryFile = path.join(root, 'temporary-upload');
    await fs.writeFile(temporaryFile, Buffer.alloc(32 * 1024, 0x61));

    const upload = {
      path: temporaryFile,
      buffer: Buffer.alloc(8192, 0x61),
      originalname: 'large.bin',
      mimetype: 'application/octet-stream',
      size: 32 * 1024,
    };

    await service.writeUploadedFile('messages', 'conversation/object', upload);

    await expect(fs.stat(service.resolvePath('messages', 'conversation/object'))).resolves.toEqual(
      expect.objectContaining({ size: 32 * 1024 }),
    );
    await expect(fs.access(temporaryFile)).rejects.toThrow();
    expect(upload.path).toBeUndefined();
  });

});
