import { of } from 'rxjs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AttachmentTempCleanupInterceptor } from './attachment-temp-cleanup.interceptor';

describe('AttachmentTempCleanupInterceptor', () => {
  it('removes request temporary files after the handler completes', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nt-message-cleanup-'));
    const tempPath = path.join(directory, 'upload');
    await fs.writeFile(tempPath, 'content');

    const request = {
      file: {
        path: tempPath,
        buffer: Buffer.from('content'),
        originalname: 'file.txt',
        mimetype: 'text/plain',
        size: 7,
      },
    };
    const interceptor = new AttachmentTempCleanupInterceptor();
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await new Promise<void>((resolve, reject) => {
      interceptor
        .intercept(context, { handle: () => of('ok') } as never)
        .subscribe({ complete: resolve, error: reject });
    });

    await new Promise((resolve) => setImmediate(resolve));
    await expect(fs.access(tempPath)).rejects.toThrow();
    await fs.rm(directory, { recursive: true, force: true });
  });
});
