import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

test("Work Type management feeds published Information into the classic Work lifecycle", async () => {
  const [app, controller, service, page] = await Promise.all([
    source("App.tsx"),
    readFile(new URL("../../api/src/work-management/work-type-v3.controller.ts", import.meta.url), "utf8"),
    readFile(new URL("../../api/src/work-management/work-items.service.ts", import.meta.url), "utf8"),
    source("pages/WorkTypeManagementPage.tsx"),
  ]);

  assert.match(app, /path="\/work-types\/\*"[\s\S]{0,300}<WorkTypeManagementPage \/>/);
  assert.doesNotMatch(controller, /WORK_TYPE_CONFIGURATION_FROZEN_MESSAGE/);
  assert.doesNotMatch(controller, /assertWorkTypeConfigurationOpen/);
  assert.doesNotMatch(service, /DEFAULT_WORK_TYPE_TEMPLATES/);
  assert.doesNotMatch(service, /fixedRuntimeWorkType/);
  assert.match(service, /status: WorkTypeVersionStatus\.PUBLISHED/);
  assert.match(service, /const template = version\.template as WorkTypeTemplate/);
  assert.doesNotMatch(service, /CLASSIC_RUNTIME_INTAKE_FIELD_CODES/);
  assert.match(service, /isWorkFieldCollectedAtCreation/);
  assert.match(service, /version\.fields\.filter/);
  assert.match(page, /Primary owners control who may create this Work Type only/);
  assert.match(page, /Protected Contact Details control/);
});

test("working-calendar configuration remains independent from Work Type configuration", async () => {
  const controller = await readFile(
    new URL("../../api/src/work-management/work-type-v3.controller.ts", import.meta.url),
    "utf8",
  );
  const method = controller.slice(
    controller.indexOf("replaceWorkingCalendar("),
    controller.indexOf("@Get('actions')"),
  );
  assert.doesNotMatch(method, /permanentlyDeleteDefinition/);
});
test("Work Type wildcard route resolves the definition id before loading detail", async () => {
  const page = await source("pages/WorkTypeManagementPage.tsx");
  assert.match(page, /const routeParams = useParams\(\)/);
  assert.match(page, /routeParams\["\*"\]/);
  assert.match(page, /const wildcardDefinitionId = wildcardSegments\[0\]/);
  assert.match(page, /workTypeDefinitionId[\s\S]{0,240}decodeURIComponent\(wildcardDefinitionId\)/);
  assert.match(page, /getWorkType\(accessToken, officeId, workTypeDefinitionId\)/);
});

test("Primary Owner limits Division Head catalog visibility and Create Work choices only", async () => {
  const [managementService, workItemsService, workPage] = await Promise.all([
    readFile(new URL("../../api/src/work-management/work-type-v3.service.ts", import.meta.url), "utf8"),
    readFile(new URL("../../api/src/work-management/work-items.service.ts", import.meta.url), "utf8"),
    source("pages/ManagementWorkPage.tsx"),
  ]);

  assert.match(
    managementService,
    /const scope = await this\.getWorkTypeManagerScope\(user, officeId\)/,
  );
  assert.match(managementService, /if \(scope\.officeWideManagement\) return scope/);
  assert.match(
    managementService,
    /!scope\.officeWideManagement[\s\S]{0,100}scope\.divisionOrgUnitIds\.length === 0/,
  );
  assert.match(managementService, /!version\s*\|\|[\s\S]{0,120}!version\.creatorOrgUnits\.some\(\(item\) =>[\s\S]{0,180}scope\.divisionOrgUnitIds\.includes\(item\.orgUnitId\)/);
  assert.match(workItemsService, /resolveWorkTypeCreationScope/);
  assert.match(workItemsService, /canCreateWorkTypeVersion/);
  assert.match(workItemsService, /creatorOrgUnits:[\s\S]{0,120}includeDescendants: true/);
  assert.match(workItemsService, /This Work Type is not owned by your Division and cannot be created from your organization branch/);
  assert.match(workPage, /const creatableWorkTypes = useMemo/);
  assert.match(workPage, /return options\?\.workTypes \?\? \[\]/);
  assert.match(workPage, /value=\{createForm\.workTypeVersionId\}/);
  assert.match(workPage, /\{type\.name\}/);
  assert.match(workPage, /No Work Types available for your Division/);

  // Existing assignment independence stays intact: the selected Primary Execution
  // OrgUnit still comes from the normal Office-wide V3 assignment picker.
  assert.match(workPage, /const availableAssignedDepartments = availableDepartments/);
  assert.match(workPage, /Browse all Office/);
});
