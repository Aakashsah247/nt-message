import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL(
  "../src/components/SuperAdminMonitoringPanel.tsx",
  import.meta.url,
);
const typeUrl = new URL("../src/types/monitoring.ts", import.meta.url);
const serviceUrl = new URL(
  "../../api/src/monitoring/monitoring.service.ts",
  import.meta.url,
);
const queryDtoUrl = new URL(
  "../../api/src/monitoring/dto/super-admin-activity-log-query.dto.ts",
  import.meta.url,
);

test("Monitoring & Audit uses V3 account class and Office/OrgUnit scope", async () => {
  const [panel, types, service, queryDto] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(typeUrl, "utf8"),
    readFile(serviceUrl, "utf8"),
    readFile(queryDtoUrl, "utf8"),
  ]);
  const combined = [panel, types, service, queryDto].join("\n");

  assert.match(combined, /accountClass/);
  assert.match(combined, /officeId/);
  assert.match(combined, /officeName/);
  assert.match(combined, /orgUnitId/);
  assert.match(combined, /orgUnitName/);
  assert.match(combined, /orgUnitType/);

  assert.doesNotMatch(queryDto, /AccountRole/);
  assert.doesNotMatch(service, /query\.role/);
  assert.doesNotMatch(service, /query\.department/);
  assert.doesNotMatch(panel, /filters\.role/);
  assert.doesNotMatch(panel, /filters\.department/);
  assert.doesNotMatch(types, /\bdivision:\s*string/);
  assert.doesNotMatch(types, /\bdepartment:\s*string/);
});

test("Monitoring audit trail requests newest events first", async () => {
  const service = await readFile(serviceUrl, "utf8");

  assert.match(
    service,
    /activityEvent\.findMany\([\s\S]*orderBy:\s*\{\s*occurredAt:\s*'desc'/,
  );
});


test("Monitoring employee rows use protected profile photos with a resilient initials fallback", async () => {
  const [panel, types, service, css] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(typeUrl, "utf8"),
    readFile(serviceUrl, "utf8"),
    readFile(new URL("../src/styles/monitoring-workspace.css", import.meta.url), "utf8"),
  ]);

  assert.match(service, /profilePhotoKey:\s*true/);
  assert.match(
    service,
    /profilePhotoKey:[\s\S]*account\.profilePhotoKey \?\? account\.employee\?\.profilePhotoKey \?\? null/,
  );
  assert.match(types, /profilePhotoKey:\s*string \| null/);
  assert.match(panel, /createMessagingProfilePhotoObjectUrl/);
  assert.match(panel, /<MonitoringAvatar employee=\{employee\} photoUrl=\{photoUrl\}/);
  assert.match(panel, /URL\.revokeObjectURL/);
  assert.match(css, /\.monitoring-avatar img[\s\S]*object-fit:\s*cover/);
});

test("Monitoring status badges stay on one line and use a compact state indicator", async () => {
  const css = await readFile(
    new URL("../src/styles/monitoring-workspace.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.monitoring-status[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /\.monitoring-status::before/);
  assert.match(css, /overflow-wrap:\s*normal !important/);
});
