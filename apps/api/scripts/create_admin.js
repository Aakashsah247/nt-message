#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const envPath = path.resolve(__dirname, '../../../.env');
let env = {};
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\n/).forEach((line) => {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  });
}
const username = env.SUPER_ADMIN_EMAIL;
const password = env.SUPER_ADMIN_INITIAL_PASSWORD;
if (!username || !password) {
  console.error('SUPER_ADMIN_EMAIL or SUPER_ADMIN_INITIAL_PASSWORD missing in .env');
  process.exit(2);
}

(async ()=>{
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.account.findFirst({ where: { username } });
    if (existing) {
      console.log('Admin account already exists:', existing.id);
      process.exit(0);
    }
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const acc = await prisma.account.create({ data: { username, passwordHash: hash, role: 'SUPER_ADMIN', isEnabled: true } });
    console.log('Created admin account:', acc.id);
  } catch (err) {
    console.error('Failed to create admin:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
