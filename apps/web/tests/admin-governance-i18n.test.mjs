import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checks = [
  ["../src/pages/AdminAccountRequestsPage.tsx", "requests"],
  ["../src/pages/ManagerAccountRequestsPage.tsx", "requests"],
  ["../src/pages/ManagerRequestDashboardPage.tsx", "requests"],
  ["../src/components/AdminAccountForm.tsx", "requests"],
  ["../src/components/AdminRequestDetailPanel.tsx", "requests"],
  ["../src/components/ManagerAccountRequestForm.tsx", "requests"],
  ["../src/components/ManagerRequestDetailPanel.tsx", "requests"],
  ["../src/components/ManagerRequestHistory.tsx", "requests"],
  ["../src/components/MyAccountStatusPanel.tsx", "requests"],
  ["../src/pages/TeamManagementPage.tsx", "teams"],
  ["../src/pages/ManagementPositionsPage.tsx", "positions"],
];

test("account, team and management-position workspaces use dedicated bilingual namespaces", async () => {
  for (const [relativePath, namespace] of checks) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(
      source,
      new RegExp(`useTranslation\\(\\"${namespace}\\"\\)`),
      `${relativePath} must use the ${namespace} namespace`,
    );
  }
});

test("I18N-5B does not reintroduce known hard-coded English controls", async () => {
  const sources = await Promise.all(
    checks.map(([relativePath]) =>
      readFile(new URL(relativePath, import.meta.url), "utf8"),
    ),
  );
  const combined = sources.join("\n");
  const forbidden = [
    ">Create Team<",
    ">Edit Team<",
    ">Delete Team<",
    ">Try Again<",
    ">Approve request<",
    ">Reject request<",
    ">Create account<",
    'aria-label="Close account form"',
    'placeholder="Explain what information must be corrected before resubmission."',
  ];

  for (const text of forbidden) {
    assert.equal(
      combined.includes(text),
      false,
      `Hard-coded I18N-5B UI text remains: ${text}`,
    );
  }
});
