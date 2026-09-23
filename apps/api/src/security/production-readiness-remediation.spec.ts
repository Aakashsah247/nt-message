import fs from 'node:fs';
import path from 'node:path';

describe('production readiness remediation architecture lock', () => {
  const repositoryRoot = path.resolve(__dirname, '../../../..');

  function source(relativePath: string): string {
    return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
  }

  it('generates Prisma before Render API builds and uses dependency-aware readiness', () => {
    const render = source('render.yaml');

    expect(render).toContain('pnpm --filter api exec prisma generate');
    expect(render).toContain('healthCheckPath: /api/v1/health/database');
  });

  it('keeps a strict production deployment profile separate from temporary staging', () => {
    const production = source('render.production.yaml');

    expect(production).toContain('value: production');
    expect(production).toContain('value: clamav');
    expect(production).toContain('key: CLAMAV_HOST');
    expect(production).not.toContain('ALLOW_UNSCANNED_STAGING_ATTACHMENTS');
    expect(production).not.toContain('db:seed');
  });

  it('fails Emergency SMS closed in production until a real provider is integrated', () => {
    const moduleSource = source(
      'apps/api/src/emergency-alerts/emergency-alerts.module.ts',
    );
    const disabledProvider = source(
      'apps/api/src/emergency-alerts/sms-providers/disabled-sms.provider.ts',
    );

    expect(moduleSource).toContain("process.env.NODE_ENV === 'production'");
    expect(moduleSource).toContain('disabledProvider');
    expect(disabledProvider).toContain("status: 'FAILED'");
    expect(disabledProvider).not.toContain("status: 'SENT'");
  });

  it('routes profile and group photos through durable storage and scanning', () => {
    const conversations = source(
      'apps/api/src/conversations/conversations.service.ts',
    );

    expect(conversations).toContain(
      "writeUploadedFile(\n      'profile-photos'",
    );
    expect(conversations).toContain("writeUploadedFile(\n      'group-photos'");
    expect(conversations).toContain('scanValidatedUpload(');
    expect(conversations).toContain(
      'assertAttachmentFileMatchesDeclaredType(file)',
    );
    expect(conversations).not.toContain('PROFILE_PHOTO_STORAGE_DIR');
    expect(conversations).not.toContain('GROUP_PHOTO_STORAGE_DIR');
  });
});
