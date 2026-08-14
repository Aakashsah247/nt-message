#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');
const envPath = path.resolve(__dirname, '../../../.env');
let env = {};
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\n/).forEach((line) => {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  });
}
const api = env.API_URL || `http://localhost:${env.API_PORT||4000}/api/v1`;

let token;
try {
  // Generate token via script
  const out = execSync('pnpm --dir apps/api exec node scripts/create_admin_session_and_token.js', { encoding: 'utf8' });
  const m = out.match(/ACCESS_TOKEN=(.+)/);
  token = m ? m[1].trim() : null;
  if (!token) {
    console.error('Failed to generate token');
    process.exit(1);
  }
  console.log('Generated access token successfully');
} catch (err) {
  console.error('Failed to generate token:', err.message);
  process.exit(1);
}

(async ()=>{
  try {
    const headers = { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` };

    console.log('Creating list...');
    const createRes = await fetch(`${api}/lists`, { method: 'POST', headers, body: JSON.stringify({ name: 'SmokeTest List' }) });
    const createJson = await createRes.json();
    console.log('Create response:', createRes.status, createJson);
    const listId = createJson.data?.id;

    console.log('Listing lists...');
    const listRes = await fetch(`${api}/lists`, { method: 'GET', headers });
    console.log('Lists:', await listRes.json());

    if (listId) {
      console.log('Adding member...');
      const addRes = await fetch(`${api}/lists/${listId}/members`, { method: 'POST', headers, body: JSON.stringify({ member: 'Test User' }) });
      console.log('Add member:', await addRes.json());

      console.log('Removing member at index 0...');
      const remRes = await fetch(`${api}/lists/${listId}/members/0`, { method: 'DELETE', headers });
      console.log('Remove member:', await remRes.json());

      console.log('Deleting list...');
      const delRes = await fetch(`${api}/lists/${listId}`, { method: 'DELETE', headers });
      console.log('Delete response:', delRes.status, await delRes.json());
    }

    console.log('Smoke tests completed successfully');
  } catch (err) {
    console.error('Smoke tests failed:', err);
    process.exit(1);
  }
})();
