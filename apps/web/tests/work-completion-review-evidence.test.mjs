import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [management, employee, adapter, css, parityCss, workItems, fileDownload] = await Promise.all([
  readFile(new URL("../src/pages/ManagementWorkPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/pages/EmployeeWorkPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/services/work-main-parity.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/work-management.css", import.meta.url), "utf8"),
  readFile(new URL("../src/styles/work-main-parity.css", import.meta.url), "utf8"),
  readFile(new URL("../../api/src/work-management/work-items.service.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/utils/file-download.ts", import.meta.url), "utf8"),
]);

test("manager approval review renders submitted completion evidence", () => {
  assert.match(management, /function CompletionEvidenceReview/);
  assert.match(management, /latestReport\.evidence\.length > 0/);
  assert.match(management, /Submitted photos and files/);
  assert.match(management, /downloadWorkCompletionEvidence/);
  assert.match(management, /<img src=\{previewUrl\}/);
  assert.match(management, /openCompletionEvidence\(latestReport\.id, evidence\)/);
  assert.match(management, /downloadCompletionEvidenceFile/);
  assert.match(management, /onDownload=\{\(evidence\) =>/);
  assert.match(management, />\s*Download\s*<\/button>/);
});

test("completion evidence retention metadata survives Work detail mapping", () => {
  for (const field of ["expiresAt", "expiredAt", "purgedAt"]) {
    assert.match(workItems, new RegExp(`${field}: true`));
    assert.match(adapter, new RegExp(`${field}: evidence\\.${field} \\?\\? null`));
  }
});

test("review evidence gallery is responsive and uses the Work review visual system", () => {
  assert.match(css, /\.management-work-review-summary__evidence-grid/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.management-work-review-summary__evidence-preview img/);
  assert.match(css, /object-fit: cover/);
  assert.match(css, /\.management-work-review-summary__evidence-download/);
});

test("Sales attachments and submitted completion evidence expose explicit downloads", () => {
  assert.match(employee, /const downloadSalesAttachment = async/);
  assert.match(employee, /const downloadCompletionEvidence = async/);
  assert.match(employee, /sales-download-\$\{attachment\.id\}/);
  assert.match(employee, /completion-download-\$\{evidence\.id\}/);
  assert.match(employee, /downloadBlobFile\(/);
  assert.match(employee, /: "Download"/);
  assert.match(parityCss, /\.employee-work-sales__file-actions/);
  assert.match(parityCss, /\.employee-work-completion__evidence-download/);
  assert.match(fileDownload, /anchor\.download = filename/);
});
