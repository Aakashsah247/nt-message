#!/usr/bin/env node

const path = require('node:path');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: path.resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'DATABASE_URL is required to verify the Phase 12 communication V3 cutover.',
  );
  process.exit(2);
}

const sql = `
WITH official_groups AS (
  SELECT
    COUNT(*) FILTER (
      WHERE conversation."group_kind" = 'OFFICIAL'
        AND conversation."official_scope_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
    )::bigint AS legacy_groups,
    COUNT(*) FILTER (
      WHERE conversation."group_kind" = 'OFFICIAL'
        AND conversation."official_scope_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
        AND conversation."official_office_id" IS NOT NULL
        AND conversation."official_membership_mode" = 'ENTIRE_SUBTREE'
        AND (
          conversation."official_scope_type" = 'ORGANIZATION'
          OR conversation."official_org_unit_id" IS NOT NULL
        )
    )::bigint AS legacy_groups_bound,
    COUNT(*) FILTER (
      WHERE conversation."group_kind" = 'OFFICIAL'
        AND conversation."official_scope_type" IN ('OFFICE', 'ORG_UNIT')
    )::bigint AS native_groups,
    COUNT(*) FILTER (
      WHERE conversation."group_kind" = 'OFFICIAL'
        AND conversation."official_scope_type" = 'OFFICE'
        AND (
          conversation."official_office_id" IS NULL
          OR conversation."official_org_unit_id" IS NOT NULL
          OR conversation."official_membership_mode" IS DISTINCT FROM 'ENTIRE_SUBTREE'
          OR conversation."official_division_id" IS NOT NULL
          OR conversation."official_department_id" IS NOT NULL
        )
    )::bigint AS invalid_native_office_groups,
    COUNT(*) FILTER (
      WHERE conversation."group_kind" = 'OFFICIAL'
        AND conversation."official_scope_type" = 'ORG_UNIT'
        AND (
          conversation."official_office_id" IS NULL
          OR conversation."official_org_unit_id" IS NULL
          OR conversation."official_membership_mode" IS NULL
          OR conversation."official_division_id" IS NOT NULL
          OR conversation."official_department_id" IS NOT NULL
        )
    )::bigint AS invalid_native_orgunit_groups
  FROM "conversations" conversation
),
official_group_office_mismatch AS (
  SELECT COUNT(*)::bigint AS count
  FROM "conversations" conversation
  JOIN "org_units" org_unit
    ON org_unit."id" = conversation."official_org_unit_id"
  WHERE conversation."group_kind" = 'OFFICIAL'
    AND conversation."official_office_id" IS DISTINCT FROM org_unit."office_id"
),
legacy_group_evidence AS (
  SELECT COUNT(message."id")::bigint AS message_count
  FROM "messages" message
  JOIN "conversations" conversation
    ON conversation."id" = message."conversation_id"
  WHERE conversation."group_kind" = 'OFFICIAL'
    AND conversation."official_scope_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
),
announcement_counts AS (
  SELECT
    COUNT(*) FILTER (
      WHERE announcement."audience_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
    )::bigint AS legacy_announcements,
    COUNT(*) FILTER (
      WHERE announcement."audience_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
        AND announcement."office_id" IS NOT NULL
        AND (
          announcement."audience_type" = 'ORGANIZATION'
          OR announcement."org_unit_id" IS NOT NULL
        )
    )::bigint AS legacy_announcements_bound,
    COUNT(*) FILTER (
      WHERE announcement."audience_type" IN ('OFFICE', 'ORG_UNIT', 'OFFICIAL_GROUP')
    )::bigint AS native_announcements,
    COUNT(*) FILTER (
      WHERE announcement."audience_type" = 'OFFICE'
        AND (
          announcement."office_id" IS NULL
          OR announcement."org_unit_id" IS NOT NULL
          OR announcement."division_id" IS NOT NULL
          OR announcement."department_id" IS NOT NULL
        )
    )::bigint AS invalid_native_office_announcements,
    COUNT(*) FILTER (
      WHERE announcement."audience_type" = 'ORG_UNIT'
        AND (
          announcement."office_id" IS NULL
          OR announcement."org_unit_id" IS NULL
          OR announcement."division_id" IS NOT NULL
          OR announcement."department_id" IS NOT NULL
        )
    )::bigint AS invalid_native_orgunit_announcements
  FROM "announcements" announcement
),
announcement_office_mismatch AS (
  SELECT COUNT(*)::bigint AS count
  FROM "announcements" announcement
  JOIN "org_units" org_unit
    ON org_unit."id" = announcement."org_unit_id"
  WHERE announcement."office_id" IS DISTINCT FROM org_unit."office_id"
),
official_group_announcements AS (
  SELECT
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (
      WHERE conversation."group_kind" = 'OFFICIAL'
        AND announcement."office_id" = conversation."official_office_id"
        AND announcement."org_unit_id" IS NOT DISTINCT FROM conversation."official_org_unit_id"
    )::bigint AS bound
  FROM "announcements" announcement
  LEFT JOIN "conversations" conversation
    ON conversation."id" = announcement."official_conversation_id"
  WHERE announcement."audience_type" = 'OFFICIAL_GROUP'
),
legacy_announcement_evidence AS (
  SELECT COUNT(recipient."announcement_id")::bigint AS recipient_count
  FROM "announcement_recipients" recipient
  JOIN "announcements" announcement
    ON announcement."id" = recipient."announcement_id"
  WHERE announcement."audience_type" IN ('ORGANIZATION', 'DIVISION', 'DEPARTMENT')
),
message_request_history AS (
  SELECT
    COUNT(*) FILTER (
      WHERE request."reason" IN ('CROSS_DIVISION', 'CROSS_DEPARTMENT')
    )::bigint AS legacy_reasons,
    COUNT(*) FILTER (
      WHERE request."reason" = 'OUTSIDE_ORG_SCOPE'
    )::bigint AS generic_reasons
  FROM "message_requests" request
)
SELECT
  official_groups.*,
  official_group_office_mismatch.count AS official_group_office_mismatch,
  legacy_group_evidence.message_count AS legacy_group_message_count,
  announcement_counts.*,
  announcement_office_mismatch.count AS announcement_office_mismatch,
  official_group_announcements.total AS official_group_announcements,
  official_group_announcements.bound AS official_group_announcements_bound,
  legacy_announcement_evidence.recipient_count AS legacy_announcement_recipient_count,
  message_request_history.legacy_reasons AS legacy_message_request_reasons,
  message_request_history.generic_reasons AS generic_message_request_reasons
FROM official_groups,
  official_group_office_mismatch,
  legacy_group_evidence,
  announcement_counts,
  announcement_office_mismatch,
  official_group_announcements,
  legacy_announcement_evidence,
  message_request_history;
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
    if (counts.legacy_groups_bound !== counts.legacy_groups) {
      failures.push(
        `legacy Official Group binding mismatch (${counts.legacy_groups_bound}/${counts.legacy_groups})`,
      );
    }
    if (counts.invalid_native_office_groups !== 0) {
      failures.push(
        `${counts.invalid_native_office_groups} native Office Official Group(s) have invalid scope fields`,
      );
    }
    if (counts.invalid_native_orgunit_groups !== 0) {
      failures.push(
        `${counts.invalid_native_orgunit_groups} native OrgUnit Official Group(s) have invalid scope fields`,
      );
    }
    if (counts.official_group_office_mismatch !== 0) {
      failures.push(
        `${counts.official_group_office_mismatch} Official Group(s) reference an OrgUnit from another Office`,
      );
    }
    if (counts.legacy_announcements_bound !== counts.legacy_announcements) {
      failures.push(
        `legacy Announcement binding mismatch (${counts.legacy_announcements_bound}/${counts.legacy_announcements})`,
      );
    }
    if (counts.invalid_native_office_announcements !== 0) {
      failures.push(
        `${counts.invalid_native_office_announcements} native Office Announcement(s) have invalid scope fields`,
      );
    }
    if (counts.invalid_native_orgunit_announcements !== 0) {
      failures.push(
        `${counts.invalid_native_orgunit_announcements} native OrgUnit Announcement(s) have invalid scope fields`,
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

    console.log('Phase 12 communication V3 cutover reconciliation');
    console.table({
      legacyOfficialGroups: counts.legacy_groups,
      legacyOfficialGroupsBound: counts.legacy_groups_bound,
      nativeOfficialGroups: counts.native_groups,
      invalidNativeOfficeGroups: counts.invalid_native_office_groups,
      invalidNativeOrgUnitGroups: counts.invalid_native_orgunit_groups,
      officialGroupOfficeMismatch: counts.official_group_office_mismatch,
      legacyOfficialGroupMessages: counts.legacy_group_message_count,
      legacyAnnouncements: counts.legacy_announcements,
      legacyAnnouncementsBound: counts.legacy_announcements_bound,
      nativeAnnouncements: counts.native_announcements,
      invalidNativeOfficeAnnouncements:
        counts.invalid_native_office_announcements,
      invalidNativeOrgUnitAnnouncements:
        counts.invalid_native_orgunit_announcements,
      announcementOfficeMismatch: counts.announcement_office_mismatch,
      officialGroupAnnouncements: counts.official_group_announcements,
      officialGroupAnnouncementsBound:
        counts.official_group_announcements_bound,
      legacyAnnouncementRecipients: counts.legacy_announcement_recipient_count,
      legacyMessageRequestReasons: counts.legacy_message_request_reasons,
      genericMessageRequestReasons: counts.generic_message_request_reasons,
    });

    if (failures.length > 0) {
      for (const failure of failures) console.error(`FAIL: ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      'PASS: Phase 12 communication V3 cutover reconciliation is clean; historical compatibility records remain reachable.',
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Phase 12 communication V3 cutover verification failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
