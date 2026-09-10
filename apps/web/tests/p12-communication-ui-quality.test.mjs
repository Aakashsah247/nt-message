import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cssUrl = new URL('../src/styles/messaging-workspace.css', import.meta.url);

test('P12-J keeps messaging typography readable and token-driven', async () => {
  const css = await readFile(cssUrl, 'utf8');
  assert.match(css, /--message-font-micro:\s*12px;/);
  assert.match(css, /--message-font-secondary:\s*13px;/);
  const detailSection = css.slice(css.indexOf('/* Conversation details panel: reliable header grid'));
  assert.doesNotMatch(detailSection, /font-size:\s*11(?:\.5)?px;/);
  assert.match(detailSection, /font-size:\s*var\(--message-font-micro\);/);
  assert.match(detailSection, /font-size:\s*var\(--message-font-secondary\);/);
});

test('P12-J preserves mobile touch sizing for detail actions', async () => {
  const css = await readFile(cssUrl, 'utf8');
  const detailSection = css.slice(css.indexOf('/* Conversation details panel: reliable header grid'));
  assert.match(detailSection, /\.message-simple-expand-button\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(detailSection, /message-modern-detail-mobile-back[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/);
});
