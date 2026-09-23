import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../src/pages/WorkReportsMainPage.tsx", import.meta.url),
  "utf8",
);

test("Office User report filters expose V3 organization terminology", () => {
  assert.doesNotMatch(page, /<span>Division<\/span>/);
  assert.doesNotMatch(page, /<span>Department<\/span>/);
  assert.doesNotMatch(page, />All divisions</);
  assert.match(page, /<span>Organization branch<\/span>/);
  assert.match(page, /<span>Org Unit<\/span>/);
  assert.match(page, />All organization branches</);
});
