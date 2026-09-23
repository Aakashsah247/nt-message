import { spawnSync } from 'node:child_process';

const steps = [
  {
    label: 'Security automation gate',
    command: process.execPath,
    args: ['scripts/run_security_gate.mjs'],
  },
  {
    label: 'Final production architecture lock',
    command: 'pnpm',
    args: [
      '--filter',
      'api',
      'exec',
      'jest',
      'security-final-production-lock.spec.ts',
      '--runInBand',
    ],
  },
  {
    label: 'Web production build',
    command: 'pnpm',
    args: ['--filter', 'web', 'build'],
  },
  {
    label: 'Message/attachment cryptographic final lock',
    command: 'pnpm',
    args: ['message:security:final-lock'],
  },
  {
    label: 'Final whitespace validation',
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

console.log('\nNT Message FINAL PRODUCTION SECURITY LOCK PASSED.');
