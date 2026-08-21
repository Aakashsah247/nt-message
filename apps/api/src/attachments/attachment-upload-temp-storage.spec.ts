import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { createBoundedAttachmentTempStorage } from './attachment-upload-temp-storage';

describe('bounded attachment temporary storage', () => {
  const originalTempRoot = process.env.ATTACHMENT_UPLOAD_TEMP_DIR;
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nt-message-upload-test-'));
    process.env.ATTACHMENT_UPLOAD_TEMP_DIR = tempRoot;
  });

  afterEach(async () => {
    if (originalTempRoot === undefined) delete process.env.ATTACHMENT_UPLOAD_TEMP_DIR;
    else process.env.ATTACHMENT_UPLOAD_TEMP_DIR = originalTempRoot;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('streams full content to disk while retaining only a small signature preview in memory', async () => {
    const storage = createBoundedAttachmentTempStorage(32 * 1024);
    const request = {} as never;
    const content = Buffer.alloc(16 * 1024, 0x61);

    const stored = await new Promise<{ path: string; buffer: Buffer; size: number }>((resolve, reject) => {
      const stream = new PassThrough();
      void storage._handleFile(request, { stream }, (error, file) => {
        if (error) reject(error);
        else resolve(file as { path: string; buffer: Buffer; size: number });
      });
      stream.end(content);
    });

    expect(stored.size).toBe(content.length);
    expect(stored.buffer.length).toBe(8192);
    await expect(fs.readFile(stored.path)).resolves.toEqual(content);
  });

  it('rejects a request before its aggregate upload budget is exceeded', async () => {
    const storage = createBoundedAttachmentTempStorage(5);
    const request = {} as never;

    const upload = (content: string) =>
      new Promise<void>((resolve, reject) => {
        const stream = new PassThrough();
        void storage._handleFile(request, { stream }, (error) => {
          if (error) reject(error);
          else resolve();
        });
        stream.end(Buffer.from(content));
      });

    await expect(upload('abc')).resolves.toBeUndefined();
    await expect(upload('def')).rejects.toThrow('250 MB or smaller');
  });
});
