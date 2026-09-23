import fs from 'node:fs';
import path from 'node:path';

describe('final production security architecture lock', () => {
  const repositoryRoot = path.resolve(__dirname, '../../../..');

  function source(relativePath: string): string {
    return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
  }

  it('keeps production exception logging free of query strings', () => {
    const filter = source(
      'apps/api/src/security/production-exception.filter.ts',
    );

    expect(filter).toContain('path: request.path');
    expect(filter).not.toContain('path: request.originalUrl');
    expect(filter).not.toContain('path: request.url');
  });

  it('does not enable production browser source maps', () => {
    const vite = source('apps/web/vite.config.ts');

    expect(vite).not.toMatch(/sourcemap\s*:\s*true/);
    expect(vite).not.toMatch(/sourcemap\s*:\s*['"]inline['"]/);
    expect(vite).not.toMatch(/sourcemap\s*:\s*['"]hidden['"]/);
  });

  it('keeps the production dependency security pins active', () => {
    const workspace = source('pnpm-workspace.yaml');

    for (const line of [
      "multer: '2.3.0'",
      "socket.io-parser: '4.2.7'",
      "fast-uri: '3.1.6'",
      "deepmerge-ts: '8.0.1'",
      "mysql2: '3.24.4'",
    ]) {
      expect(workspace).toContain(line);
    }
  });

  it('keeps automated secret, dependency and regression checks enabled', () => {
    const workflow = source('.github/workflows/security.yml');
    const gate = source('scripts/run_security_gate.mjs');

    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('pnpm audit --prod --audit-level high');
    expect(workflow).toContain('security_scan_tracked_files.mjs');
    expect(gate).toContain("'audit', '--prod', '--audit-level', 'high'");
    expect(gate).toContain(
      'security-rate-limit-production-architecture.spec.ts',
    );
  });

  it('keeps production browser and API security headers configured', () => {
    const render = source('render.yaml');
    const main = source('apps/api/src/main.ts');

    expect(render).toContain('Content-Security-Policy');
    expect(render).toContain('Strict-Transport-Security');
    expect(render).toContain('X-Content-Type-Options');
    expect(main).toContain('helmet(');
    expect(main).toContain('requestCorrelationMiddleware');
    expect(main).toContain('ProductionExceptionFilter');
  });
});
