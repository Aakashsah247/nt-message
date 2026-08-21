#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const envPath = path.resolve(__dirname, '../../../.env');
let env = {};
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\n/).forEach((line) => {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  });
}
const email = env.SUPER_ADMIN_EMAIL;
const accessSecret = env.JWT_ACCESS_SECRET;
let databaseUrl = env.DATABASE_URL;
if (databaseUrl) {
  const q = databaseUrl.indexOf('?');
  if (q !== -1) databaseUrl = databaseUrl.slice(0, q);
}
if (!email || !accessSecret || !databaseUrl) {
  console.error('Missing SUPER_ADMIN_EMAIL, JWT_ACCESS_SECRET, or DATABASE_URL in .env');
  process.exit(2);
}

let accountId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const passwordHash = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');
const refreshHash = crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex');

const insertAccount = () => `INSERT INTO accounts (id, username, role, password_hash, is_enabled, password_changed_at, created_at, updated_at) VALUES ('${accountId}', '${email}', 'SUPER_ADMIN', '${passwordHash}', true, now(), now(), now()) ON CONFLICT (username) DO NOTHING;`;
const insertSession = () => `INSERT INTO auth_sessions (id, account_id, refresh_token_hash, expires_at, last_used_at, created_at, revoked_at) VALUES ('${sessionId}', '${accountId}', '${refreshHash}', now() + interval '30 days', now(), now(), NULL) ON CONFLICT (id) DO NOTHING;`;

try {
  console.log('Checking for existing account...');
  const out = execSync(`psql "${databaseUrl}" -t -c "SELECT id FROM accounts WHERE username='${email}' LIMIT 1;"`,
    { encoding: 'utf8' });
  const found = out.trim();
  if (found) {
    accountId = found;
    console.log('Found existing account id:', accountId);
  } else {
    console.log('Creating new account...');
    execSync(`psql "${databaseUrl}" -c "${insertAccount().replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
  }

  console.log('Creating session...');
  execSync(`psql "${databaseUrl}" -c "${insertSession().replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
} catch (err) {
  console.error('Failed to insert via psql:', err.message);
  process.exit(1);
}

const payload = {
  sub: accountId,
  sid: sessionId,
  role: 'SUPER_ADMIN',
  type: 'access',
};
const token = jwt.sign(payload, accessSecret, { algorithm: 'HS256', expiresIn: '15m' });
console.log('\nACCESS_TOKEN=' + token + '\n');
process.exit(0);
