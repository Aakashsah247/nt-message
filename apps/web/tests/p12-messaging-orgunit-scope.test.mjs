import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("P12-G replaces active fixed cross-division/department messaging reason with generic OrgUnit scope", async () => {
  const [types, page] = await Promise.all([
    read("src/types/messaging.ts"),
    read("src/pages/MessageAppPage.tsx"),
  ]);
  assert.match(types, /OUTSIDE_ORG_SCOPE/);
  assert.match(page, /requestWorkspace\.reasons\.outsideOrgScope/);
});
