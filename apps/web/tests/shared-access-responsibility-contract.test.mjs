import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../src/", import.meta.url);
const apiRoot = new URL("../../api/src/", import.meta.url);

async function web(path) {
  return readFile(new URL(path, webRoot), "utf8");
}

async function api(path) {
  return readFile(new URL(path, apiRoot), "utf8");
}

test("Shared Access exposes exactly nine business responsibilities instead of atomic leadership permissions", async () => {
  const capabilities = await api("organization/organization-capabilities.ts");
  const panel = await web("components/organization/OrganizationDelegationPanel.tsx");

  for (const responsibility of [
    "shared.organization_directory_view",
    "shared.organization_management",
    "shared.work_management",
    "shared.work_type_management",
    "shared.duty_roster_management",
    "shared.team_management",
    "shared.reports_export",
    "shared.account_request_coordination",
    "shared.official_communication_management",
  ]) {
    assert.match(capabilities, new RegExp(responsibility.replaceAll(".", "\\.")));
  }

  assert.match(panel, /availableResponsibilities/);
  assert.doesNotMatch(panel, /availableCapabilities/);
  assert.doesNotMatch(panel, /CAPABILITY_KEYS\[item/);

  const bundleSection = capabilities.slice(
    capabilities.indexOf("export const SHARED_RESPONSIBILITY_CAPABILITIES"),
    capabilities.indexOf("export function sharedResponsibilitiesForCapability"),
  );
  assert.doesNotMatch(bundleSection, /LEADERSHIP_ASSIGN(?:_|,|\])/);
  assert.doesNotMatch(bundleSection, /LEADERSHIP_ASSIGN_ACTING/);
  assert.doesNotMatch(bundleSection, /LEADERSHIP_ASSIGN_DEPUTY/);
  assert.match(bundleSection, /WORK_TYPE_MANAGEMENT[\s\S]*WORK_TYPE_VIEW[\s\S]*WORK_TYPE_DRAFT/);
  assert.doesNotMatch(bundleSection, /WORK_TYPE_MANAGEMENT[\s\S]{0,220}WORK_TYPE_PUBLISH/);
  assert.doesNotMatch(bundleSection, /SYSTEM_SETTINGS|SYSTEM_SECURITY|SYSTEM_AUDIT/);
});

test("each Shared Access responsibility maps to the backend capability used by its real workspace", async () => {
  const capabilities = await api("organization/organization-capabilities.ts");
  const hierarchy = await api("organization/organization-hierarchy.service.ts");
  const workScope = await api("work-management/work-scope.service.ts");
  const workTypes = await api("work-management/work-type-v3.service.ts");
  const duty = await api("work-management/duty-authorization.service.ts");
  const reports = await api("work-management/work-reports.service.ts");
  const teams = await api("team-management/team-management.service.ts");
  const requests = await api("account-requests/account-request-authority.service.ts");
  const announcements = await api("announcements/announcements.service.ts");
  const conversations = await api("conversations/conversations.service.ts");
  const directory = await api("directory/directory.service.ts");

  assert.match(capabilities, /ORGANIZATION_DIRECTORY_VIEW[\s\S]*ORGANIZATION_VIEW[\s\S]*MEMBERSHIP_VIEW[\s\S]*LEADERSHIP_VIEW/);
  assert.match(capabilities, /ORGANIZATION_MANAGEMENT[\s\S]*ORGANIZATION_CREATE_UNIT[\s\S]*MEMBERSHIP_TRANSFER_INTERNAL/);
  assert.match(capabilities, /WORK_MANAGEMENT[\s\S]*WORK_VIEW[\s\S]*WORK_ASSIGN[\s\S]*WORK_APPROVE_STAGE[\s\S]*WORK_RETURN_STAGE/);
  assert.match(capabilities, /WORK_TYPE_MANAGEMENT[\s\S]*WORK_TYPE_VIEW[\s\S]*WORK_TYPE_DRAFT/);
  assert.match(capabilities, /DUTY_ROSTER_MANAGEMENT[\s\S]*DUTY_VIEW[\s\S]*DUTY_MANAGE/);
  assert.match(capabilities, /TEAM_MANAGEMENT[\s\S]*TEAM_MANAGE/);
  assert.match(capabilities, /REPORTS_EXPORT[\s\S]*REPORTS_VIEW[\s\S]*CAPABILITIES\.REPORTS_EXPORT/);
  assert.match(capabilities, /ACCOUNT_REQUEST_COORDINATION[\s\S]*USERS_REQUEST_CREATE/);
  assert.match(capabilities, /OFFICIAL_COMMUNICATION_MANAGEMENT[\s\S]*ANNOUNCEMENT_PUBLISH[\s\S]*OFFICIAL_GROUP_MANAGE/);

  assert.match(hierarchy, /grantKeyAllowsCapability/);
  assert.match(hierarchy, /hasDelegatedWorkManagement/);
  assert.match(hierarchy, /hasDelegatedWorkTypeManagement/);
  assert.match(hierarchy, /hasDelegatedDutyManagement/);
  assert.match(hierarchy, /hasDelegatedTeamManagement/);
  assert.match(hierarchy, /hasDelegatedReports/);
  assert.match(hierarchy, /hasDelegatedAccountRequests/);

  assert.match(workScope, /delegationGrantKeysForCapability\(CAPABILITIES\.WORK_ASSIGN\)/);
  assert.match(workTypes, /CAPABILITIES\.WORK_TYPE_DRAFT/);
  assert.match(workTypes, /Delegated Work Type Management may change only Information fields/);
  assert.match(duty, /CAPABILITIES\.DUTY_MANAGE/);
  assert.match(reports, /CAPABILITIES\.REPORTS_VIEW/);
  assert.match(teams, /CAPABILITIES\.TEAM_MANAGE/);
  assert.match(requests, /CAPABILITIES\.USERS_REQUEST_CREATE/);
  assert.match(announcements, /CAPABILITIES\.ANNOUNCEMENT_PUBLISH/);
  assert.match(conversations, /delegationGrantKeysForCapability\([\s\S]*CAPABILITIES\.OFFICIAL_GROUP_MANAGE/);
  assert.match(directory, /delegationGrantKeysForCapability/);
});

test("Shared Access grant form shows only responsibility headings and a full impact summary after selection", async () => {
  const panel = await web("components/organization/OrganizationDelegationPanel.tsx");
  const english = JSON.parse(
    await readFile(new URL("i18n/locales/en/organization.json", webRoot), "utf8"),
  );

  assert.match(panel, /<option key=\{item\} value=\{item\}>\{capabilityLabel\(item\)\}<\/option>/);
  assert.match(panel, /organization-delegation-access-summary/);
  assert.match(panel, /responsibilityCan\.map/);
  assert.match(panel, /responsibilityCannot\.map/);
  assert.match(panel, /includeDescendants/);
  assert.match(panel, /TEMPORARY/);
  assert.match(panel, /canRedelegate/);

  assert.deepEqual(
    Object.values(english.delegation.responsibilities).map((item) => item.title),
    [
      "Organization & Directory View",
      "Organization Management",
      "Work Management",
      "Work Type Management",
      "Duty Roster Management",
      "Team Management",
      "Reports & Export",
      "Account Request Coordination",
      "Official Communication Management",
    ],
  );
});
