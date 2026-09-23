import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function hasRef(ref) {
  try {
    git("rev-parse", "--verify", "--quiet", ref);
    return true;
  } catch {
    return false;
  }
}

const reference = hasRef("main")
  ? "main"
  : hasRef("origin/main")
    ? "origin/main"
    : null;

if (!reference) {
  throw new Error(
    "Git main was not found. Restore the local main branch or origin/main before restoring the finalized Work UI.",
  );
}

function readMain(path) {
  return git("show", `${reference}:${path}`);
}

function write(relativePath, content) {
  const target = resolve(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  console.log(`Restored ${relativePath} from ${reference}`);
}

function adaptPage(source, { managementAuth = false } = {}) {
  let output = source
    .replaceAll('../services/work-management.service', '../services/work-main-parity.service')
    .replaceAll('../types/work-management', '../types/work-main-parity')
    .replaceAll('/work-management', '/work');

  if (managementAuth) {
    output = output.replaceAll('../context/AuthContext', '../context/WorkMainParityAuthContext');
  }

  // Preserve the finalized main-branch layout/flow while using V3 hierarchy
  // terminology at the data-selection boundary.
  output = output
    .replaceAll('label="Assigned department"', 'label="Assigned org unit"')
    .replaceAll('placeholder="Select responsible department"', 'placeholder="Select responsible org unit"')
    .replaceAll('label="Sales department"', 'label="Sales org unit"')
    .replaceAll('label="Supporting department"', 'label="Supporting org unit"')
    .replaceAll('placeholder="Select department"', 'placeholder="Select org unit"')
    .replaceAll('aria-label="Filter by department"', 'aria-label="Filter by org unit"')
    .replaceAll('>All departments<', '>All org units<')
    .replaceAll('Department Queue', 'Org Unit Queue')
    .replaceAll('Department Work', 'Org Unit Work')
    .replaceAll('Department work', 'Org Unit work');

  return output;
}

const management = adaptPage(
  readMain('apps/web/src/pages/ManagementWorkPage.tsx'),
  { managementAuth: true },
);
const employee = adaptPage(
  readMain('apps/web/src/pages/EmployeeWorkPage.tsx'),
);
const reports = adaptPage(
  readMain('apps/web/src/pages/WorkReportsPage.tsx'),
  { managementAuth: true },
);
const css = readMain('apps/web/src/styles/work-management.css');

write('apps/web/src/pages/ManagementWorkPage.tsx', management);
write('apps/web/src/pages/EmployeeWorkPage.tsx', employee);
write('apps/web/src/pages/WorkReportsMainPage.tsx', reports);
write('apps/web/src/styles/work-main-parity.css', css);

console.log(`Finalized Work UI restored from ${reference}.`);
