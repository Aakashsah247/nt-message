import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../src/pages/ManagerAccountRequestsPage.tsx", import.meta.url);
const formUrl = new URL("../src/components/ManagerAccountRequestForm.tsx", import.meta.url);
const hierarchySelectorUrl = new URL("../src/components/AccountRequestHierarchySelector.tsx", import.meta.url);
const hierarchyUtilsUrl = new URL("../src/utils/account-request-hierarchy.ts", import.meta.url);
const detailPanelUrl = new URL("../src/components/ManagerRequestDetailPanel.tsx", import.meta.url);
const cssUrl = new URL("../src/styles/manager-workspace.css", import.meta.url);
const adminPageUrl = new URL("../src/pages/AdminAccountRequestsPage.tsx", import.meta.url);
const authorityUrl = new URL("../../api/src/account-requests/account-request-authority.service.ts", import.meta.url);

const [page, form, hierarchySelector, hierarchyUtils, detailPanel, css, adminPage, authority] = await Promise.all([
  readFile(pageUrl, "utf8"),
  readFile(formUrl, "utf8"),
  readFile(hierarchySelectorUrl, "utf8"),
  readFile(hierarchyUtilsUrl, "utf8"),
  readFile(detailPanelUrl, "utf8"),
  readFile(cssUrl, "utf8"),
  readFile(adminPageUrl, "utf8"),
  readFile(authorityUrl, "utf8"),
]);

test("P15 account requests opens on the canonical request-management workflow", () => {
  assert.doesNotMatch(page, /RequestWorkspaceTab|MY_ACCOUNT_STATUS|MyAccountStatusPanel/);
  assert.match(page, /ManagerAccountRequestForm/);
  assert.match(page, /ManagerRequestHistory/);
  assert.doesNotMatch(page, /manager-requests-page__security-notice/);
  assert.doesNotMatch(page, /manager-requests-page__authority/);
});

test("P15 account request creation uses only Office and OrgUnit V3 placement", () => {
  assert.match(form, /requestContext\.office\.id/);
  assert.match(form, /intendedOrgUnitId/);
  assert.match(form, /AccountRequestHierarchySelector/);
  assert.doesNotMatch(form, /divisionId|departmentId|requestedRole|managementPosition/i);
});

test("P15 account request placement uses cascading formal hierarchy selectors", () => {
  for (const code of ["DIVISION", "DEPARTMENT", "SECTION", "UNIT"]) {
    assert.match(hierarchySelector, new RegExp(`"${code}"`));
  }
  assert.match(hierarchySelector, /parentOrgUnitId === parentId/);
  assert.match(hierarchyUtils, /getDefaultAccountRequestTargetId/);
  assert.match(form, /AccountRequestHierarchySelector/);
  assert.match(detailPanel, /AccountRequestHierarchySelector/);
  assert.doesNotMatch(form, /buildUnitPath|selectOrgUnit/);
});

test("P15 request UI removes obsolete authority and scope-card styling", () => {
  assert.doesNotMatch(css, /manager-requests-page__context/);
  assert.doesNotMatch(css, /manager-request-form__placement/);
  assert.doesNotMatch(css, /manager-requests-page__security-notice/);
  assert.doesNotMatch(css, /manager-requests-page__scope-strip/);
  assert.doesNotMatch(css, /manager-request-form-card__role/);
});


test("P15 V3 account requests keep hierarchy roles separate from Team Lead", () => {
  assert.match(form, /requestedOrganizationRole/);
  assert.match(form, /ORG_UNIT_HEAD/);
  assert.match(form, /canRequestHead/);
  assert.doesNotMatch(form, /TEAM_LEAD|Team Lead/);
});

test("P15 V3 account request form uses Nepal phone validation", () => {
  assert.match(form, /9779\\d\{9\}/);
});


test("P15 V3 account-request authority is hierarchy-head scoped and excludes Team Lead", () => {
  assert.match(authority, /OrgLeadershipType\.OFFICE_HEAD/);
  assert.match(authority, /OrgLeadershipType\.ORG_UNIT_HEAD/);
  assert.match(authority, /depth: \{ gt: 0 \}/);
  assert.match(authority, /FORMAL_ORG_UNIT_TYPE_CODES/);
  for (const code of ["DIVISION", "DEPARTMENT", "SECTION", "UNIT"]) {
    assert.match(authority, new RegExp(`'${code}'`));
  }
  assert.match(authority, /code: \{ in: \[\.\.\.FORMAL_ORG_UNIT_TYPE_CODES\] \}/);
  assert.doesNotMatch(authority, /OperationalTeamLeadAssignment|TEAM_LEAD/);
});

test("P15 Super Admin request queue is Office-wise and keeps legacy account roles out of review", () => {
  assert.match(adminPage, /getOrganizationOffices/);
  assert.match(adminPage, /officeId/);
  assert.match(adminPage, /allOffices/);
  assert.match(adminPage, /requestedOrganizationRole/);
  assert.doesNotMatch(adminPage, /requestedBy\.role/);
  assert.doesNotMatch(adminPage, /dateFrom|dateTo/);
});

test("P15 Super Admin queue shows activation email delivery without restoring lifecycle column", () => {
  assert.match(adminPage, /common\.activationEmail/);
  assert.match(adminPage, /activationEmailStatus/);
  assert.match(adminPage, /activationEmailSentAt/);
  assert.doesNotMatch(adminPage, /common\.lifecycle/);
});
