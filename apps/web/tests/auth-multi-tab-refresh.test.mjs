import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authServiceUrl = new URL("../src/services/auth.service.ts", import.meta.url);
const authContextUrl = new URL("../src/context/AuthContext.tsx", import.meta.url);

test("refresh-token rotation is serialized across browser tabs", async () => {
  const source = await readFile(authServiceUrl, "utf8");

  assert.match(source, /AUTH_REFRESH_LOCK_NAME/);
  assert.match(source, /navigator\.locks\.request/);
  assert.match(source, /mode:\s*["']exclusive["']/);
  assert.match(source, /refreshPromise\s*=\s*refreshWithCrossTabLock\(\)/);
});

test("logout and refresh races cannot restore a cleared UI session", async () => {
  const source = await readFile(authContextUrl, "utf8");

  assert.match(source, /sessionGenerationRef\s*=\s*useRef\(0\)/);
  assert.match(source, /sessionGenerationRef\.current\s*\+=\s*1/);
  assert.match(
    source,
    /refreshGeneration\s*===\s*sessionGenerationRef\.current/,
  );
  assert.match(source, /clearSession\(\);[\s\S]*recordSessionActivity\(token,\s*["']LOGOUT["']\)/);
});
