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

  TEAM_MANAGE: 'team.manage',

  SYSTEM_SETTINGS: 'system.settings',
  SYSTEM_SECURITY: 'system.security',
  SYSTEM_AUDIT: 'system.audit',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const ALL_CAPABILITIES = Object.values(CAPABILITIES) as Capability[];

const CAPABILITY_SET = new Set<string>(ALL_CAPABILITIES);

export function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value);
}

export const SHARED_RESPONSIBILITIES = {
  ORGANIZATION_DIRECTORY_VIEW: 'shared.organization_directory_view',
  ORGANIZATION_MANAGEMENT: 'shared.organization_management',
  WORK_MANAGEMENT: 'shared.work_management',
  WORK_TYPE_MANAGEMENT: 'shared.work_type_management',
  DUTY_ROSTER_MANAGEMENT: 'shared.duty_roster_management',
  TEAM_MANAGEMENT: 'shared.team_management',
  REPORTS_EXPORT: 'shared.reports_export',
  ACCOUNT_REQUEST_COORDINATION: 'shared.account_request_coordination',
  OFFICIAL_COMMUNICATION_MANAGEMENT: 'shared.official_communication_management',
} as const;

export type SharedResponsibility =
  (typeof SHARED_RESPONSIBILITIES)[keyof typeof SHARED_RESPONSIBILITIES];

export const ALL_SHARED_RESPONSIBILITIES = Object.values(
  SHARED_RESPONSIBILITIES,
) as SharedResponsibility[];

const SHARED_RESPONSIBILITY_SET = new Set<string>(ALL_SHARED_RESPONSIBILITIES);

export function isSharedResponsibility(
  value: string,
): value is SharedResponsibility {
  return SHARED_RESPONSIBILITY_SET.has(value);
}

export const SHARED_RESPONSIBILITY_CAPABILITIES: Record<
  SharedResponsibility,
  readonly Capability[]
> = {
  [SHARED_RESPONSIBILITIES.ORGANIZATION_DIRECTORY_VIEW]: [
    CAPABILITIES.ORGANIZATION_VIEW,
    CAPABILITIES.MEMBERSHIP_VIEW,
    CAPABILITIES.LEADERSHIP_VIEW,
  ],
  [SHARED_RESPONSIBILITIES.ORGANIZATION_MANAGEMENT]: [
    CAPABILITIES.ORGANIZATION_VIEW,
    CAPABILITIES.ORGANIZATION_CREATE_UNIT,
    CAPABILITIES.ORGANIZATION_RENAME_UNIT,
    CAPABILITIES.ORGANIZATION_MOVE_UNIT,
    CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
    CAPABILITIES.MEMBERSHIP_VIEW,
    CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
    CAPABILITIES.MEMBERSHIP_ASSIGN_SECONDARY,
    CAPABILITIES.LEADERSHIP_VIEW,
  ],
  [SHARED_RESPONSIBILITIES.WORK_MANAGEMENT]: [
    CAPABILITIES.WORK_VIEW,
    CAPABILITIES.WORK_CREATE,
    CAPABILITIES.WORK_ASSIGN,
    CAPABILITIES.WORK_REQUEST_PARTICIPANT,
    CAPABILITIES.WORK_ACCEPT_PARTICIPANT,
    CAPABILITIES.WORK_APPROVE_STAGE,
    CAPABILITIES.WORK_RETURN_STAGE,
    CAPABILITIES.WORK_CANCEL,
    CAPABILITIES.WORK_REOPEN,
  ],
  [SHARED_RESPONSIBILITIES.WORK_TYPE_MANAGEMENT]: [
    CAPABILITIES.WORK_TYPE_VIEW,
    CAPABILITIES.WORK_TYPE_DRAFT,
  ],
  [SHARED_RESPONSIBILITIES.DUTY_ROSTER_MANAGEMENT]: [
    CAPABILITIES.DUTY_VIEW,
    CAPABILITIES.DUTY_CREATE,
    CAPABILITIES.DUTY_ASSIGN,
    CAPABILITIES.DUTY_MANAGE,
  ],
  [SHARED_RESPONSIBILITIES.TEAM_MANAGEMENT]: [CAPABILITIES.TEAM_MANAGE],
  [SHARED_RESPONSIBILITIES.REPORTS_EXPORT]: [
    CAPABILITIES.REPORTS_VIEW,
    CAPABILITIES.REPORTS_EXPORT,
  ],
  [SHARED_RESPONSIBILITIES.ACCOUNT_REQUEST_COORDINATION]: [
    CAPABILITIES.USERS_REQUEST_CREATE,
  ],
  [SHARED_RESPONSIBILITIES.OFFICIAL_COMMUNICATION_MANAGEMENT]: [
    CAPABILITIES.ANNOUNCEMENT_VIEW,
    CAPABILITIES.ANNOUNCEMENT_PUBLISH,
    CAPABILITIES.OFFICIAL_GROUP_VIEW,
    CAPABILITIES.OFFICIAL_GROUP_MANAGE,
  ],
};

export function sharedResponsibilitiesForCapability(
  capability: Capability,
): SharedResponsibility[] {
  return ALL_SHARED_RESPONSIBILITIES.filter((responsibility) =>
    SHARED_RESPONSIBILITY_CAPABILITIES[responsibility].includes(capability),
  );
}

export function delegationGrantKeysForCapability(
  capability: Capability,
): string[] {
  return [capability, ...sharedResponsibilitiesForCapability(capability)];
}

export function grantKeyAllowsCapability(
  grantKey: string,
  capability: Capability,
): boolean {
  if (grantKey === capability) return true;
  return (
    isSharedResponsibility(grantKey) &&
    SHARED_RESPONSIBILITY_CAPABILITIES[grantKey].includes(capability)
  );
}

/**
 * Delegated capabilities that require scoped access to Organization / People
 * context in the Office workspace. Keep this list shared by workspace feature
 * exposure and Directory authorization so navigation cannot advertise a page
 * that the API then rejects for the same delegation.
 */
export const ORGANIZATION_ACCESS_CAPABILITIES = [
  CAPABILITIES.ORGANIZATION_VIEW,
  CAPABILITIES.ORGANIZATION_CREATE_UNIT,
  CAPABILITIES.ORGANIZATION_RENAME_UNIT,
  CAPABILITIES.ORGANIZATION_MOVE_UNIT,
  CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
  CAPABILITIES.MEMBERSHIP_VIEW,
  CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
  CAPABILITIES.MEMBERSHIP_ASSIGN_SECONDARY,
  CAPABILITIES.LEADERSHIP_VIEW,
  CAPABILITIES.LEADERSHIP_ASSIGN,
  CAPABILITIES.LEADERSHIP_ASSIGN_ACTING,
  CAPABILITIES.LEADERSHIP_ASSIGN_DEPUTY,
] as const satisfies readonly Capability[];

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
