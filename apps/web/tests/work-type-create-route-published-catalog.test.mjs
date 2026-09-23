import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [app, page, service, types] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/ManagementWorkPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/services/work-main-parity.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/types/work-main-parity.ts", import.meta.url), "utf8"),
]);

test("the live /work/create route renders the published create-context catalog, not the fixed eight labels", () => {
  const routeStart = app.indexOf('path="/work/create"');
  const routeEnd = app.indexOf('path="/work/:workItemId/edit"', routeStart);
  const route = app.slice(routeStart, routeEnd);

  assert.match(route, /<ManagementWorkPage \/>/);
  assert.match(page, /return options\?\.workTypes \?\? \[\]/);
  assert.match(page, /value=\{createForm\.workTypeVersionId\}/);
  assert.match(page, /key=\{type\.workTypeVersionId\}/);
  assert.match(page, /\{type\.name\}/);
  assert.doesNotMatch(page, /WORK_TYPES\.filter\(\(workType\) => allowed\.has\(workType\.value\)\)/);
});

test("custom published versions retain unique identity instead of collapsing to ROUTINE_TASK", () => {
  assert.match(types, /code: string;/);
  assert.match(types, /template: "STANDARD" \| "TEAM_SALES" \| "ADMINISTRATIVE";/);
  assert.match(types, /requiresSalesParticipant: boolean;/);
  assert.match(service, /code: workType\.code/);
  assert.match(service, /template,/);
  assert.match(service, /requiresSalesParticipant: Boolean\(workType\.requiresSalesParticipant\)/);
  assert.match(service, /item\.workTypeVersionId === payload\.workTypeVersionId/);
  assert.doesNotMatch(
    service.slice(service.indexOf("export async function createManagementWorkItem")),
    /item\.code === currentCode/,
  );
});

test("custom template behavior uses the published template for admin and sales rules", () => {
  assert.match(page, /selectedV3WorkType\?\.template === "ADMINISTRATIVE"/);
  assert.match(page, /selectedV3WorkType\?\.requiresSalesParticipant/);
  assert.match(service, /workType\.template === "ADMINISTRATIVE"/);
});
