#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const envPath = path.resolve(__dirname, '../../../.env');
let url = process.env.DATABASE_URL;
if (!url && fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  const m = raw.match(/^DATABASE_URL=(.*)$/m);
  if (m) url = m[1].trim().replace(/^"|"$/g, '');
}
if (!url) {
  console.error('DATABASE_URL not found in env');
  process.exit(2);
}
const urlNoQuery = url.split('?')[0];
const sqlFile = path.resolve(__dirname, '../prisma/migrations/20260813000100_add_message_lists/migration.sql');
if (!fs.existsSync(sqlFile)) {
  console.error('Migration SQL not found:', sqlFile);
  process.exit(2);
}
console.log('Applying migration SQL from', sqlFile);
try {
  execSync(`psql "${urlNoQuery}" -f "${sqlFile}"`, { stdio: 'inherit' });
  console.log('Migration applied successfully');
} catch (err) {
  console.error('Failed to apply migration:', err.message || err);
  process.exit(1);
}
