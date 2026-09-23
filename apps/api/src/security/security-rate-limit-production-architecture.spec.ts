import fs from 'node:fs';
import path from 'node:path';

describe('production rate-limit architecture lock', () => {
  const sourceRoot = path.resolve(__dirname, '..');
  const mainSource = fs.readFileSync(path.join(sourceRoot, 'main.ts'), 'utf8');
  const limiterSource = fs.readFileSync(
    path.join(sourceRoot, 'security/native-rate-limit.service.ts'),
    'utf8',
  );
  const renderSource = fs.readFileSync(
    path.resolve(sourceRoot, '../../../render.yaml'),
    'utf8',
  );

  it('validates rate-limit topology before the server accepts traffic', () => {
    expect(mainSource).toContain(
      'assertProductionRateLimitTopology(configService)',
    );
    expect(
      mainSource.indexOf('assertProductionRateLimitTopology(configService)'),
    ).toBeLessThan(mainSource.indexOf('await app.listen'));
  });

  it('keeps the native limiter bounded', () => {
    expect(limiterSource).toContain('NATIVE_RATE_LIMIT_MAX_BUCKETS');
    expect(limiterSource).toContain('ensureCapacity');
    expect(limiterSource).toContain('100_000');
  });

  it('locks the current Render topology to one native-limiter API instance', () => {
    expect(renderSource).toMatch(/- key: RATE_LIMIT_STORE\s+value: native/);
    expect(renderSource).toMatch(/- key: API_INSTANCE_COUNT\s+value: "1"/);
    expect(renderSource).toMatch(
      /- key: NATIVE_RATE_LIMIT_MAX_BUCKETS\s+value: "100000"/,
    );
  });
});
