import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function web(relativePath) {
  return readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
}

async function api(relativePath) {
  return readFile(
    new URL(`../../api/src/${relativePath}`, import.meta.url),
    "utf8",
  );
}

test("Work reports use versioned dynamic Work Types instead of the fixed eight-column matrix", async () => {
  const [page, adapter, backend] = await Promise.all([
    web("pages/WorkReportsMainPage.tsx"),
    web("services/work-main-parity.service.ts"),
    api("work-management/work-reports-classic.service.ts"),
  ]);

  assert.match(page, /section\.workTypeGroups/);
  assert.match(page, /row\.workType\.name/);
  assert.match(adapter, /workTypeOptions/);
  assert.match(adapter, /workTypeGroups/);
  assert.match(backend, /workTypeVersion/);
  assert.match(
    backend,
    /template:\s*\{\s*not:\s*WorkTypeTemplate\.ADMINISTRATIVE/,
  );
  assert.doesNotMatch(page, /const WORK_TYPES:/);
  assert.doesNotMatch(page, /PERFORMANCE_WORK_GROUPS/);
});

test("Report Reference is a single versioned Work Details field with fixed-type fallback", async () => {
  const [builder, service, backend] = await Promise.all([
    web("pages/WorkTypeManagementPage.tsx"),
    api("work-management/work-type-v3.service.ts"),
    api("work-management/work-reports-classic.service.ts"),
  ]);

  assert.match(builder, /Report Reference/);
  assert.match(service, /only one Work Details field as its Report Reference/);
  assert.match(
    backend,
    /this\.fieldConfig\(field\.config\)\.reportReference === true/,
  );
  assert.match(backend, /REQUEST_NUMBER|TOKEN_NUMBER/);
  assert.match(backend, /SERVICE_NUMBER/);
  assert.match(backend, /display:\s*`\$\{configured\.label\}: \$\{value\}`/);
});

test("report filters include Work Type and attention workflow stages without changing Work execution", async () => {
  const [adapter, queryDto, backend] = await Promise.all([
    web("services/work-main-parity.service.ts"),
    api("work-management/dto/work-report-office-query.dto.ts"),
    api("work-management/work-reports-classic.service.ts"),
  ]);

  assert.match(adapter, /workTypeId:\s*query\.workTypeId/);
  assert.match(adapter, /workflowStage:/);
  assert.match(queryDto, /WAITING_FOR_SALES/);
  assert.match(queryDto, /WAITING_FOR_APPROVAL/);
  assert.match(queryDto, /RETURNED_FOR_CORRECTION/);
  assert.match(backend, /WorkSalesCoordinationStatus\.READY_FOR_SALES/);
  assert.match(backend, /WorkCompletionReviewStatus\.INFORMATION_REQUESTED/);
});

test("saved Work and Duty reports are immutable snapshots", async () => {
  const [page, controller, backend, schema] = await Promise.all([
    web("pages/WorkReportsMainPage.tsx"),
    api("work-management/work-reports.controller.ts"),
    api("work-management/work-reports-classic.service.ts"),
    api("../prisma/schema.prisma"),
  ]);

  assert.match(page, /saveCurrentSnapshot/);
  assert.match(page, /Save Report/);
  assert.match(page, /<h2>Saved Reports<\/h2>/);
  assert.doesNotMatch(page, /setSnapshotsOpen/);
  assert.match(page, /immutable snapshot/);
  assert.match(page, /DUTY_ASSIGNMENTS/);
  assert.doesNotMatch(
    page,
    /Duty snapshots will be enabled when Duty Roster and Duty Report are corrected together/,
  );
  assert.match(controller, /offices\/:officeId\/snapshots/);
  assert.match(backend, /INSERT INTO "work_report_snapshots"/);
  assert.match(schema, /model WorkReportSnapshot/);
});

test("management Work reports use hierarchy scope and avoid per-row Work detail requests", async () => {
  const [adapter, backend] = await Promise.all([
    web("services/work-main-parity.service.ts"),
    api("work-management/work-reports-classic.service.ts"),
  ]);

  assert.match(backend, /buildOrganizationHierarchyWorkWhere\(actor\)/);
  assert.doesNotMatch(backend, /buildVisibleWorkWhere\(actor\)/);
  assert.doesNotMatch(adapter, /\/work-items\/\$\{record\.id\}/);
});

test("new Work report generation excludes permanently retired custom definitions but keeps deactivated published types", async () => {
  const backend = await api("work-management/work-reports-classic.service.ts");

  assert.match(
    backend,
    /versions:\s*\{\s*some:\s*\{\s*status:\s*WorkTypeVersionStatus\.PUBLISHED/,
  );
  assert.doesNotMatch(
    backend,
    /workTypeDefinition:\s*\{\s*is:\s*\{\s*isActive:\s*true/,
  );
});
