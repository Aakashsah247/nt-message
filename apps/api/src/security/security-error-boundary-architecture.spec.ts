import fs from 'node:fs';
import path from 'node:path';

describe('production error boundary architecture lock', () => {
  const sourceRoot = path.resolve(__dirname, '..');
  const mainSource = fs.readFileSync(path.join(sourceRoot, 'main.ts'), 'utf8');
  const filterSource = fs.readFileSync(
    path.join(sourceRoot, 'security/production-exception.filter.ts'),
    'utf8',
  );
  const correlationSource = fs.readFileSync(
    path.join(sourceRoot, 'security/request-correlation.ts'),
    'utf8',
  );

  it('installs correlation ids and the exception boundary centrally', () => {
    expect(mainSource).toMatch(/app\.use\(requestCorrelationMiddleware\)/);
    expect(mainSource).toMatch(
      /app\.useGlobalFilters\([\s\S]*ProductionExceptionFilter/,
    );
    expect(
      mainSource.indexOf('app.use(requestCorrelationMiddleware)'),
    ).toBeLessThan(mainSource.indexOf('await app.listen'));
    expect(mainSource.indexOf('app.useGlobalFilters')).toBeLessThan(
      mainSource.indexOf('await app.listen'),
    );
  });

  it('generates request ids server-side instead of trusting request headers', () => {
    expect(correlationSource).toMatch(/randomUUID\(\)/);
    expect(correlationSource).not.toMatch(
      /request\.headers\s*\[\s*['"]x-request-id['"]\s*\]/i,
    );
  });

  it('never includes request bodies, cookies or authorization headers in exception logging', () => {
    expect(filterSource).not.toMatch(/request\.body/);
    expect(filterSource).not.toMatch(/request\.headers/);
    expect(filterSource).not.toMatch(/request\.cookies/);
    expect(filterSource).not.toMatch(/authorization/i);
  });

  it('locks the production client response to a generic 5xx message', () => {
    expect(filterSource).toContain("message: 'Internal server error.'");
    expect(filterSource).not.toMatch(/response\..*stack/);
  });
});
