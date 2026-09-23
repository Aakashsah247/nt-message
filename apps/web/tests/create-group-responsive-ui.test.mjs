import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, css] = await Promise.all([
  readFile(new URL("../src/pages/MessageAppPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/messaging-workspace.css", import.meta.url), "utf8"),
]);

test("Personal and Official group creation keep distinct V3 membership controls", () => {
  assert.match(page, /message-create-group-member-list/);
  assert.match(page, /message-create-group-official-scope/);
  assert.match(page, /selectedOfficialGroupScope/);
  assert.match(page, /groupSelectedAccountIds\.length > 0/);
});

test("Create Group mobile layout uses one natural scroll flow", () => {
  assert.doesNotMatch(css, /grid-template-rows:\s*1fr\s+auto/);
  assert.doesNotMatch(css, /message-create-group-people-panel\s*\{[^}]*max-height:\s*50vh/s);
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?message-create-group-layout[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*visible;/,
  );
  assert.match(
    css,
    /message-create-group-member-list[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/,
  );
});

test("Official desktop group scope is compact instead of stretching empty space", () => {
  assert.match(
    css,
    /official-group \.message-create-group-layout\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?align-items:\s*start;/,
  );
  assert.match(
    css,
    /official-group \.message-create-group-official-scope,[\s\S]*?official-group \.message-create-group-fields[\s\S]*?flex:\s*0 0 auto;[\s\S]*?overflow:\s*visible;/,
  );
});

test("Create Group uses Nepal Telecom interaction colors and reduced-motion protection", () => {
  assert.match(css, /message-create-group-scope-visual[\s\S]*?color:\s*#0873ba/);
  assert.match(css, /message-group-kind-options > button\.active[\s\S]*?box-shadow:\s*inset 0 -2px 0 #f5b51b/);
  assert.match(css, /@keyframes messageCreateGroupEnter/);
  assert.match(css, /prefers-reduced-motion[\s\S]*?message-create-group-people-panel/);
});
