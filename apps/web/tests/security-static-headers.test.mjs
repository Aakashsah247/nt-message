import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const renderUrl = new URL('../../../render.yaml', import.meta.url);
const apiMainUrl = new URL('../../api/src/main.ts', import.meta.url);

const [renderSource, apiMainSource] = await Promise.all([
  readFile(renderUrl, 'utf8'),
  readFile(apiMainUrl, 'utf8'),
]);

function staticWebServiceBlock() {
  const marker = 'name: nt-message-aakash-test-web';
  const start = renderSource.indexOf(marker);
  assert.notEqual(start, -1, 'Render static web service must exist');
  return renderSource.slice(start);
}

test('Render static web service sends the production browser security headers', () => {
  const source = staticWebServiceBlock();

  assert.match(source, /name: Content-Security-Policy/);
  assert.match(source, /default-src 'self'/);
  assert.match(source, /base-uri 'self'/);
  assert.match(source, /object-src 'none'/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.match(source, /script-src 'self'/);
  assert.match(source, /connect-src 'self' https: wss:/);
  assert.match(source, /frame-src 'self' blob:/);
  assert.match(source, /worker-src 'self' blob:/);
  assert.match(source, /upgrade-insecure-requests/);

  assert.match(source, /name: Strict-Transport-Security/);
  assert.match(source, /max-age=31536000; includeSubDomains; preload/);
  assert.match(source, /name: X-Content-Type-Options[\s\S]*value: nosniff/);
  assert.match(source, /name: X-Frame-Options[\s\S]*value: DENY/);
  assert.match(source, /name: Referrer-Policy[\s\S]*value: no-referrer/);
  assert.match(source, /name: Permissions-Policy/);
  assert.match(source, /microphone=\(self\)/);
  assert.match(source, /geolocation=\(self\)/);
  assert.match(source, /camera=\(\)/);
});

test('browser policy preserves the NT Message features that need blob frames, push and realtime', () => {
  const source = staticWebServiceBlock();

  // Attachment PDF/text previews are rendered in blob-backed iframes.
  assert.match(source, /frame-src 'self' blob:/);
  // Attachment images/video/audio use object URLs.
  assert.match(source, /img-src 'self' data: blob: https:/);
  assert.match(source, /media-src 'self' blob: https:/);
  // API and Socket.IO run on a separate HTTPS/WSS origin on Render.
  assert.match(source, /connect-src 'self' https: wss:/);
  // Push messaging registers the same-origin NT Message service worker.
  assert.match(source, /worker-src 'self' blob:/);
});

test('API Helmet policy is explicit and does not apply a document CSP to API responses', () => {
  assert.match(apiMainSource, /contentSecurityPolicy: false/);
  assert.match(apiMainSource, /crossOriginResourcePolicy: false/);
  assert.match(apiMainSource, /frameguard: \{ action: 'deny' \}/);
  assert.match(apiMainSource, /maxAge: 31_536_000/);
  assert.match(apiMainSource, /includeSubDomains: true/);
  assert.match(apiMainSource, /preload: true/);
  assert.match(apiMainSource, /noSniff: true/);
  assert.match(apiMainSource, /referrerPolicy: \{ policy: 'no-referrer' \}/);
  assert.match(
    apiMainSource,
    /hsts: isProduction[\s\S]*?: false/,
    'HSTS must stay disabled during local HTTP development',
  );
});
