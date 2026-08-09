import { PassThrough } from 'node:stream';

import { createBoundedMessageAttachmentMemoryStorage } from './message-attachment-memory-storage';

describe('bounded message attachment memory storage', () => {
  it('stores files while the aggregate request total stays within the limit', async () => {
    const storage = createBoundedMessageAttachmentMemoryStorage(8);
    const request = {} as never;

    const upload = (content: string) =>
      new Promise<{ buffer: Buffer; size: number }>((resolve, reject) => {
        const stream = new PassThrough();

        storage._handleFile(request, { stream }, (error, file) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(file as { buffer: Buffer; size: number });
        });

        stream.end(Buffer.from(content));
      });

    await expect(upload('abc')).resolves.toEqual({
      buffer: Buffer.from('abc'),
      size: 3,
    });
    await expect(upload('defg')).resolves.toEqual({
      buffer: Buffer.from('defg'),
      size: 4,
    });
  });

  it('rejects the next stream before the request exceeds its aggregate limit', async () => {
    const storage = createBoundedMessageAttachmentMemoryStorage(5);
    const request = {} as never;

    const upload = (content: string) =>
      new Promise<void>((resolve, reject) => {
        const stream = new PassThrough();

        storage._handleFile(request, { stream }, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });

        stream.end(Buffer.from(content));
      });

    await expect(upload('abc')).resolves.toBeUndefined();
    await expect(upload('def')).rejects.toThrow(
      'Attachments in one message must total 250 MB or smaller.',
    );
  });
});
