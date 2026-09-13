import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';

import {
  CAPABILITIES,
  DELEGABLE_CAPABILITIES,
  type Capability,
} from './organization-capabilities';

const OFFICE_HEAD_CAPABILITIES = new Set<Capability>([
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

  CAPABILITIES.USERS_REQUEST_CREATE,

  CAPABILITIES.WORK_VIEW,
  CAPABILITIES.WORK_ASSIGN,
  CAPABILITIES.WORK_REQUEST_PARTICIPANT,
  CAPABILITIES.WORK_ACCEPT_PARTICIPANT,
  CAPABILITIES.WORK_START_STAGE,
  CAPABILITIES.WORK_SUBMIT_STAGE,
  CAPABILITIES.WORK_APPROVE_STAGE,
  CAPABILITIES.WORK_RETURN_STAGE,
  CAPABILITIES.WORK_CANCEL,
  CAPABILITIES.WORK_REOPEN,

  CAPABILITIES.WORK_TYPE_VIEW,
  CAPABILITIES.WORK_TYPE_DRAFT,
  CAPABILITIES.WORK_TYPE_PUBLISH,
  CAPABILITIES.WORK_SLA_CALENDAR_VIEW,
  CAPABILITIES.WORK_SLA_CALENDAR_MANAGE,
  CAPABILITIES.DUTY_VIEW,
  CAPABILITIES.DUTY_CREATE,
  CAPABILITIES.DUTY_ASSIGN,
  CAPABILITIES.DUTY_MANAGE,
  CAPABILITIES.REPORTS_VIEW,
  CAPABILITIES.REPORTS_EXPORT,
  CAPABILITIES.ANNOUNCEMENT_VIEW,
  CAPABILITIES.ANNOUNCEMENT_PUBLISH,
  CAPABILITIES.OFFICIAL_GROUP_VIEW,
  CAPABILITIES.OFFICIAL_GROUP_MANAGE,
]);

const ORG_UNIT_HEAD_CAPABILITIES = new Set<Capability>([
  CAPABILITIES.ORGANIZATION_VIEW,
  CAPABILITIES.MEMBERSHIP_VIEW,
  CAPABILITIES.LEADERSHIP_VIEW,
  CAPABILITIES.WORK_VIEW,
  CAPABILITIES.WORK_ASSIGN,
  CAPABILITIES.WORK_REQUEST_PARTICIPANT,
  CAPABILITIES.WORK_ACCEPT_PARTICIPANT,
  CAPABILITIES.WORK_START_STAGE,
  CAPABILITIES.WORK_SUBMIT_STAGE,
  CAPABILITIES.WORK_APPROVE_STAGE,
  CAPABILITIES.WORK_RETURN_STAGE,
  CAPABILITIES.WORK_CANCEL,
  CAPABILITIES.WORK_REOPEN,
  CAPABILITIES.DUTY_VIEW,
  CAPABILITIES.DUTY_CREATE,
  CAPABILITIES.DUTY_ASSIGN,
  CAPABILITIES.DUTY_MANAGE,
  CAPABILITIES.REPORTS_VIEW,
  CAPABILITIES.REPORTS_EXPORT,
  CAPABILITIES.ANNOUNCEMENT_VIEW,
  CAPABILITIES.ANNOUNCEMENT_PUBLISH,
  CAPABILITIES.OFFICIAL_GROUP_VIEW,
  CAPABILITIES.OFFICIAL_GROUP_MANAGE,
]);

