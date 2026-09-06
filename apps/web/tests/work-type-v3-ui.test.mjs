import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

test("P5-G exposes a full-page Work Type configuration workspace", async () => {
  const [app, page, service, navigation, layout] = await Promise.all([
    source("App.tsx"),
    source("pages/WorkTypeManagementPage.tsx"),
    source("services/work-type-v3.service.ts"),
    source("components/layout/management-navigation.ts"),
    source("components/layout/ManagementLayout.tsx"),
  ]);

  assert.match(app, /path="\/work-types"/);
  assert.match(app, /<WorkTypeManagementPage \/>/);
  assert.match(navigation, /label: "Work Types"/);
  assert.match(navigation, /path: "\/work-types"/);

  assert.match(page, /getWorkTypeActions/);
  assert.match(page, /getWorkTypeConfigurationContext/);
  assert.match(page, /listWorkTypes/);
  assert.match(page, /getWorkType/);
  assert.match(page, /createWorkTypeDraft/);
  assert.match(page, /replaceWorkTypeDraftConfiguration/);
  assert.match(page, /publishWorkTypeDraft/);
  assert.match(page, /actions\.publish/);
  assert.match(page, /actions\.draft/);

  assert.match(service, /\/work-types\/offices\/\$\{officeId\}/);
  assert.match(service, /\/configuration-context/);
  assert.match(service, /\/configuration/);
  assert.match(service, /\/publish/);

  assert.doesNotMatch(page, /<dialog\b/i);
  assert.doesNotMatch(page, /role=["']dialog["']/i);
  assert.match(layout, /workTypeNavigationMode/);
  assert.match(layout, /getWorkTypeActions/);
  assert.match(navigation, /withWorkTypeNavigation/);
});

test("P5-G keeps Super Admin and delegated users backend-authoritative", async () => {
  const page = await source("pages/WorkTypeManagementPage.tsx");

  assert.match(page, /actions\.publish \? t\("access\.publish"\)/);
  assert.match(page, /actions\.draft \? t\("access\.draft"\)/);
  assert.match(page, /t\("access\.readOnly"\)/);
  assert.match(page, /!actions\.draft/);
  assert.match(page, /actions\.publish \? <button/);
  assert.doesNotMatch(page, /account\.role\s*===\s*["']SUPER_ADMIN["']/);
});

test("P5-G uses the Work Type i18n namespace instead of hard-coded workspace copy", async () => {
  const [page, i18n] = await Promise.all([
    source("pages/WorkTypeManagementPage.tsx"),
    source("i18n/index.ts"),
  ]);

  assert.match(page, /useTranslation\("workTypes"\)/);
  assert.match(i18n, /workTypesEn/);
  assert.match(i18n, /workTypesNe/);
  assert.match(i18n, /workTypes: workTypesEn/);
  assert.match(i18n, /workTypes: workTypesNe/);
});
