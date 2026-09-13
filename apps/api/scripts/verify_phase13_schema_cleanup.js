#!/usr/bin/env node

const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to verify Phase 13 schema cleanup.');
  process.exit(2);
}

const retiredTables = [
  'legacy_org_unit_mappings',
  'management_assignments',
  'management_positions',
  'department_team_activities',
  'department_team_members',
  'department_teams',
  'departments',
  'divisions',
];

const retiredColumns = [
  ['employees', 'division_id'],
  ['employees', 'department_id'],
  ['operational_teams', 'legacy_department_team_id'],
  ['account_requests', 'division_id'],
  ['account_requests', 'department_id'],
  ['account_requests', 'management_position_id'],
  ['conversations', 'official_division_id'],
  ['conversations', 'official_department_id'],
  ['announcements', 'division_id'],
  ['announcements', 'department_id'],
  ['work_type_definitions', 'legacy_work_item_type'],
  ['work_items', 'type'],
  ['work_items', 'division_id'],
  ['work_items', 'department_id'],
  ['work_items', 'assigned_team_id'],
  ['work_items', 'responsible_manager_account_id'],
  ['work_help_requests', 'requested_department_id'],
  ['duty_shift_templates', 'division_id'],
  ['duty_shift_templates', 'department_id'],
  ['duty_schedule_series', 'division_id'],
  ['duty_schedule_series', 'department_id'],
  ['duty_assignments', 'division_id'],
  ['duty_assignments', 'department_id'],
  ['duty_coverage_requirements', 'department_id'],
  ['duty_exceptions', 'division_id'],
  ['duty_exceptions', 'department_id'],
  ['duty_holidays', 'division_id'],
  ['duty_holidays', 'department_id'],
];

const expectedEnums = new Map([
  ['AccountRole', ['SUPER_ADMIN', 'EMPLOYEE']],
  ['MessageRequestReason', ['PROTECTED_RECIPIENT', 'OUTSIDE_ORG_SCOPE']],
  ['OfficialGroupScopeType', ['OFFICE', 'ORG_UNIT']],
  ['AnnouncementAudienceType', ['OFFICIAL_GROUP', 'OFFICE', 'ORG_UNIT']],
]);

const retiredEnums = [
  'ManagementPositionType',
  'DepartmentWorkFunction',
  'DepartmentTeamActivityAction',
  'WorkItemType',
];

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const failures = [];

    for (const tableName of retiredTables) {
      const result = await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
          ) AS present
        `,
        [tableName],
      );
      if (result.rows[0].present) {
        failures.push(`retired table still exists: ${tableName}`);
      }
    }

    for (const [tableName, columnName] of retiredColumns) {
      const result = await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name = $2
          ) AS present
        `,
        [tableName, columnName],
      );
      if (result.rows[0].present) {
        failures.push(`retired column still exists: ${tableName}.${columnName}`);
      }
    }

    for (const enumName of retiredEnums) {
      const result = await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM pg_type
            WHERE typname = $1
          ) AS present
        `,
        [enumName],
      );
      if (result.rows[0].present) {
        failures.push(`retired enum still exists: ${enumName}`);
      }
    }

    for (const [enumName, expectedValues] of expectedEnums) {
      const result = await client.query(
        `
          SELECT enumlabel
          FROM pg_enum
          JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = $1
          ORDER BY enumsortorder
        `,
        [enumName],
      );
      const values = result.rows.map((row) => row.enumlabel);
      if (JSON.stringify(values) !== JSON.stringify(expectedValues)) {
        failures.push(
          `${enumName} values mismatch: expected ${expectedValues.join(', ')}, got ${values.join(', ')}`,
        );
      }
    }

    console.log('Phase 13 destructive schema cleanup verification');
    console.log(`Retired tables checked: ${retiredTables.length}`);
    console.log(`Retired columns checked: ${retiredColumns.length}`);
    console.log(`Retired enums checked: ${retiredEnums.length}`);
    console.log(`Reduced enums checked: ${expectedEnums.size}`);

    if (failures.length) {
      console.error('\nFAILED:');
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log('\nPASS: legacy schema structures are removed and V3 enum boundaries are locked.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 13 schema cleanup verification failed to run.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
