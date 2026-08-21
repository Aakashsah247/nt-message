import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import { AttachmentSecurityService } from './attachment-security.service';

function upload(): UploadedMessageAttachmentFile {
  const buffer = Buffer.from('%PDF-1.7');
  return {
    buffer,
    originalname: 'report.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
  };
}

describe('AttachmentSecurityService', () => {
  const originalMode = process.env.ATTACHMENT_SCAN_MODE;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalHost = process.env.CLAMAV_HOST;
  const originalPort = process.env.CLAMAV_PORT;
  const originalDeploymentProfile = process.env.DEPLOYMENT_PROFILE;
  const originalAllowUnscanned = process.env.ALLOW_UNSCANNED_STAGING_ATTACHMENTS;

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of [
      ['ATTACHMENT_SCAN_MODE', originalMode],
      ['NODE_ENV', originalNodeEnv],
      ['CLAMAV_HOST', originalHost],
      ['CLAMAV_PORT', originalPort],
      ['DEPLOYMENT_PROFILE', originalDeploymentProfile],
      ['ALLOW_UNSCANNED_STAGING_ATTACHMENTS', originalAllowUnscanned],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('labels development uploads as format-validated without pretending malware scanning occurred', async () => {
    process.env.ATTACHMENT_SCAN_MODE = 'disabled';
    process.env.NODE_ENV = 'test';
    const service = new AttachmentSecurityService();

    await expect(service.scanValidatedUpload(upload())).resolves.toBe(
      'FORMAT_VALIDATED',
    );
    expect(service.canAccessStoredAttachment('FORMAT_VALIDATED')).toBe(true);
    expect(service.canAccessStoredAttachment('PENDING')).toBe(true);
    expect(service.canAccessStoredAttachment('FAILED')).toBe(false);
  });

  it('refuses to start production without the approved malware scanner', async () => {
    process.env.ATTACHMENT_SCAN_MODE = 'disabled';
    process.env.NODE_ENV = 'production';
    const service = new AttachmentSecurityService();

    await expect(service.onModuleInit()).rejects.toThrow(
      'ATTACHMENT_SCAN_MODE=clamav is required',
    );
  });

  it('allows the explicit temporary external staging exception without weakening normal production', async () => {
    process.env.ATTACHMENT_SCAN_MODE = 'disabled';
    process.env.NODE_ENV = 'production';
    process.env.DEPLOYMENT_PROFILE = 'temporary_external_staging';
    process.env.ALLOW_UNSCANNED_STAGING_ATTACHMENTS = 'true';

    const service = new AttachmentSecurityService();
    const warning = jest
      .spyOn(
        (service as unknown as { logger: { warn(message: string): void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(service.isStrictScanMode()).toBe(false);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('running without ClamAV'),
    );
  });

  it('still refuses production when only one temporary staging guard is present', async () => {
    process.env.ATTACHMENT_SCAN_MODE = 'disabled';
    process.env.NODE_ENV = 'production';
    process.env.DEPLOYMENT_PROFILE = 'temporary_external_staging';
    delete process.env.ALLOW_UNSCANNED_STAGING_ATTACHMENTS;

    const service = new AttachmentSecurityService();

    await expect(service.onModuleInit()).rejects.toThrow(
      'ATTACHMENT_SCAN_MODE=clamav is required',
    );
  });

  it('verifies that the configured production ClamAV service is reachable at startup', async () => {
    const server = net.createServer({ allowHalfOpen: true }, (socket) => {
      socket.on('data', () => socket.end('PONG\0'));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');

    process.env.ATTACHMENT_SCAN_MODE = 'clamav';
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(address.port);

    try {
      const service = new AttachmentSecurityService();
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('accepts a ClamAV-clean upload and marks it CLEAN', async () => {
    const server = net.createServer({ allowHalfOpen: true }, (socket) => {
      socket.on('end', () => socket.end('stream: OK\0'));
      socket.resume();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');

    process.env.ATTACHMENT_SCAN_MODE = 'clamav';
    process.env.NODE_ENV = 'test';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(address.port);

    try {
      const service = new AttachmentSecurityService();
      await expect(service.scanValidatedUpload(upload())).resolves.toBe('CLEAN');
      expect(service.canAccessStoredAttachment('FORMAT_VALIDATED')).toBe(false);
      expect(service.canAccessStoredAttachment('CLEAN')).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it('rejects a ClamAV-detected malicious upload', async () => {
    const server = net.createServer({ allowHalfOpen: true }, (socket) => {
      socket.on('end', () =>
        socket.end('stream: Eicar-Test-Signature FOUND\0'),
      );
      socket.resume();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');

    process.env.ATTACHMENT_SCAN_MODE = 'clamav';
    process.env.NODE_ENV = 'test';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(address.port);

    try {
      const service = new AttachmentSecurityService();
      await expect(service.scanValidatedUpload(upload())).rejects.toThrow(
        'rejected by the security scanner',
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });


  it('streams a temporary file to ClamAV without requiring its full bytes in the upload buffer', async () => {
    const server = net.createServer({ allowHalfOpen: true }, (socket) => {
      socket.on('end', () => socket.end('stream: OK\0'));
      socket.resume();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nt-message-scan-'));
    const filePath = path.join(directory, 'upload');
    await fs.writeFile(filePath, Buffer.alloc(128 * 1024, 0x61));

    process.env.ATTACHMENT_SCAN_MODE = 'clamav';
    process.env.NODE_ENV = 'test';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(address.port);

    try {
      const service = new AttachmentSecurityService();
      await expect(
        service.scanValidatedUpload({
          ...upload(),
          path: filePath,
          buffer: Buffer.from('%PDF-1.7'),
          size: 128 * 1024,
        }),
      ).resolves.toBe('CLEAN');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

});
