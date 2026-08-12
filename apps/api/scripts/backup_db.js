#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const envPath = path.resolve(__dirname, '../../../.env');
console.log('Looking for env at', envPath);
console.log('CWD:', process.cwd());
console.log('Script dirname:', __dirname);
let url = process.env.DATABASE_URL;
if (!url && fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(/^DATABASE_URL=(.*)$/m);
  if (m) url = m[1].trim().replace(/^"|"$/g, '');
}
if (!url) {
  console.error('DATABASE_URL not found in ../../.env or environment');
  process.exit(2);
}
const out = path.join(os.homedir(), 'nt-message-db-backup.dump');
console.log('Backing up DB to', out);
try {
  const urlNoQuery = url.split('?')[0];
  execSync(`pg_dump "${urlNoQuery}" -Fc -f "${out}"`, { stdio: 'inherit' });
  console.log('Backup complete:', out);
} catch (err) {
  console.error('Backup failed:', err.message || err);
  process.exit(1);
}
