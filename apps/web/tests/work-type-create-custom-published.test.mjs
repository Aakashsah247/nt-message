import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [workItems, workTypesPage, createPage] = await Promise.all([
  readFile(
    new URL("../../api/src/work-management/work-items.service.ts", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../src/pages/WorkTypeManagementPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/WorkCreatePage.tsx", import.meta.url), "utf8"),
]);

test("Create Work catalog accepts published custom Work Types that use a fixed template", () => {
  const start = workItems.indexOf("async getCreateContext");
  const end = workItems.indexOf("async create(", start);
  const createContext = workItems.slice(start, end);

  assert.match(createContext, /status: WorkTypeVersionStatus\.PUBLISHED/);
  assert.match(createContext, /workTypeDefinition: \{ officeId, isActive: true \}/);
  assert.doesNotMatch(createContext, /DEFAULT_WORK_TYPE_TEMPLATES/);
  assert.doesNotMatch(createContext, /fixedRuntimeWorkType/);
  assert.match(createContext, /const template = version\.template as WorkTypeTemplate/);
});

test("Create Work submission accepts the selected published custom template version", () => {
  const start = workItems.indexOf("async create(");
  const createSource = workItems.slice(start);

  assert.match(createSource, /version\.status !== WorkTypeVersionStatus\.PUBLISHED/);
  assert.match(createSource, /currentPublishedVersion\?\.id !== version\.id/);
  assert.match(createSource, /const template = version\.template as WorkTypeTemplate/);
  assert.doesNotMatch(createSource, /Only the finalized eight classic Work Types/);
});

test("Work Type catalog distinguishes an active published version from its pending draft", () => {
  assert.match(workTypesPage, /const publishedVersion = definition\.currentPublishedVersion/);
  assert.match(workTypesPage, /const draftVersion = definition\.currentDraftVersion/);
  assert.match(workTypesPage, /"Published · Draft pending"/);
  assert.match(workTypesPage, /const version = publishedVersion \?\? draftVersion/);
});

test("Create Work renders every Work Type returned by the published create context", () => {
  assert.match(createPage, /createContext\.workTypes/);
  assert.match(createPage, /workTypes\.map\(\(workType\) => \(/);
  assert.match(createPage, /value=\{workType\.workTypeVersionId\}/);
  assert.match(createPage, /\{workType\.name\}/);
});
