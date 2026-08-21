import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  adminDashboard: new URL("../src/components/SuperAdminDashboardOverview.tsx", import.meta.url),
  adminPage: new URL("../src/pages/AdminDashboardPage.tsx", import.meta.url),
  directoryPage: new URL("../src/pages/DirectoryPage.tsx", import.meta.url),
  directoryList: new URL("../src/components/EmployeeDirectory.tsx", import.meta.url),
  directoryDetail: new URL("../src/components/EmployeeDirectoryDetailPanel.tsx", import.meta.url),
};

function getPath(value, path) {
  return path.split(".").reduce((current, segment) => current?.[segment], value);
}

async function readCatalog(language, namespace) {
  const url = new URL(
    `../src/i18n/locales/${language}/${namespace}.json`,
    import.meta.url,
  );
  return JSON.parse(await readFile(url, "utf8"));
}

test("Super Admin dashboard uses the admin translation namespace", async () => {
  const [source, pageSource, english, nepali] = await Promise.all([
    readFile(files.adminDashboard, "utf8"),
    readFile(files.adminPage, "utf8"),
    readCatalog("en", "admin"),
    readCatalog("ne", "admin"),
  ]);

  assert.match(source, /useTranslation\("admin"\)/);
  assert.match(pageSource, /useTranslation\("admin"\)/);

  for (const key of [
    "dashboard.title",
    "dashboard.metrics.pendingApprovals",
    "dashboard.attention.title",
    "dashboard.quickActions.directory",
    "dashboard.lifecycle.title",
    "dashboard.activity.title",
    "dashboard.privacy.title",
    "session.unavailable",
  ]) {
    assert.equal(typeof getPath(english, key), "string", `missing en:${key}`);
    assert.equal(typeof getPath(nepali, key), "string", `missing ne:${key}`);
  }

  for (const hardcoded of [
    "Super Admin Dashboard",
    "Operations center",
    "Governance queue is clear",
    "Review all requests",
    "Privacy-safe governance overview",
  ]) {
    assert.equal(
      source.includes(`>${hardcoded}<`),
      false,
      `admin dashboard still contains hard-coded UI text: ${hardcoded}`,
    );
  }
});

test("Directory list and employee detail use the directory translation namespace", async () => {
  const [pageSource, listSource, detailSource, english, nepali] = await Promise.all([
    readFile(files.directoryPage, "utf8"),
    readFile(files.directoryList, "utf8"),
    readFile(files.directoryDetail, "utf8"),
    readCatalog("en", "directory"),
    readCatalog("ne", "directory"),
  ]);

  assert.match(pageSource, /useTranslation\("directory"\)/);
  assert.match(listSource, /useTranslation\("directory"\)/);
  assert.match(detailSource, /useTranslation\("directory"\)/);

  for (const key of [
    "page.title",
    "page.scopedAccess",
    "list.search.placeholder",
    "list.filters.clear",
    "list.table.currentPosition",
    "list.pagination.page",
    "detail.organization.title",
    "detail.contact.title",
    "detail.account.title",
    "detail.roleChange.title",
    "detail.accountAccess.suspend",
    "detail.lifecycle.title",
    "detail.history.title",
    "detail.archive.title",
    "detail.record.title",
  ]) {
    assert.equal(typeof getPath(english, key), "string", `missing en:${key}`);
    assert.equal(typeof getPath(nepali, key), "string", `missing ne:${key}`);
  }

  for (const [source, patterns] of [
    [pageSource, ["Organization Directory", "Scoped access"]],
    [listSource, ["Search directory", "Clear filters", "No employees found"]],
    [detailSource, ["Change organizational role", "End Patan Branch access", "Archive former employee"]],
  ]) {
    for (const hardcoded of patterns) {
      assert.equal(
        source.includes(`>${hardcoded}<`),
        false,
        `directory UI still contains hard-coded text: ${hardcoded}`,
      );
    }
  }
});
