import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL(
  "../src/components/AdminOrganizationPanel.tsx",
  import.meta.url,
);
const appUrl = new URL("../src/App.tsx", import.meta.url);
const treeUrl = new URL(
  "../src/components/organization/OrganizationTree.tsx",
  import.meta.url,
);
const cssUrl = new URL(
  "../src/styles/organization-workspace.css",
  import.meta.url,
);
const enUrl = new URL(
  "../src/i18n/locales/en/organization.json",
  import.meta.url,
);
const neUrl = new URL(
  "../src/i18n/locales/ne/organization.json",
  import.meta.url,
);

test("Organization structure opens collapsed and separates active from inactive units", async () => {
  const [panel, tree] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(treeUrl, "utf8"),
  ]);

  assert.match(panel, /setExpandedIds\(new Set\(\)\)/);
  assert.match(panel, /routeIsInactive/);
  assert.match(panel, /navigate\("\/organization\/inactive"\)/);
  assert.match(panel, /unit\.isActive/);
  assert.match(panel, /inactiveUnits/);
  assert.match(tree, /expanded = forceExpanded \|\| expandedIds\.has\(node\.id\)/);
  assert.doesNotMatch(panel, /setStatusFilter/);
});


test("active and inactive organization views never mix unit statuses", async () => {
  const { filterTree, flattenTree } = await import(
    "../src/utils/organization-v3.ts"
  );
  const type = { id: "type", code: "UNIT", name: "Unit" };
  const activeChild = {
    id: "active-child",
    code: "AC",
    name: "Active child",
    isActive: true,
    orgUnitType: type,
    children: [],
  };
  const inactiveParent = {
    id: "inactive-parent",
    code: "IP",
    name: "Inactive parent",
    isActive: false,
    orgUnitType: type,
    children: [activeChild],
  };

  const active = flattenTree(filterTree([inactiveParent], "", "ACTIVE"));
  const inactive = flattenTree(filterTree([inactiveParent], "", "INACTIVE"));

  assert.deepEqual(active.map((unit) => unit.id), ["active-child"]);
  assert.equal(active.every((unit) => unit.isActive), true);
  assert.deepEqual(inactive.map((unit) => unit.id), ["inactive-parent"]);
  assert.equal(inactive.every((unit) => !unit.isActive), true);
});

test("Organization unit management stays on routed pages inside the same workspace shell", async () => {
  const [panel, app] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(appUrl, "utf8"),
  ]);

  assert.match(app, /path="\/organization\/\*"/);
  assert.match(panel, /from "react-router"/);
  assert.doesNotMatch(panel, /react-router-dom/);
  assert.match(panel, /useLocation\(\)/);
  assert.match(panel, /useNavigate\(\)/);
  assert.match(panel, /\/organization\/units\/\$\{unitId\}/);
  assert.match(panel, /\/organization\/units\/\$\{selectedUnit\.id\}\/edit/);
  assert.match(panel, /\/organization\/units\/\$\{selectedUnit\.id\}\/move/);
  assert.match(panel, /\/organization\/units\/\$\{selectedUnit\.id\}\/status/);
  assert.match(panel, /organization-route-toolbar/);
  assert.match(panel, /selectedUnit && !editorMode/);
  assert.match(panel, /editorMode && \(!selectedUnitId \|\| selectedUnit\)/);
});

test("Organization routed UI remains compact, responsive and bilingual", async () => {
  const [css, enRaw, neRaw] = await Promise.all([
    readFile(cssUrl, "utf8"),
    readFile(enUrl, "utf8"),
    readFile(neUrl, "utf8"),
  ]);
  const en = JSON.parse(enRaw);
  const ne = JSON.parse(neRaw);

  for (const selector of [
    ".organization-commandbar",
    ".organization-structure-switch",
    ".organization-structure-toolbar",
    ".organization-structure-search",
    ".organization-inactive-list",
    ".organization-unit-manager--route",
    ".organization-route-back",
    ".organization-route-state",
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(css, /@keyframes organization-route-enter/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.deepEqual(Object.keys(en.inactive), Object.keys(ne.inactive));
  assert.deepEqual(Object.keys(en.routes), Object.keys(ne.routes));
  assert.equal(en.tree.activeTitle, "Active office structure");
  assert.equal(en.inactive.title, "Inactive units");
});


test("Organization structure removes heavy dashboard-style chrome from the management surface", async () => {
  const [panel, tree, css] = await Promise.all([
    readFile(panelUrl, "utf8"),
    readFile(treeUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(panel, /organization-commandbar/);
  assert.match(panel, /organization-structure-toolbar/);
  assert.doesNotMatch(panel, /organization-overview-strip/);
  assert.doesNotMatch(panel, /organization-workspace__hero--compact/);
  assert.match(tree, /organization-hierarchy-item__context/);
  assert.match(tree, /hasChildren \? \(expanded \? "−" : "\+"\) : "•"/);
  assert.doesNotMatch(css, /\.organization-overview-strip\s*\{/);
  assert.doesNotMatch(css, /\.organization-search-bar\s*\{/);
  assert.match(css, /linear-gradient\(90deg, #0878be 0 72%, #f1b51c 72% 87%, #e83d4b 87% 100%\)/);
});
