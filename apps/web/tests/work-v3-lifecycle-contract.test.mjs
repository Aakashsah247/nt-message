import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/ManagementWorkPage.tsx", import.meta.url), "utf8");
const adapter = readFileSync(new URL("../src/services/work-main-parity.service.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/types/work-main-parity.ts", import.meta.url), "utf8");
const workItems = readFileSync(new URL("../../api/src/work-management/work-items.service.ts", import.meta.url), "utf8");
const lifecycle = readFileSync(new URL("../../api/src/work-management/work-lifecycle.service.ts", import.meta.url), "utf8");
const createDto = readFileSync(new URL("../../api/src/work-management/dto/create-work-item.dto.ts", import.meta.url), "utf8");

test("Create Work keeps the Work Type suggestion but lets the user choose the Primary Execution OrgUnit", () => {
  assert.match(types, /interface WorkAssignmentTypeOption/);
  assert.match(adapter, /primaryOwnerOrgUnitId/);
  assert.match(adapter, /mainTeamIds/);
  assert.match(adapter, /mainAssigneeAccountIds/);
  assert.match(adapter, /reviewerAccountIds/);
  assert.match(page, /selectedV3WorkType/);
  assert.match(page, /primaryOwnerOrgUnitId/);
  assert.match(createDto, /primaryExecutionOrgUnitId!: string/);
  assert.match(adapter, /primaryExecutionOrgUnitId: payload\.primaryExecutionOrgUnitId/);
  assert.match(page, /Primary execution organization/);
  assert.match(page, /new Set\(selectedV3WorkType\.mainTeamIds\)/);
  assert.match(page, /new Set\(selectedV3WorkType\.mainAssigneeAccountIds\)/);
  assert.match(page, /new Set\(selectedV3WorkType\.reviewerAccountIds\)/);
  assert.doesNotMatch(page, /id="create-work-recipient-level"/);
});

test("Sales and Supporting Staff use any selected Office OrgUnit subtree instead of the Main Team division", () => {
  assert.match(types, /ancestorOrgUnitIds: string\[\]/);
  assert.match(page, /candidateUnit\.ancestorOrgUnitIds\.includes\(selectedSalesDepartment\.id\)/);
  assert.match(page, /candidateUnit\.ancestorOrgUnitIds\.includes\(selectedSupportingDepartment\.id\)/);
  assert.doesNotMatch(page, /targetWorkDivisionId/);
  assert.match(adapter, /salesOrgUnitId: payload\.salesOrgUnitId/);
  assert.match(adapter, /supportOrgUnitId: payload\.supportOrgUnitId/);
  assert.match(createDto, /supportOrgUnitId\?: string/);
  assert.match(workItems, /ancestorOrgUnitId: supportOrgUnit\.id/);
  assert.match(workItems, /descendantOrgUnitId: supportMemberOrgUnitId/);
});

test("Main Team and Administrative individual assignment follow the selected Primary Execution OrgUnit subtree", () => {
  assert.match(workItems, /ancestorOrgUnitId: primaryExecutionOrgUnit\.id/);
  assert.match(workItems, /descendantOrgUnitId: mainAssigneeOrgUnitId/);
  assert.match(workItems, /selected Primary Execution OrgUnit or one of its child units/);
  assert.match(workItems, /primaryOwnerOrgUnitId: primaryExecutionOrgUnit\.id/);
  assert.match(page, /teamUnit\.ancestorOrgUnitIds\.includes\(selectedAssignedDepartment\.id\)/);
});

test("Main, Sales and Support organization pickers have independent My branch, Recent and Browse all Office shortcuts", () => {
  assert.match(page, /type OrgUnitPickerMode = "MY_BRANCH" \| "RECENT" \| "ALL_OFFICE"/);
  assert.match(page, /My branch/);
  assert.match(page, /Recent/);
  assert.match(page, /Browse all Office/);
  assert.match(page, /mainOrgPickerMode/);
  assert.match(page, /salesOrgPickerMode/);
  assert.match(page, /supportOrgPickerMode/);
  assert.match(page, /Independent from the Main assignment/);
  assert.match(page, /Independent from Main and \${createSalesDisplayLabel}/);
});


