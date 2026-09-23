import fs from 'node:fs';
import path from 'node:path';

describe('security automation architecture lock', () => {
  const repositoryRoot = path.resolve(__dirname, '../../../..');
  const scanner = fs.readFileSync(
    path.join(repositoryRoot, 'scripts/security_scan_tracked_files.mjs'),
    'utf8',
  );
  const gate = fs.readFileSync(
    path.join(repositoryRoot, 'scripts/run_security_gate.mjs'),
    'utf8',
  );
  const workflow = fs.readFileSync(
    path.join(repositoryRoot, '.github/workflows/security.yml'),
    'utf8',
  );
  const dependabot = fs.readFileSync(
    path.join(repositoryRoot, '.github/dependabot.yml'),
    'utf8',
  );

  it('scans only tracked source and blocks environment/private-key leakage', () => {
    expect(scanner).toContain("['ls-files', '-z']");
    expect(scanner).toContain("name === '.env'");
    expect(scanner).toContain('PRIVATE KEY-----');
    expect(scanner).toContain('JWT_ACCESS_SECRET');
    expect(scanner).toContain('MESSAGE_SIGNING_PRIVATE_KEY');
  });

  it('runs dependency, security regression, build and whitespace gates', () => {
    expect(gate).toContain("'audit', '--prod', '--audit-level', 'high'");
    expect(gate).toContain('production-security-config.spec.ts');
    expect(gate).toContain(
      'security-rate-limit-production-architecture.spec.ts',
    );
    expect(gate).toContain("args: ['--filter', 'api', 'build']");
    expect(gate).toContain("args: ['diff', '--check']");
  });

  it('runs security automation for pull requests and development branches', () => {
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
    expect(workflow).toContain('security_scan_tracked_files.mjs');
    expect(workflow).toContain('pnpm audit --prod --audit-level high');
    expect(workflow).toContain('run_security_gate.mjs');
    expect(workflow).toContain('contents: read');
  });

  it('enables weekly dependency and GitHub Actions update checks', () => {
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('interval: weekly');
  });
});
