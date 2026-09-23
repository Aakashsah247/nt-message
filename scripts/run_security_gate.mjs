import { spawnSync } from 'node:child_process';

const steps = [
  {
    label: 'Tracked-file secret scan',
    command: process.execPath,
    args: ['scripts/security_scan_tracked_files.mjs'],
  },
  {
    label: 'Production dependency audit',
    command: 'pnpm',
    args: ['audit', '--prod', '--audit-level', 'high'],
  },
  {
    label: 'Security regression suites',
    command: 'pnpm',
    args: [
      '--filter',
      'api',
      'exec',
      'jest',
      'secret-redaction.spec.ts',
      'production-security-config.spec.ts',
      'security-secret-leakage-architecture.spec.ts',
      'cookie-auth-origin.guard.spec.ts',
      'security-cookie-csrf-architecture.spec.ts',
      'trusted-proxy.spec.ts',
      'security-trusted-proxy-architecture.spec.ts',
      'request-correlation.spec.ts',
      'production-exception.filter.spec.ts',
      'security-error-boundary-architecture.spec.ts',
      'native-rate-limit.service.spec.ts',
      'rate-limit-production-config.spec.ts',
      'security-rate-limit-production-architecture.spec.ts',
      'security-rate-limit-architecture.spec.ts',
      'production-readiness-remediation.spec.ts',
      'messaging-push-endpoint.policy.spec.ts',
      'messaging-push.service.spec.ts',
      'photo-upload-hardening.spec.ts',
      'disabled-sms.provider.spec.ts',
      '--runInBand',
    ],
  },
  {
    label: 'API production build',
    command: 'pnpm',
    args: ['--filter', 'api', 'build'],
  },
  {
    label: 'Whitespace validation',
    command: 'git',
    args: ['diff', '--check'],
  },
];

for (const step of steps) {
  console.log(`\n==> ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`${step.label} could not start: ${result.error.message}`);
    process.exit(result.status ?? 1);
  }

  if (result.status !== 0) {
    console.error(`${step.label} FAILED with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nNT Message security gate PASSED.');
