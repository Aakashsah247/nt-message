#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');

const roots = [
  path.join(repoRoot, 'apps/api/src'),
  path.join(repoRoot, 'apps/web/src'),
  path.join(repoRoot, 'packages'),
];

const schemaPath = path.join(repoRoot, 'apps/api/prisma/schema.prisma');

const legacyPatterns = [
  ['legacy account roles', /\b(SENIOR_MANAGEMENT|TEAM_MANAGER)\b/g],
  ['legacy hierarchy ids', /\b(divisionId|departmentId)\b/g],
  ['legacy hierarchy models', /\b(Division|Department|DepartmentTeam)\b/g],
  ['legacy management models', /\b(ManagementPosition|ManagementAssignment)\b/g],
  ['legacy work enum', /\bWorkItemType\b/g],
  ['legacy work team/manager fields', /\b(assignedTeamId|responsibleManagerAccountId)\b/g],
  ['legacy fixed-scope message request reasons', /\b(CROSS_DIVISION|CROSS_DEPARTMENT)\b/g],
  ['legacy work-type bridge', /\blegacyWorkItemType\b/g],
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'generated') {
        continue;
      }
      files.push(...walk(fullPath));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    if (/\.(spec|test)\.[^.]+$/.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

const runtimeFiles = roots.flatMap(walk);
const rows = [];

for (const [label, regex] of legacyPatterns) {
  let runtimeMatches = 0;
  let runtimeFilesWithMatch = 0;
  for (const file of runtimeFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(regex);
    if (!matches?.length) continue;
    runtimeMatches += matches.length;
    runtimeFilesWithMatch += 1;
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const schemaMatches = schemaContent.match(regex)?.length ?? 0;

  rows.push({
    label,
    runtimeFiles: runtimeFilesWithMatch,
    runtimeMatches,
    schemaMatches,
  });
}

console.log('Phase 13 legacy dependency census');
console.log('=================================');
console.table(rows);
console.log(`Runtime files scanned: ${runtimeFiles.length}`);
console.log('Tests and historical migrations are intentionally excluded.');
console.log('Phase 13 is complete only when active runtime/schema legacy dependencies reach the approved final target.');