test("Browse all Office uses the Office-wide create-context OrgUnit registry without widening management oversight", () => {
  assert.match(adapter, /buildOfficeOrgTree\(context\.orgUnits \?\? \[\]\)/);
  assert.match(adapter, /assignmentUnitById/);
  assert.match(adapter, /assignmentDepartments/);
  assert.match(adapter, /departments: org\.assignmentDepartments/);
  assert.match(adapter, /const flat = flattenTree\(tree\.tree \?\? \[\]\)/);
  assert.match(adapter, /organization tree is authority-scoped/);
});


test("Browse all Office selects a Division before showing only that Division subtree", () => {
  assert.match(page, /label="Division"/);
  assert.match(page, /placeholder="Select division"/);
  assert.match(page, /option\.divisionId === allOfficeDivisionId/);
  assert.match(page, /Select organization in this division/);
  assert.match(page, /Only that Division and its child organization units are shown next/);
});

test("shared Main Team acknowledge and start both require current temporal membership", () => {
  const acknowledgeStart = workItems.indexOf("async acknowledge(");
  const startStart = workItems.indexOf("async start(");
  const acknowledge = workItems.slice(acknowledgeStart, startStart);
  assert.match(acknowledge, /startsAt: \{ lte: now \}/);
  assert.match(acknowledge, /endsAt: \{ gt: now \}/);
  assert.match(acknowledge, /Only a Main Team member can claim this Work when their membership is current/);
});

test("completion review notifies the Responsible Reviewer and preserves completedAt when closing", () => {
  assert.match(lifecycle, /notificationRecipients: result\.responsibleReviewerAccountId/);
  assert.doesNotMatch(lifecycle, /notificationRecipients: result\.workItem\.createdBy/);
  const closeStart = lifecycle.indexOf("async close(");
  const reopenStart = lifecycle.indexOf("async reopen(");
  const closeMethod = lifecycle.slice(closeStart, reopenStart);
  assert.match(closeMethod, /status: WorkItemStatus\.CLOSED/);
  assert.match(closeMethod, /closedAt,/);
  assert.doesNotMatch(closeMethod, /completedAt: closedAt/);
});

test("Responsible Reviewer defaults to the creator and optional reassignment stays V3-authorized", () => {
  assert.match(page, /id="create-work-responsible-reviewer"/);
  assert.doesNotMatch(page, /id="create-work-responsible-reviewer"[\s\S]{0,120}required/);
  assert.match(page, /Use my account \(default\)/);
  assert.match(page, /Reviewer defaults to you/);
  assert.match(adapter, /const reviewer = payload\.responsibleManagerAccountId \|\| undefined/);
  assert.match(createDto, /responsibleReviewerAccountId\?: string/);
  assert.match(workItems, /requestedAccountId \|\| requestedAccountId === creatorAccountId/);
  assert.match(workItems, /return \{ id: creatorAccountId \}/);
  assert.match(workItems, /Individual Administrative Work is reviewed by the Head who created the Work/);
  assert.match(adapter, /Administrative Work delegation is not available on the V3 create contract/);
  assert.match(page, /const showDelegateWork = false/);
});


test('Create Work never advances to a blank Main assignment while V3 options are still loading', () => {
  assert.match(page, /async function continueCreateWizard\(\): Promise<void>/);
  assert.match(page, /refreshedOptions = await listManagementAssignmentOptions/);
  assert.match(page, /Loading assignment options…/);
  assert.match(page, /Reload assignment options/);
  assert.match(page, /selectedV3WorkType &&[\s\S]*Assignment options are not ready/);
  assert.match(page, /setActionError\(""\)/);
});


test('Create Work preserves classic creator accountability without requiring a manual reviewer selection', () => {
  assert.match(page, /effectiveResponsibleReviewerAccountId/);
  assert.match(page, /createForm\.responsibleManagerAccountId \|\| account\?\.id/);
  assert.match(page, /the Head who creates the Work reviews it by default/);
  assert.match(page, /another eligible V3 Head/);
});

test('Work Management removes the heavy Work by organization overview while preserving queue filters', () => {
  assert.doesNotMatch(page, /Work by organization/);
  assert.doesNotMatch(page, /getManagementOrganizationSummary/);
  assert.match(page, /availableFilterDivisions/);
  assert.match(page, /aria-label="Filter by org unit"/);
});
