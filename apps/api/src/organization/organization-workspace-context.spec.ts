import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';

import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationHierarchyService } from './organization-hierarchy.service';

describe('OrganizationHierarchyService workspace context', () => {
  const officeUser = {
    accountId: 'account-1',
    accountClass: AccountClass.OFFICE_USER,
  } as AuthenticatedUser;

  function createService(input: {
    leadership?: Array<{
      officeId: string;
      orgUnitId: string | null;
      leadershipType: OrgLeadershipType;
      parentOrgUnitId?: string | null;
    }>;
    teamLeadIds?: string[];
    delegatedCapabilities?: string[];
  }) {
    const prisma = {
      delegatedPermission: {
        findMany: jest.fn().mockResolvedValue(
          (input.delegatedCapabilities ?? []).map((capability) => ({
            capability,
          })),
        ),
      },
      account: {
        findUnique: jest.fn().mockResolvedValue({
          isEnabled: true,
          accountClass: AccountClass.OFFICE_USER,
          employee: {
            id: 'employee-1',
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            orgMemberships: [
              {
                officeId: 'office-1',
                orgUnitId: 'maintenance-section',
                membershipType: OrgMembershipType.PRIMARY,
                office: {
                  id: 'office-1',
                  code: 'PAT',
                  name: 'Patan Office',
                },
                orgUnit: {
                  id: 'maintenance-section',
                  code: 'MAINT',
                  name: 'Maintenance Section',
                  orgUnitType: {
                    id: 'section-type',
                    code: 'SECTION',
                    name: 'Section',
                  },
                },
              },
            ],
            orgLeadershipAssignments: (input.leadership ?? []).map(
              (assignment) => ({
                ...assignment,
                orgUnit: assignment.orgUnitId
                  ? {
                      id: assignment.orgUnitId,
                      parentOrgUnitId: assignment.parentOrgUnitId ?? null,
                    }
                  : null,
              }),
            ),
            operationalTeamLeadAssignments: (input.teamLeadIds ?? []).map(
              (teamId) => ({ teamId }),
            ),
          },
        }),
      },
    } as unknown as PrismaService;

    return new OrganizationHierarchyService(
      prisma,
      {} as OrganizationAuthorityService,
      {} as OrganizationAuthorizationService,
    );
  }

  it('maps Office Head to Office-wide management without personal Work or Duty pages', async () => {
    const service = createService({
      leadership: [
        {
          officeId: 'office-1',
          orgUnitId: null,
          leadershipType: OrgLeadershipType.OFFICE_HEAD,
        },
      ],
    });

    const context = await service.getWorkspaceContext(officeUser);

    expect(context.authority.kind).toBe('OFFICE_HEAD');
    expect(context.features.workManagement).toBe(true);
    expect(context.features.dutyRoster).toBe(true);
    expect(context.features.teamManagement).toBe(true);
    expect(context.features.myWork).toBe(false);
    expect(context.features.myDuty).toBe(false);
  });

  it('maps a top-level OrgUnit Head to the previous Senior Management feature family', async () => {
    const service = createService({
      leadership: [
        {
          officeId: 'office-1',
          orgUnitId: 'technical',
          leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
          parentOrgUnitId: null,
        },
      ],
    });

    const context = await service.getWorkspaceContext(officeUser);

    expect(context.authority.kind).toBe('ORGANIZATION_HEAD');
    expect(context.features.accountRequests).toBe(true);
    expect(context.features.workManagement).toBe(true);
    expect(context.features.dutyRoster).toBe(true);
    expect(context.features.myDuty).toBe(true);
    expect(context.features.myWork).toBe(false);
    expect(context.features.workTypes).toBe(true);
  });

  it('maps a lower OrgUnit Head to the previous Team Manager feature family', async () => {
    const service = createService({
      leadership: [
        {
          officeId: 'office-1',
          orgUnitId: 'fiber',
          leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
          parentOrgUnitId: 'technical',
        },
      ],
    });

    const context = await service.getWorkspaceContext(officeUser);

    expect(context.authority.kind).toBe('ORG_UNIT_HEAD');
    expect(context.features.directory).toBe(true);
    expect(context.features.teamManagement).toBe(true);
    expect(context.features.reports).toBe(true);
    expect(context.features.myDuty).toBe(true);
    expect(context.features.myWork).toBe(false);
  });

  it('keeps an Operational Team Lead on the normal employee workspace', async () => {
    const service = createService({ teamLeadIds: ['team-1'] });

    const context = await service.getWorkspaceContext(officeUser);

    expect(context.authority.kind).toBe('EMPLOYEE');
    expect(context.authority.isOperationalTeamLead).toBe(true);
    expect(context.authority.isOrgUnitHead).toBe(false);
    expect(context.features.workManagement).toBe(false);
    expect(context.features.dutyRoster).toBe(false);
    expect(context.features.myWork).toBe(true);
    expect(context.features.myDuty).toBe(true);
    expect(context.features.organizationManage).toBe(false);
    expect(context.features.teamManagement).toBe(false);
    expect(context.features.accountRequests).toBe(false);
  });

  it('keeps a normal employee on personal Work and Duty only', async () => {
    const service = createService({});

    const context = await service.getWorkspaceContext(officeUser);

    expect(context.authority.kind).toBe('EMPLOYEE');
    expect(context.features.dashboard).toBe(true);
    expect(context.features.myWork).toBe(true);
    expect(context.features.myDuty).toBe(true);
    expect(context.features.workManagement).toBe(false);
    expect(context.features.dutyRoster).toBe(false);
    expect(context.features.reports).toBe(false);
    expect(context.features.accountRequests).toBe(false);
    expect(context.primaryPlacement).toEqual({
      office: {
        id: 'office-1',
        code: 'PAT',
        name: 'Patan Office',
      },
      orgUnit: {
        id: 'maintenance-section',
        code: 'MAINT',
        name: 'Maintenance Section',
        orgUnitType: {
          id: 'section-type',
          code: 'SECTION',
          name: 'Section',
        },
      },
    });
  });

  it('keeps acting OrgUnit leadership equivalent to scoped formal management', async () => {
    const service = createService({
      leadership: [
        {
          officeId: 'office-1',
          orgUnitId: 'access-network',
          leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
          parentOrgUnitId: 'technical',
        },
      ],
    });

    const context = await service.getWorkspaceContext(officeUser);

    expect(context.authority.kind).toBe('ORG_UNIT_HEAD');
    expect(context.features.organizationManage).toBe(true);
    expect(context.features.workManagement).toBe(true);
    expect(context.features.dutyRoster).toBe(true);
    expect(context.features.teamManagement).toBe(true);
  });

  it('surfaces delegated work, duty, report and account-request workspaces from explicit grants', async () => {
    const service = createService({
      delegatedCapabilities: [
        'work.view',
        'duty.manage',
        'reports.view',
        'users.request_create',
      ],
    });

    const context = await service.getWorkspaceContext(officeUser);

    expect(context.authority.kind).toBe('EMPLOYEE');
    expect(context.authority.isOrgUnitHead).toBe(false);
    expect(context.features.workManagement).toBe(true);
    expect(context.features.dutyRoster).toBe(true);
    expect(context.features.reports).toBe(true);
    expect(context.features.accountRequests).toBe(true);
    expect(context.features.teamManagement).toBe(false);
    expect(context.features.myWork).toBe(true);
    expect(context.features.myDuty).toBe(true);
  });

  it('exposes Work Types when Work Type Management is explicitly delegated', async () => {
    const service = createService({
      delegatedCapabilities: [
        'organization.view',
        'membership.transfer_internal',
        'shared.work_type_management',
      ],
    });

    const context = await service.getWorkspaceContext(officeUser);

    expect(context.authority.kind).toBe('EMPLOYEE');
    expect(context.features.directory).toBe(true);
    expect(context.features.organizationView).toBe(true);
    expect(context.features.organizationManage).toBe(true);
    expect(context.features.workTypes).toBe(true);
    expect(context.features.teamManagement).toBe(false);
  });

  it('exposes scoped Organization and Directory context for delegated Acting-assignment authority', async () => {
    const service = createService({
      delegatedCapabilities: ['leadership.assign_acting'],
    });

    const context = await service.getWorkspaceContext(officeUser);

    expect(context.authority.kind).toBe('EMPLOYEE');
    expect(context.features.directory).toBe(true);
    expect(context.features.organizationView).toBe(true);
    expect(context.features.organizationManage).toBe(true);
    expect(context.features.accountRequests).toBe(false);
    expect(context.features.teamManagement).toBe(false);
  });

  it('keeps Super Admin outside operational Office management', async () => {
    const service = createService({});

    const context = await service.getWorkspaceContext({
      accountId: 'super-admin',
      accountClass: AccountClass.SUPER_ADMIN,
    } as AuthenticatedUser);

    expect(context.authority.kind).toBe('SUPER_ADMIN');
    expect(context.features.workOversight).toBe(true);
    expect(context.features.workManagement).toBe(false);
    expect(context.features.dutyRoster).toBe(false);
    expect(context.features.teamManagement).toBe(false);
    expect(context.features.reports).toBe(true);
  });
});
