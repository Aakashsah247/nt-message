import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const failures = [];
const allowedEnvironmentTemplates = new Set([
  '.env.example',
  '.env.sample',
  '.env.staging.example',
  '.env.staging.sample',
]);
const binaryExtensions =
  /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|mp4|webm|mov|mp3|wav|woff2?|ttf|eot)$/i;
const placeholderPattern =
  /(replace[_-]?with|changeme|change[_-]?me|example|your[_-]|placeholder|dummy|sample|test[_-]?only|x{4,}|<[^>]+>|\$\{)/i;

// Keep assignment matching strictly on one physical line. Using \s here would
// also consume newlines, so an empty value such as `SMTP_PASSWORD=` could
// accidentally capture the value from the following environment variable.
const sensitiveAssignmentPattern =
  /\b(JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|OTP_HASH_SECRET|ACTIVATION_TOKEN_SECRET|SMTP_PASSWORD|SUPABASE_SECRET_KEY|WEB_PUSH_VAPID_PRIVATE_KEY|MESSAGE_ENCRYPTION_KEY_V\d+_B64|MESSAGE_SEARCH_INDEX_KEY_V\d+_B64|MESSAGE_SIGNING_PRIVATE_KEY_V\d+_DER_B64)\b[ \t]*([:=])[ \t]*(?:(["'])([^"'\r\n]{20,})\3|([A-Za-z0-9_+./=-]{20,})(?=[ \t,}\]#;\r\n]|$))/gi;
const tokenPatterns = [
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  {
    name: 'GitHub fine-grained token',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g,
  },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
];

function isForbiddenEnvironmentFile(path) {
  const name = basename(path);
  if (allowedEnvironmentTemplates.has(name)) return false;
  return name === '.env' || name.startsWith('.env.');
}

function report(path, reason) {
  failures.push(`${path}: ${reason}`);
}

for (const path of tracked) {
  if (isForbiddenEnvironmentFile(path)) {
    report(path, 'secret-bearing environment files must never be tracked');
    continue;
  }

  if (
    /\.(?:pem|p12|pfx)$/i.test(path) ||
    /(?:^|\/)(?:id_rsa|id_ed25519)$/i.test(path)
  ) {
    report(path, 'private-key/certificate container must not be tracked');
    continue;
  }

  if (binaryExtensions.test(path)) continue;

  let source;
  try {
    if (statSync(path).size > 5 * 1024 * 1024) continue;
    source = readFileSync(path, 'utf8');
  } catch {
    continue;
  }

  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) {
    report(path, 'contains a PEM private key');
  }

  for (const { name, pattern } of tokenPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) {
      report(path, `contains a value matching a ${name}`);
    }
  }

  sensitiveAssignmentPattern.lastIndex = 0;
  for (const match of source.matchAll(sensitiveAssignmentPattern)) {
    const value = match[4] ?? match[5] ?? '';

    // Runtime-generated values and constant references are not committed
    // credentials. Only complete quoted literals or complete bare tokens are
    // candidates, and the redaction marker is an explicit safe test constant.
    if (value === 'SECRET_REDACTION_MARKER') continue;

    if (!placeholderPattern.test(value)) {
      report(path, `contains a non-placeholder assignment for ${match[1]}`);
    }
  }
}

if (failures.length > 0) {
  console.error(
    `Tracked-file secret scan FAILED with ${failures.length} issue(s):`,
  );
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Tracked-file secret scan passed: ${tracked.length} tracked file(s) checked.`,
  );
}
