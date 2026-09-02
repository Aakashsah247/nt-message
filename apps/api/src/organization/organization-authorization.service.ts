import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';

import {
  CAPABILITIES,
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
]);

const ORG_UNIT_HEAD_CAPABILITIES = new Set<Capability>([
  CAPABILITIES.ORGANIZATION_VIEW,
  CAPABILITIES.MEMBERSHIP_VIEW,
  CAPABILITIES.LEADERSHIP_VIEW,
]);

const TEAM_LEAD_CAPABILITIES = new Set<Capability>([
  CAPABILITIES.ORGANIZATION_VIEW,
  CAPABILITIES.MEMBERSHIP_VIEW,
  CAPABILITIES.LEADERSHIP_VIEW,
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
  CAPABILITIES.DUTY_VIEW,
  CAPABILITIES.REPORTS_VIEW,
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

    if (account.role === AccountRole.SUPER_ADMIN) {
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
        },
      });

    if (!primaryMembership) {
      return false;
    }

    /*
     * Normal office members may view the organization directory/tree.
     * Mutation capabilities are still controlled by leadership/delegation.
     */
    if (capability === CAPABILITIES.ORGANIZATION_VIEW) {
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
       * Team Lead scope is the Team itself, not the full descendant tree.
       */
      if (
        assignment.leadershipType ===
          OrgLeadershipType.TEAM_LEAD &&
        TEAM_LEAD_CAPABILITIES.has(capability) &&
        assignment.orgUnitId !== null &&
        orgUnitId !== null &&
        assignment.orgUnitId === orgUnitId
      ) {
        return true;
      }

      /*
       * DEPUTY deliberately receives no implicit authority here.
       * A Deputy acts only through an explicit delegated permission.
       */
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
    const account = await this.resolveAccount(user.accountId);

    if (
      !account?.isEnabled ||
      account.role === AccountRole.SUPER_ADMIN ||
      !account.employee
    ) {
      return false;
    }

    const assignment =
      await this.prisma.orgLeadershipAssignment.findFirst({
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
        },
      });

    return Boolean(assignment);
  }

  async canRedelegate(
    user: AuthenticatedUser,
    capability: Capability,
    officeId: string,
    orgUnitId: string | null,
    at = new Date(),
  ): Promise<boolean> {
    if (await this.isOfficeHead(user, officeId, at)) {
      return OFFICE_HEAD_CAPABILITIES.has(capability);
    }

    if (user.role === AccountRole.SUPER_ADMIN) {
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

    for (const grant of grants) {
      if (
        await this.orgUnitScopeCovers(
          grant.orgUnitId,
          orgUnitId,
          grant.includeDescendants,
        )
      ) {
        return true;
      }
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

    if (!account?.employee) {
      return [];
    }

    const now = new Date();
    const ids = new Set<string>();

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

      if (
        assignment.leadershipType ===
          OrgLeadershipType.TEAM_LEAD &&
        assignment.orgUnitId &&
        TEAM_LEAD_CAPABILITIES.has(capability)
      ) {
        ids.add(assignment.orgUnitId);
      }
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

  private resolveAccount(accountId: string) {
    return this.prisma.account.findUnique({
      where: {
        id: accountId,
      },
      select: {
        id: true,
        role: true,
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
