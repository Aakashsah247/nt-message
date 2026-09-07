export const CAPABILITIES = {
  ORGANIZATION_VIEW: 'organization.view',
  ORGANIZATION_CREATE_UNIT: 'organization.create_unit',
  ORGANIZATION_RENAME_UNIT: 'organization.rename_unit',
  ORGANIZATION_MOVE_UNIT: 'organization.move_unit',
  ORGANIZATION_DEACTIVATE_UNIT: 'organization.deactivate_unit',

  MEMBERSHIP_VIEW: 'membership.view',
  MEMBERSHIP_TRANSFER_INTERNAL: 'membership.transfer_internal',
  MEMBERSHIP_ASSIGN_SECONDARY: 'membership.assign_secondary',

  LEADERSHIP_VIEW: 'leadership.view',
  LEADERSHIP_ASSIGN: 'leadership.assign',
  LEADERSHIP_ASSIGN_ACTING: 'leadership.assign_acting',
  LEADERSHIP_ASSIGN_DEPUTY: 'leadership.assign_deputy',

  USERS_REQUEST_CREATE: 'users.request_create',
  USERS_REVIEW_REQUEST: 'users.review_request',
  USERS_PROVISION: 'users.provision',
  USERS_IDENTITY_CORRECT: 'users.identity_correct',
  USERS_SUSPEND: 'users.suspend',

  WORK_VIEW: 'work.view',
  WORK_CREATE: 'work.create',
  WORK_ASSIGN: 'work.assign',
  WORK_REQUEST_PARTICIPANT: 'work.request_participant',
  WORK_ACCEPT_PARTICIPANT: 'work.accept_participant',
  WORK_START_STAGE: 'work.start_stage',
  WORK_SUBMIT_STAGE: 'work.submit_stage',
  WORK_APPROVE_STAGE: 'work.approve_stage',
  WORK_RETURN_STAGE: 'work.return_stage',
  WORK_CANCEL: 'work.cancel',
  WORK_REOPEN: 'work.reopen',

  WORK_TYPE_VIEW: 'work_type.view',
  WORK_TYPE_DRAFT: 'work_type.draft',
  WORK_TYPE_PUBLISH: 'work_type.publish',

  WORK_SLA_CALENDAR_VIEW: 'work.sla_calendar.view',
  WORK_SLA_CALENDAR_MANAGE: 'work.sla_calendar.manage',

  DUTY_VIEW: 'duty.view',
  DUTY_CREATE: 'duty.create',
  DUTY_ASSIGN: 'duty.assign',
  DUTY_MANAGE: 'duty.manage',

  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',

  ANNOUNCEMENT_VIEW: 'announcement.view',
  ANNOUNCEMENT_PUBLISH: 'announcement.publish',

  OFFICIAL_GROUP_VIEW: 'official_group.view',
  OFFICIAL_GROUP_MANAGE: 'official_group.manage',

  SYSTEM_SETTINGS: 'system.settings',
  SYSTEM_SECURITY: 'system.security',
  SYSTEM_AUDIT: 'system.audit',
} as const;

export type Capability =
  (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const ALL_CAPABILITIES =
  Object.values(CAPABILITIES) as Capability[];

const CAPABILITY_SET = new Set<string>(ALL_CAPABILITIES);

export function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value);
}

export const DELEGABLE_CAPABILITIES = new Set<Capability>(
  ALL_CAPABILITIES.filter(
    (capability) =>
      !capability.startsWith('system.') &&
      capability !== CAPABILITIES.USERS_REVIEW_REQUEST &&
      capability !== CAPABILITIES.USERS_PROVISION &&
      capability !== CAPABILITIES.USERS_IDENTITY_CORRECT &&
      capability !== CAPABILITIES.USERS_SUSPEND &&
      capability !== CAPABILITIES.WORK_TYPE_PUBLISH,
  ),
);
