#!/usr/bin/env node

const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'DATABASE_URL is required to verify the Phase 12 communication OrgUnit foundation.',
  );
  process.exit(2);
}

const sql = `
WITH official_group_counts AS (
  SELECT
    COUNT(*) FILTER (
      WHERE conversation."group_kind" = 'OFFICIAL'
        AND conversation."official_scope_type"::text IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
    )::bigint AS legacy_official_groups,
    COUNT(*) FILTER (
      WHERE conversation."group_kind" = 'OFFICIAL'
        AND conversation."official_scope_type"::text IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
        AND conversation."official_office_id" IS NOT NULL
        AND conversation."official_membership_mode" = 'ENTIRE_SUBTREE'
        AND (
          conversation."official_scope_type"::text = 'ORGANIZATION'
          OR conversation."official_org_unit_id" IS NOT NULL
        )
    )::bigint AS legacy_official_groups_bound,
    COUNT(*) FILTER (
      WHERE conversation."group_kind" IS DISTINCT FROM 'OFFICIAL'
        AND (
          conversation."official_office_id" IS NOT NULL
          OR conversation."official_org_unit_id" IS NOT NULL
          OR conversation."official_membership_mode" IS NOT NULL
        )
    )::bigint AS non_official_with_v3_scope
  FROM "conversations" conversation
),
official_group_office_mismatch AS (
  SELECT COUNT(*)::bigint AS count
  FROM "conversations" conversation
  JOIN "org_units" org_unit
    ON org_unit."id" = conversation."official_org_unit_id"
  WHERE conversation."official_office_id" IS DISTINCT FROM org_unit."office_id"
),
announcement_counts AS (
  SELECT
    COUNT(*) FILTER (
      WHERE announcement."audience_type"::text IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
    )::bigint AS legacy_scoped_announcements,
    COUNT(*) FILTER (
      WHERE announcement."audience_type"::text IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
        AND announcement."office_id" IS NOT NULL
        AND (
          announcement."audience_type"::text = 'ORGANIZATION'
          OR announcement."org_unit_id" IS NOT NULL
        )
        AND announcement."include_descendants" = true
    )::bigint AS legacy_scoped_announcements_bound
  FROM "announcements" announcement
),
announcement_office_mismatch AS (
  SELECT COUNT(*)::bigint AS count
  FROM "announcements" announcement
  JOIN "org_units" org_unit
    ON org_unit."id" = announcement."org_unit_id"
  WHERE announcement."office_id" IS DISTINCT FROM org_unit."office_id"
),
official_group_announcement_counts AS (
  SELECT
    COUNT(*) FILTER (
      WHERE announcement."audience_type" = 'OFFICIAL_GROUP'
    )::bigint AS official_group_announcements,
    COUNT(*) FILTER (
      WHERE announcement."audience_type" = 'OFFICIAL_GROUP'
        AND conversation."group_kind" = 'OFFICIAL'
        AND announcement."office_id" = conversation."official_office_id"
        AND announcement."org_unit_id" IS NOT DISTINCT FROM conversation."official_org_unit_id"
    )::bigint AS official_group_announcements_bound
  FROM "announcements" announcement
  LEFT JOIN "conversations" conversation
    ON conversation."id" = announcement."official_conversation_id"
)
SELECT
  official_group_counts.*,
  official_group_office_mismatch.count AS official_group_office_mismatch,
  announcement_counts.*,
  announcement_office_mismatch.count AS announcement_office_mismatch,
  official_group_announcement_counts.*
FROM official_group_counts,
  official_group_office_mismatch,
  announcement_counts,
  announcement_office_mismatch,
  official_group_announcement_counts;
`;

function asNumber(value) {
  return Number.parseInt(String(value), 10);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query(sql);
    const counts = Object.fromEntries(
      Object.entries(result.rows[0]).map(([key, value]) => [
        key,
        asNumber(value),
      ]),
    );

    const failures = [];
    if (counts.legacy_official_groups_bound !== counts.legacy_official_groups) {
      failures.push(
        `legacy Official Group binding mismatch (${counts.legacy_official_groups_bound}/${counts.legacy_official_groups})`,
      );
    }
    if (counts.non_official_with_v3_scope !== 0) {
      failures.push(
        `${counts.non_official_with_v3_scope} non-official conversation(s) have Official Group V3 scope`,
      );
    }
    if (counts.official_group_office_mismatch !== 0) {
      failures.push(
        `${counts.official_group_office_mismatch} Official Group(s) reference an OrgUnit from another Office`,
      );
    }
    if (
      counts.legacy_scoped_announcements_bound !==
      counts.legacy_scoped_announcements
    ) {
      failures.push(
        `legacy Announcement binding mismatch (${counts.legacy_scoped_announcements_bound}/${counts.legacy_scoped_announcements})`,
      );
    }
    if (counts.announcement_office_mismatch !== 0) {
      failures.push(
        `${counts.announcement_office_mismatch} Announcement(s) reference an OrgUnit from another Office`,
      );
    }
    if (
      counts.official_group_announcements_bound !==
      counts.official_group_announcements
    ) {
      failures.push(
        `Official Group Announcement binding mismatch (${counts.official_group_announcements_bound}/${counts.official_group_announcements})`,
      );
    }

    console.log('Phase 12 communication OrgUnit foundation reconciliation');
    console.table({
      legacyOfficialGroups: counts.legacy_official_groups,
      legacyOfficialGroupsBound: counts.legacy_official_groups_bound,
      nonOfficialWithV3Scope: counts.non_official_with_v3_scope,
      officialGroupOfficeMismatch: counts.official_group_office_mismatch,
      legacyScopedAnnouncements: counts.legacy_scoped_announcements,
      legacyScopedAnnouncementsBound: counts.legacy_scoped_announcements_bound,
      announcementOfficeMismatch: counts.announcement_office_mismatch,
      officialGroupAnnouncements: counts.official_group_announcements,
      officialGroupAnnouncementsBound:
        counts.official_group_announcements_bound,
    });

    if (failures.length > 0) {
      for (const failure of failures) console.error(`FAIL: ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      'PASS: Phase 12 communication OrgUnit foundation reconciliation is clean.',
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 12 communication OrgUnit verification failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
