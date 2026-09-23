import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [apiSource, viteSource, announcementSource, messagingSource] =
  await Promise.all([
    readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/announcement.service.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/messaging.service.ts", import.meta.url), "utf8"),
  ]);

test("local development routes HTTP API calls through the Vite same-origin proxy", () => {
  assert.match(viteSource, /"\/api"[\s\S]*target:\s*"http:\/\/127\.0\.0\.1:4000"/);
  assert.match(apiSource, /import\.meta\.env\.DEV[\s\S]*\? "\/api\/v1"/);
  assert.match(apiSource, /localhost\|127\\\.0\\\.0\\\.1/);
});

test("direct-download and upload services share the centralized API base", () => {
  assert.match(announcementSource, /import \{ API_URL, apiRequest \} from "\.\.\/lib\/api"/);
  assert.doesNotMatch(announcementSource, /const API_URL =/);
  assert.match(messagingSource, /const MESSAGING_API_BASE_URL = API_URL/);
  assert.doesNotMatch(messagingSource, /VITE_API_BASE_URL/);
});
