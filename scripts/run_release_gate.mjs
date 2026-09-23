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
    label: 'Generate Prisma client',
    command: 'pnpm',
    args: ['--filter', 'api', 'exec', 'prisma', 'generate'],
  },
  {
    label: 'API lint',
    command: 'pnpm',
    args: ['--filter', 'api', 'lint'],
  },
  {
    label: 'API regression suite',
    command: 'pnpm',
    args: ['--filter', 'api', 'exec', 'jest', '--runInBand'],
  },
  {
    label: 'Web lint',
    command: 'pnpm',
    args: ['--filter', 'web', 'lint'],
  },
  {
    label: 'Web tests',
    command: 'pnpm',
    args: ['--filter', 'web', 'test'],
  },
  {
    label: 'Web production build',
    command: 'pnpm',
    args: ['--filter', 'web', 'build'],
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

console.log('\nNT Message release gate PASSED.');
