import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checks = [
  ["../src/components/AdminOrganizationPanel.tsx", "organization"],
  ["../src/components/SuperAdminMonitoringPanel.tsx", "monitoring"],
  ["../src/components/SuperAdminSystemAnalyticsPanel.tsx", "analytics"],
  ["../src/components/SuperAdminProfilePanel.tsx", "officialProfile"],
];

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

test("stable Super Admin governance workspaces use dedicated bilingual namespaces", async () => {
  for (const [relativePath, namespace] of checks) {
    const [source, english, nepali] = await Promise.all([
      readFile(new URL(relativePath, import.meta.url), "utf8"),
      readCatalog("en", namespace),
      readCatalog("ne", namespace),
    ]);

    assert.match(
      source,
      new RegExp(`useTranslation\\(\\"${namespace}\\"\\)`),
      `${relativePath} must use the ${namespace} namespace`,
    );

    assert.ok(Object.keys(english).length > 0, `${namespace} English catalog is empty`);
    assert.deepEqual(
      Object.keys(english).sort(),
      Object.keys(nepali).sort(),
      `${namespace} top-level EN/NE catalog groups differ`,
    );
  }
});

test("I18N-5C keeps required dynamic governance translations in both languages", async () => {
  const required = {
    organization: [
      "summary.units",
      "summary.people",
      "summary.leadership",
      "filters.matching_one",
      "filters.matching_other",
      "tree.people_one",
      "tree.people_other",
      "tree.leaders_one",
      "tree.leaders_other",
      "actions.createChild",
      "readonly.title",
    ],
    monitoring: [
      "status.ACTIVE",
      "status.IDLE",
      "status.OFFLINE",
      "event.LOGIN",
      "event.LOGOUT",
      "event.PAGE_VIEW",
      "accountClass.SUPER_ADMIN",
      "accountClass.OFFICE_USER",
      "filters.office",
      "filters.orgUnit",
      "filters.active_one",
      "filters.active_other",
    ],
    analytics: [
      "hero.superAdmin",
      "overview.offices",
      "overview.enabledAccounts",
      "overview.onlineNow",
      "overview.needsAttention",
      "presence.active",
      "presence.idle",
      "presence.offline",
      "governance.pendingApproval",
      "governance.activationPending",
      "coverage.memberships",
      "coverage.units",
      "activity.actions",
      "activity.emergencySms",
    ],
    officialProfile: [
      "source.SYSTEM_CONFIG",
      "source.DATABASE_SETUP",
      "source.ACCOUNT_FALLBACK",
      "status.READY",
      "status.NOT_CONFIGURED",
      "status.INVALID_PHONE",
      "status.DUPLICATE_EMAIL",
      "status.DUPLICATE_PHONE",
    ],
  };

  for (const [namespace, keys] of Object.entries(required)) {
    const [english, nepali] = await Promise.all([
      readCatalog("en", namespace),
      readCatalog("ne", namespace),
    ]);

    for (const key of keys) {
      assert.equal(typeof getPath(english, key), "string", `missing en:${namespace}:${key}`);
      assert.equal(typeof getPath(nepali, key), "string", `missing ne:${namespace}:${key}`);
      assert.notEqual(getPath(english, key).trim(), "", `blank en:${namespace}:${key}`);
      assert.notEqual(getPath(nepali, key).trim(), "", `blank ne:${namespace}:${key}`);
    }
  }
});

test("I18N-5C does not reintroduce known hard-coded governance controls", async () => {
  const sources = await Promise.all(
    checks.map(([relativePath]) =>
      readFile(new URL(relativePath, import.meta.url), "utf8"),
    ),
  );
  const combined = sources.join("\n");
  const forbidden = [
    ">Organization Management<",
    ">Create division<",
    ">Create department<",
    ">Employee activity monitoring<",
    ">Activity logs<",
    ">Analytics report<",
    ">Personal account snapshot<",
    ">Official identity and emergency contact<",
    ">Try again<",
  ];

  for (const text of forbidden) {
    assert.equal(
      combined.includes(text),
      false,
      `Hard-coded I18N-5C UI text remains: ${text}`,
    );
  }
});

test("I18N-5C helper translations keep explicit namespace ownership", async () => {
  const [organizationSource, profileSource] = await Promise.all([
    readFile(new URL("../src/components/AdminOrganizationPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/SuperAdminProfilePanel.tsx", import.meta.url), "utf8"),
  ]);

  for (const key of [
    "errors.operationFailed",
    "readonly.title",
    "actions.createRoot",
    "actions.createChild",
  ]) {
    assert.match(
      organizationSource,
      new RegExp(`t\\(\\"${key.replaceAll(".", "\\.")}`),
      `${key} must remain in the organization workspace`,
    );
  }

  for (const key of [
    "source.SYSTEM_CONFIG",
    "source.DATABASE_SETUP",
    "source.ACCOUNT_FALLBACK",
    "status.READY",
    "date.notRecorded",
  ]) {
    assert.match(
      profileSource,
      new RegExp(`t\\(\\"${key.replaceAll(".", "\\.")}\\", \\{ ns: \\"officialProfile\\"`),
      `${key} must remain owned by the officialProfile namespace`,
    );
  }
});
