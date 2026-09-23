import fs from 'node:fs';
import path from 'node:path';

describe('trusted proxy architecture lock', () => {
  const sourceRoot = path.resolve(__dirname, '..');
  const mainSource = fs.readFileSync(path.join(sourceRoot, 'main.ts'), 'utf8');
  const renderSource = fs.readFileSync(
    path.resolve(sourceRoot, '../../../render.yaml'),
    'utf8',
  );
  const rateLimitSource = fs.readFileSync(
    path.join(sourceRoot, 'security/rate-limit.guard.ts'),
    'utf8',
  );

  it('configures trusted proxy handling centrally before HTTP traffic is accepted', () => {
    expect(mainSource).toMatch(/configureTrustedProxy\(app, configService\)/);
    expect(
      mainSource.indexOf('configureTrustedProxy(app, configService)'),
    ).toBeLessThan(mainSource.indexOf('await app.listen'));
  });

  it('declares Render as the trusted proxy mode in the current deployment', () => {
    expect(renderSource).toMatch(/- key: TRUST_PROXY_MODE\s+value: render/);
  });

  it('keeps rate-limit IP keys on Express request.ip instead of reading forwarded headers directly', () => {
    expect(rateLimitSource).toMatch(/request\.ip/);
    expect(rateLimitSource).not.toMatch(/x-forwarded-for/i);
  });
});