const SUPER_ADMIN_CAPABILITIES = new Set<Capability>([
  CAPABILITIES.ORGANIZATION_VIEW,
  CAPABILITIES.MEMBERSHIP_VIEW,
  CAPABILITIES.LEADERSHIP_VIEW,

  CAPABILITIES.USERS_REVIEW_REQUEST,
  CAPABILITIES.USERS_PROVISION,
  CAPABILITIES.USERS_IDENTITY_CORRECT,
  CAPABILITIES.USERS_SUSPEND,

  CAPABILITIES.WORK_VIEW,
  CAPABILITIES.WORK_TYPE_VIEW,
  CAPABILITIES.WORK_SLA_CALENDAR_VIEW,
  CAPABILITIES.DUTY_VIEW,
  CAPABILITIES.REPORTS_VIEW,
  CAPABILITIES.REPORTS_EXPORT,
  CAPABILITIES.ANNOUNCEMENT_VIEW,
  CAPABILITIES.OFFICIAL_GROUP_VIEW,

  CAPABILITIES.SYSTEM_SETTINGS,
  CAPABILITIES.SYSTEM_SECURITY,
  CAPABILITIES.SYSTEM_AUDIT,
]);

@Injectable()
export class OrganizationAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async can(
    user: AuthenticatedUser,
    capability: Capability,
    officeId: string,
    orgUnitId: string | null = null,
    at = new Date(),
  ): Promise<boolean> {
    const account = await this.resolveAccount(user.accountId);

    if (!account?.isEnabled) {
      return false;
    }

    if (account.accountClass === AccountClass.SUPER_ADMIN) {
      return SUPER_ADMIN_CAPABILITIES.has(capability);
    }

    if (!account.employee) {
      return false;
    }

    if (
      account.employee.status !== EmployeeStatus.ACTIVE ||
      account.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      account.employee.archivedAt !== null
    ) {
      return false;
    }

    const employeeId = account.employee.id;

    const primaryMembership =
      await this.prisma.orgMembership.findFirst({
        where: {
          employeeId,
          officeId,
          membershipType: OrgMembershipType.PRIMARY,
          startsAt: {
            lte: at,
          },
          OR: [
            {
              endsAt: null,
            },
            {
              endsAt: {
                gt: at,
              },
            },
          ],
        },
        select: {
          id: true,
          orgUnitId: true,
        },
      });

    if (!primaryMembership) {
      return false;
    }

    /*
     * Work creation and assigned-stage execution are base capabilities of an
     * active Office member. The Work domain remains authoritative for creator
     * policy, assignment, stage state and scope, so organization authorization
     * does not duplicate those business rules.
     */
    if (
      capability === CAPABILITIES.WORK_CREATE ||
      capability === CAPABILITIES.WORK_START_STAGE ||
      capability === CAPABILITIES.WORK_SUBMIT_STAGE
    ) {
      return true;
    }

    const leadership =
      await this.prisma.orgLeadershipAssignment.findMany({
        where: {
          employeeId,
          officeId,
          effectiveFrom: {
            lte: at,
          },
          OR: [
            {
              effectiveUntil: null,
            },
            {
              effectiveUntil: {
                gt: at,
              },
            },
          ],
        },
        select: {
          leadershipType: true,
          orgUnitId: true,
        },
      });

    for (const assignment of leadership) {
      if (
        assignment.leadershipType ===
          OrgLeadershipType.OFFICE_HEAD &&
        OFFICE_HEAD_CAPABILITIES.has(capability)
      ) {
        return true;
      }

      if (
        assignment.leadershipType ===
          OrgLeadershipType.ORG_UNIT_HEAD &&
        ORG_UNIT_HEAD_CAPABILITIES.has(capability) &&
        (await this.orgUnitScopeCovers(
          assignment.orgUnitId,
          orgUnitId,
          true,
        ))
      ) {
        return true;
      }

      /*
       * DEPUTY deliberately receives no implicit authority here.
       * A Deputy acts only through an explicit delegated permission.
       */
    }

    if (
      orgUnitId &&
      (capability === CAPABILITIES.OFFICIAL_GROUP_VIEW ||
        capability === CAPABILITIES.OFFICIAL_GROUP_MANAGE)
    ) {
      const currentTeamLead =
        await this.prisma.operationalTeamLeadAssignment.findFirst({
          where: {
            employeeId,
            effectiveFrom: { lte: at },
            OR: [
              { effectiveUntil: null },
              { effectiveUntil: { gt: at } },
            ],
            team: {
              is: {
                orgUnitId,
                isActive: true,
                archivedAt: null,
                orgUnit: {
                  is: {
                    officeId,
                    isActive: true,
                    orgUnitType: { is: { isTeam: true, isActive: true } },
                  },
                },
              },
            },
          },
          select: { id: true },
        });

      if (currentTeamLead) {
        return true;
      }
    }

    const delegations =
      await this.prisma.delegatedPermission.findMany({
        where: {
          granteeAccountId: user.accountId,
          officeId,
          capability,
          revokedAt: null,
          effectiveFrom: {
            lte: at,
          },
          OR: [
            {
              effectiveUntil: null,
            },
            {
              effectiveUntil: {
                gt: at,
              },
            },
          ],
        },
        select: {
          orgUnitId: true,
          includeDescendants: true,
        },
      });

    for (const delegation of delegations) {
      if (
        await this.orgUnitScopeCovers(
          delegation.orgUnitId,
          orgUnitId,
          delegation.includeDescendants,
        )
      ) {
        return true;
      }
    }

    /*
     * A normal employee's organization visibility is their effective
     * breadcrumb only. Broader subtree/Office visibility comes from
     * leadership or an explicit delegation above.
     */
    if (
      capability === CAPABILITIES.ORGANIZATION_VIEW &&
      primaryMembership.orgUnitId !== null &&
      orgUnitId !== null &&
      (await this.orgUnitScopeCovers(
        orgUnitId,
        primaryMembership.orgUnitId,
        true,
      ))
    ) {
      return true;
    }

    return false;
  }

  async assertCan(
    user: AuthenticatedUser,
    capability: Capability,
    officeId: string,
    orgUnitId: string | null = null,
  ): Promise<void> {
    if (
      !(await this.can(
        user,
        capability,
        officeId,
        orgUnitId,
      ))
    ) {
      throw new ForbiddenException(
        'You do not have permission to perform this action in this organizational area.',
      );
    }
  }

  async isOfficeHead(
    user: AuthenticatedUser,
    officeId: string,
    at = new Date(),
  ): Promise<boolean> {
    return Boolean(
      await this.resolveActiveOfficeHeadAssignment(
        user,
        officeId,
        at,
      ),
    );
  }

  async canRedelegate(
    user: AuthenticatedUser,
    capability: Capability,
    officeId: string,
    orgUnitId: string | null,
    requestedIncludeDescendants = false,
    requestedEffectiveFrom = new Date(),
    requestedEffectiveUntil: Date | null = null,
  ): Promise<boolean> {
    if (!DELEGABLE_CAPABILITIES.has(capability)) {
      return false;
    }

    if (
      requestedEffectiveUntil &&
      requestedEffectiveUntil.getTime() <=
        requestedEffectiveFrom.getTime()
    ) {
      return false;
    }

    if (
      !(await this.can(
        user,
        capability,
        officeId,
        orgUnitId,
        requestedEffectiveFrom,
      ))
    ) {
      return false;
    }

    const officeHead =
      await this.resolveActiveOfficeHeadAssignment(
        user,
        officeId,
        requestedEffectiveFrom,
      );

    if (officeHead) {
      if (!OFFICE_HEAD_CAPABILITIES.has(capability)) {
        return false;
      }

      if (
        officeHead.effectiveUntil &&
        (!requestedEffectiveUntil ||
          requestedEffectiveUntil.getTime() >
            officeHead.effectiveUntil.getTime())
      ) {
        return false;
      }

      return true;
    }

    if (user.accountClass === AccountClass.SUPER_ADMIN) {
      return false;
    }

    const grants =
      await this.prisma.delegatedPermission.findMany({
        where: {
          granteeAccountId: user.accountId,
          officeId,
          capability,
          canRedelegate: true,
          revokedAt: null,
          effectiveFrom: {
            lte: requestedEffectiveFrom,
          },
          OR: [
            {
              effectiveUntil: null,
            },
            {
              effectiveUntil: {
                gt: requestedEffectiveFrom,
              },
            },
          ],
        },
        select: {
          orgUnitId: true,
          includeDescendants: true,
          effectiveUntil: true,
        },
      });

    for (const grant of grants) {
      const scopeCovered =
        await this.orgUnitScopeCovers(
          grant.orgUnitId,
          orgUnitId,
          grant.includeDescendants,
        );

      if (!scopeCovered) {
        continue;
      }

      if (
        requestedIncludeDescendants &&
        grant.orgUnitId !== null &&
        !grant.includeDescendants
      ) {
        continue;
      }

      if (
        grant.effectiveUntil &&
        (!requestedEffectiveUntil ||
          requestedEffectiveUntil.getTime() >
            grant.effectiveUntil.getTime())
      ) {
        continue;
      }

      return true;
    }

    return false;
  }

  async visibleOrgUnitIds(
    user: AuthenticatedUser,
    capability: Capability,
    officeId: string,
  ): Promise<string[]> {
    if (
      await this.can(
        user,
        capability,
        officeId,
        null,
      )
    ) {
      const units = await this.prisma.orgUnit.findMany({
        where: {
          officeId,
        },
        select: {
          id: true,
        },
      });

      return units.map((unit) => unit.id);
    }

    const account = await this.resolveAccount(user.accountId);

    if (
      !account?.isEnabled ||
      !account.employee ||
      account.employee.status !== EmployeeStatus.ACTIVE ||
      account.employee.employmentStatus !==
        EmploymentStatus.ACTIVE ||
      account.employee.archivedAt !== null
    ) {
      return [];
    }

    const now = new Date();
    const ids = new Set<string>();

    const primaryMembership =
      await this.prisma.orgMembership.findFirst({
        where: {
          employeeId: account.employee.id,
          officeId,
          membershipType: OrgMembershipType.PRIMARY,
          startsAt: {
            lte: now,
          },
          OR: [
            {
              endsAt: null,
            },
            {
              endsAt: {
                gt: now,
              },
            },
          ],
        },
        select: {
          orgUnitId: true,
        },
      });

    if (!primaryMembership) {
      return [];
    }

    const leadership =
      await this.prisma.orgLeadershipAssignment.findMany({
        where: {
          employeeId: account.employee.id,
          officeId,
          effectiveFrom: {
            lte: now,
          },
          OR: [
            {
              effectiveUntil: null,
            },
            {
              effectiveUntil: {
                gt: now,
              },
            },
          ],
        },
        select: {
          leadershipType: true,
          orgUnitId: true,
        },
      });

    for (const assignment of leadership) {
      if (
        assignment.leadershipType ===
          OrgLeadershipType.ORG_UNIT_HEAD &&
        assignment.orgUnitId &&
        ORG_UNIT_HEAD_CAPABILITIES.has(capability)
      ) {
        const descendants =
          await this.prisma.orgUnitClosure.findMany({
            where: {
              ancestorOrgUnitId: assignment.orgUnitId,
            },
            select: {
              descendantOrgUnitId: true,
            },
          });

        descendants.forEach((item) =>
          ids.add(item.descendantOrgUnitId),
        );
      }

    }

    if (
      capability === CAPABILITIES.OFFICIAL_GROUP_VIEW ||
      capability === CAPABILITIES.OFFICIAL_GROUP_MANAGE
    ) {
      const teamLeadAssignments =
        await this.prisma.operationalTeamLeadAssignment.findMany({
          where: {
            employeeId: account.employee.id,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
            team: {
              is: {
                isActive: true,
                archivedAt: null,
                orgUnit: {
                  is: {
                    officeId,
                    isActive: true,
                    orgUnitType: { is: { isTeam: true, isActive: true } },
                  },
                },
              },
            },
          },
          select: {
            team: {
              select: { orgUnitId: true },
            },
          },
        });

      teamLeadAssignments.forEach((assignment) =>
        ids.add(assignment.team.orgUnitId),
      );
    }

    const delegated =
      await this.prisma.delegatedPermission.findMany({
        where: {
          granteeAccountId: user.accountId,
          officeId,
          capability,
          revokedAt: null,
          effectiveFrom: {
            lte: now,
          },
          OR: [
            {
              effectiveUntil: null,
            },
            {
              effectiveUntil: {
                gt: now,
              },
            },
          ],
        },
        select: {
          orgUnitId: true,
          includeDescendants: true,
        },
      });

    for (const grant of delegated) {
      if (!grant.orgUnitId) {
        const units = await this.prisma.orgUnit.findMany({
          where: {
            officeId,
          },
          select: {
            id: true,
          },
        });

        units.forEach((unit) => ids.add(unit.id));
        continue;
      }

      ids.add(grant.orgUnitId);

      if (grant.includeDescendants) {
        const descendants =
          await this.prisma.orgUnitClosure.findMany({
            where: {
              ancestorOrgUnitId: grant.orgUnitId,
            },
            select: {
              descendantOrgUnitId: true,
            },
          });

        descendants.forEach((item) =>
          ids.add(item.descendantOrgUnitId),
        );
      }
    }

    if (
      capability === CAPABILITIES.ORGANIZATION_VIEW &&
      primaryMembership.orgUnitId
    ) {
      ids.add(primaryMembership.orgUnitId);
    }

    if (
      capability === CAPABILITIES.ORGANIZATION_VIEW &&
      ids.size > 0
    ) {
      const breadcrumb =
        await this.prisma.orgUnitClosure.findMany({
          where: {
            descendantOrgUnitId: {
              in: [...ids],
            },
          },
          select: {
            ancestorOrgUnitId: true,
          },
        });

      breadcrumb.forEach((item) =>
        ids.add(item.ancestorOrgUnitId),
      );
    }

    return [...ids];
  }

  private async orgUnitScopeCovers(
    authorityOrgUnitId: string | null,
    targetOrgUnitId: string | null,
    includeDescendants: boolean,
  ): Promise<boolean> {
    if (authorityOrgUnitId === null) {
      return true;
    }

    if (targetOrgUnitId === null) {
      return false;
    }

    if (authorityOrgUnitId === targetOrgUnitId) {
      return true;
    }

    if (!includeDescendants) {
      return false;
    }

    const relation =
      await this.prisma.orgUnitClosure.findUnique({
        where: {
          ancestorOrgUnitId_descendantOrgUnitId: {
            ancestorOrgUnitId: authorityOrgUnitId,
            descendantOrgUnitId: targetOrgUnitId,
          },
        },
        select: {
          depth: true,
        },
      });

    return Boolean(relation);
  }

  private async resolveActiveOfficeHeadAssignment(
    user: AuthenticatedUser,
    officeId: string,
    at: Date,
  ) {
    const account = await this.resolveAccount(user.accountId);

    if (
      !account?.isEnabled ||
      account.accountClass === AccountClass.SUPER_ADMIN ||
      !account.employee ||
      account.employee.status !== EmployeeStatus.ACTIVE ||
      account.employee.employmentStatus !==
        EmploymentStatus.ACTIVE ||
      account.employee.archivedAt !== null
    ) {
      return null;
    }

    const primaryMembership =
      await this.prisma.orgMembership.findFirst({
        where: {
          employeeId: account.employee.id,
          officeId,
          membershipType: OrgMembershipType.PRIMARY,
          startsAt: {
            lte: at,
          },
          OR: [
            {
              endsAt: null,
            },
            {
              endsAt: {
                gt: at,
              },
            },
          ],
        },
        select: {
          id: true,
        },
      });

    if (!primaryMembership) {
      return null;
    }

    return this.prisma.orgLeadershipAssignment.findFirst({
      where: {
        employeeId: account.employee.id,
        officeId,
        leadershipType: OrgLeadershipType.OFFICE_HEAD,
        effectiveFrom: {
          lte: at,
        },
        OR: [
          {
            effectiveUntil: null,
          },
          {
            effectiveUntil: {
              gt: at,
            },
          },
        ],
      },
      select: {
        id: true,
        effectiveUntil: true,
      },
    });
  }

  private resolveAccount(accountId: string) {
    return this.prisma.account.findUnique({
      where: {
        id: accountId,
      },
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
  }
}
