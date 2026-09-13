#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_ENV_PATH = path.join(PROJECT_ROOT, '.env');
const PRISMA_ONLY_URL_PARAMETERS = new Set([
  'schema',
  'connection_limit',
  'pool_timeout',
  'pgbouncer',
  'statement_cache_size',
  'socket_timeout',
]);

function readEnvValue(name, envPath = DEFAULT_ENV_PATH) {
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  if (!fs.existsSync(envPath)) return null;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    if (key !== name) continue;

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value || null;
  }

  return null;
}

function requireDatabaseUrl(environmentName = 'DATABASE_URL') {
  const value = readEnvValue(environmentName);
  if (!value) {
    throw new Error(
      `${environmentName} is required in the environment or project .env file.`,
    );
  }
  return value;
}

function toPostgresCliUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  for (const name of PRISMA_ONLY_URL_PARAMETERS) {
    parsed.searchParams.delete(name);
  }
  return parsed.toString();
}

function redactDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '') || '(default)';
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${databaseName}`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    ...options,
  });

  if (result.error) {
    throw new Error(`${command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = options.capture
      ? `\n${result.stderr || result.stdout || ''}`.trimEnd()
      : '';
    throw new Error(`${command} exited with status ${result.status}.${details}`);
  }

  return result.stdout || '';
}

function ensurePostgresTool(command) {
  run(command, ['--version'], { capture: true });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function timestampForFile(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function optionalGitCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

module.exports = {
  PROJECT_ROOT,
  ensurePostgresTool,
  optionalGitCommit,
  redactDatabaseUrl,
  requireDatabaseUrl,
  run,
  sha256File,
  timestampForFile,
  toPostgresCliUrl,
};
