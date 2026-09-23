import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const [page,route,css]=await Promise.all([
  readFile(new URL("../src/pages/WorkReportsPage.tsx",import.meta.url),"utf8"),
  readFile(new URL("../src/pages/WorkReportsRoutePage.tsx",import.meta.url),"utf8"),
  readFile(new URL("../src/styles/work-management.css",import.meta.url),"utf8"),
]);
test("Super Admin Reports remains dedicated read-only multi-office",()=>{assert.match(route,/account\?\.accountClass === "SUPER_ADMIN"/);assert.match(page,/getOrganizationOffices/);assert.match(page,/Read-only Work and Duty reporting for the selected Office/);assert.match(page,/Read-only oversight/);});
test("filters are report-specific with presets and reset",()=>{assert.match(page,/type ReportPeriodPreset/);assert.match(page,/7 Days/);assert.match(page,/30 Days/);assert.match(page,/resetReportFilters/);assert.match(page,/view === "WORK_RECORDS" \|\| view === "DUTY"/);assert.match(page,/view === "OVERVIEW" \|\| view === "WORK_RECORDS"/);});
test("Performance references use semantic display values",()=>{assert.match(page,/reference\.display/);assert.match(page,/reportReferencesDisplay\(row\.references\)/);assert.doesNotMatch(page,/row\.references\.join\(/);});
test("Performance has desktop and mobile presentations",()=>{assert.match(page,/NTC Technical Performance Report/);assert.match(page,/superadmin-performance-table/);assert.match(page,/superadmin-performance-cards/);assert.match(page,/Administrative Work is excluded/);});
test("Overview uses finalized V3 contract",()=>{assert.match(page,/overview\.work\.totals\.activeAtEnd/);assert.match(page,/overview\.workflow\.waitingForApproval/);assert.doesNotMatch(page,/organizationPerformance|teamExecution/);});
test("Nepal Telecom styling is responsive and reduced-motion safe",()=>{assert.match(css,/--nt-report-blue/);assert.match(css,/--nt-report-gold/);assert.match(css,/@keyframes nt-report-enter/);assert.match(css,/@media\s*\(\s*max-width:\s*820px\s*\)/);assert.match(css,/prefers-reduced-motion/);});

