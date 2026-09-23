import { readMessageAppRuntimeSourceSync } from "./message-app-runtime-source.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("P12-G replaces active fixed cross-division/department messaging reason with generic OrgUnit scope", async () => {
  const [types, page] = await Promise.all([
    read("src/types/messaging.ts"),
    readMessageAppRuntimeSourceSync(),
  ]);
  assert.match(types, /OUTSIDE_ORG_SCOPE/);
  assert.match(
    readMessageAppRuntimeSourceSync(),
    /requestWorkspace\.reasons\.outsideOrgScope/,
  );
});
