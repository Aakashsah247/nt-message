import { ForbiddenException, Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgMembershipType,
} from '../generated/prisma/client';
import {
  CAPABILITIES,
  type Capability,
} from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';

export interface DutyAuthorizationContext {
  officeId: string | null;
  primaryOrgUnitId: string | null;
  office: { id: string; code: string; name: string } | null;
  operationalTeamLeadIds: string[];
  assignableOrgUnitIds: string[];
  manageableOrgUnitIds: string[];
  orgUnits: Array<{
    id: string;
    code: string;
    name: string;
    parentOrgUnitId: string | null;
  }>;
  operationalTeams: Array<{
    id: string;
    code: string;
    name: string;
    orgUnitId: string;
  }>;
  canView: boolean;
  canCreate: boolean;
  canAssign: boolean;
  canManage: boolean;
  canManageOfficeConfiguration: boolean;
  readOnlyOversight: boolean;
}

@Injectable()
export class DutyAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationAuthorization: OrganizationAuthorizationService,
  ) {}

  async getContext(
    user: AuthenticatedUser,
    at = new Date(),
  ): Promise<DutyAuthorizationContext> {
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
        id: true,
        accountClass: true,
        isEnabled: true,
        employee: {
          select: {
            id: true,
            status: true,
            employmentStatus: true,
            archivedAt: true,
          },
        },
      },
    });

    if (!account?.isEnabled) {
      return this.emptyContext(false);
    }

    if (account.accountClass === AccountClass.SUPER_ADMIN) {
      return {
        ...this.emptyContext(true),
        canView: true,
        readOnlyOversight: true,
      };
    }

    if (
      !account.employee ||
      account.employee.status !== EmployeeStatus.ACTIVE ||
      account.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      account.employee.archivedAt !== null
    ) {
      return this.emptyContext(false);
    }

    const membership = await this.prisma.orgMembership.findFirst({
      where: {
        employeeId: account.employee.id,
        membershipType: OrgMembershipType.PRIMARY,
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
      },
      orderBy: { startsAt: 'desc' },
      select: {
        officeId: true,
        orgUnitId: true,
        office: { select: { id: true, code: true, name: true } },
      },
    });

    if (!membership) {
      return this.emptyContext(false);
    }

    const teamLeads = await this.prisma.operationalTeamLeadAssignment.findMany({
      where: {
        employeeId: account.employee.id,
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
        team: {
          is: {
            isActive: true,
            archivedAt: null,
            orgUnit: { is: { officeId: membership.officeId, isActive: true } },
          },
        },
      },
      select: { teamId: true, team: { select: { orgUnitId: true } } },
    });

    const [canView, canCreate, canAssign, canManage] = await Promise.all([
      this.organizationAuthorization.can(
        user,
        CAPABILITIES.DUTY_VIEW,
        membership.officeId,
        membership.orgUnitId,
        at,
      ),
      this.organizationAuthorization.can(
        user,
        CAPABILITIES.DUTY_CREATE,
        membership.officeId,
        membership.orgUnitId,
        at,
      ),
      this.organizationAuthorization.can(
        user,
        CAPABILITIES.DUTY_ASSIGN,
        membership.officeId,
        membership.orgUnitId,
        at,
      ),
      this.organizationAuthorization.can(
        user,
        CAPABILITIES.DUTY_MANAGE,
        membership.officeId,
        membership.orgUnitId,
        at,
      ),
    ]);

    const isOperationalTeamLead = teamLeads.length > 0;
    const canManageOfficeConfiguration =
      await this.organizationAuthorization.can(
        user,
        CAPABILITIES.DUTY_MANAGE,
        membership.officeId,
        null,
        at,
      );
    const [dutyViewOrgUnitIds, dutyAssignOrgUnitIds, manageableOrgUnitIds] =
      await Promise.all([
        this.organizationAuthorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.DUTY_VIEW,
          membership.officeId,
        ),
        this.organizationAuthorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.DUTY_ASSIGN,
          membership.officeId,
        ),
        this.organizationAuthorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.DUTY_MANAGE,
          membership.officeId,
        ),
      ]);
    const teamLeadOrgUnitIds = teamLeads.map((row) => row.team.orgUnitId);
    const visibleOrgUnitIds = [
      ...new Set([...dutyViewOrgUnitIds, ...teamLeadOrgUnitIds]),
    ];
    const assignableOrgUnitIds = [
      ...new Set([...dutyAssignOrgUnitIds, ...teamLeadOrgUnitIds]),
    ];
    const [orgUnits, operationalTeams] = await Promise.all([
      this.prisma.orgUnit.findMany({
        where: {
          id: { in: visibleOrgUnitIds },
          officeId: membership.officeId,
          isActive: true,
        },
        orderBy: [{ name: 'asc' }],
        select: { id: true, code: true, name: true, parentOrgUnitId: true },
      }),
      this.prisma.operationalTeam.findMany({
        where: {
          isActive: true,
          archivedAt: null,
          orgUnit: { is: { officeId: membership.officeId, isActive: true } },
          OR: [
            ...(visibleOrgUnitIds.length
              ? [{ orgUnitId: { in: visibleOrgUnitIds } }]
              : []),
            ...(teamLeads.length
              ? [{ id: { in: teamLeads.map((row) => row.teamId) } }]
              : []),
          ],
        },
        orderBy: [{ name: 'asc' }],
        select: { id: true, code: true, name: true, orgUnitId: true },
      }),
    ]);

    return {
      officeId: membership.officeId,
      primaryOrgUnitId: membership.orgUnitId,
      office: membership.office,
      operationalTeamLeadIds: teamLeads.map((row) => row.teamId),
      assignableOrgUnitIds,
      manageableOrgUnitIds,
      orgUnits,
      operationalTeams,
      canView: canView || visibleOrgUnitIds.length > 0 || isOperationalTeamLead,
      canCreate,
      canAssign:
        canAssign || assignableOrgUnitIds.length > 0 || isOperationalTeamLead,
      // Operational Team Lead authority is team-scoped assignment authority only.
      // It must never grant structural Duty configuration authority.
      canManage:
        canManage ||
        manageableOrgUnitIds.length > 0 ||
        canManageOfficeConfiguration,
      canManageOfficeConfiguration,
      readOnlyOversight: false,
    };
  }

  async assertCanUseManagement(
    user: AuthenticatedUser,
    capability: Extract<
      Capability,
      'duty.create' | 'duty.assign' | 'duty.manage'
    >,
  ): Promise<DutyAuthorizationContext> {
    const context = await this.getContext(user);
    const allowed =
      capability === CAPABILITIES.DUTY_CREATE
        ? context.canCreate
        : capability === CAPABILITIES.DUTY_ASSIGN
          ? context.canAssign
          : context.canManage;

    if (!allowed) {
      throw new ForbiddenException(
        context.readOnlyOversight
          ? 'Super Admin has read-only Duty oversight and cannot perform operational Duty actions.'
          : 'You do not have permission to perform this Duty action.',
      );
    }
    return context;
  }

  async visibleManageOrgUnitIds(user: AuthenticatedUser): Promise<string[]> {
    const context = await this.getContext(user);
    if (!context.officeId || context.readOnlyOversight) return [];
    return context.manageableOrgUnitIds;
  }

  async assertCanManageConfigurationScope(
    user: AuthenticatedUser,
    orgUnitId: string | null,
  ): Promise<DutyAuthorizationContext> {
    const context = await this.getContext(user);
    if (!context.officeId || context.readOnlyOversight) {
      throw new ForbiddenException(
        context.readOnlyOversight
          ? 'Super Admin has read-only Duty oversight and cannot change Duty configuration.'
          : 'Duty configuration requires an active Office scope.',
      );
    }

    await this.organizationAuthorization.assertCan(
      user,
      CAPABILITIES.DUTY_MANAGE,
      context.officeId,
      orgUnitId,
    );
    return context;
  }

  async assertCanManageOfficeConfiguration(
    user: AuthenticatedUser,
  ): Promise<DutyAuthorizationContext> {
    const context = await this.getContext(user);
    if (!context.officeId || !context.canManage) {
      throw new ForbiddenException(
        context.readOnlyOversight
          ? 'Super Admin has read-only Duty oversight and cannot change Duty configuration.'
          : 'Only authorized Office leadership can change Duty configuration.',
      );
    }

    await this.organizationAuthorization.assertCan(
      user,
      CAPABILITIES.DUTY_MANAGE,
      context.officeId,
      null,
    );
    return context;
  }

  private emptyContext(readOnlyOversight: boolean): DutyAuthorizationContext {
    return {
      officeId: null,
      primaryOrgUnitId: null,
      office: null,
      operationalTeamLeadIds: [],
      assignableOrgUnitIds: [],
      manageableOrgUnitIds: [],
      orgUnits: [],
      operationalTeams: [],
      canView: false,
      canCreate: false,
      canAssign: false,
      canManage: false,
      canManageOfficeConfiguration: false,
      readOnlyOversight,
    };
  }
}
