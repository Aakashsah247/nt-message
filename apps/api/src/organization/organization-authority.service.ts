import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
} from '../generated/prisma/client';

@Injectable()
export class OrganizationAuthorityService {
  constructor(private readonly prisma: PrismaService) {}

  assertPlatformAdmin(user: AuthenticatedUser): void {
    if (user.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the system administrator can manage office registration.',
      );
    }
  }

  async listVisibleOfficeIds(
    user: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      return null;
    }

    const employeeId = await this.resolveEmployeeId(user);
    const now = new Date();

    const [memberships, leadership] = await Promise.all([
      this.prisma.orgMembership.findMany({
        where: {
          employeeId,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: { officeId: true },
      }),
      this.prisma.orgLeadershipAssignment.findMany({
        where: {
          employeeId,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        select: { officeId: true },
      }),
    ]);

    return [
      ...new Set([
        ...memberships.map((item) => item.officeId),
        ...leadership.map((item) => item.officeId),
      ]),
    ];
  }

  async assertCanViewOffice(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<void> {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { id: true },
    });

    if (!office) {
      throw new NotFoundException('Office was not found.');
    }

    if (user.role === AccountRole.SUPER_ADMIN) {
      return;
    }

    const visibleOfficeIds = await this.listVisibleOfficeIds(user);

    if (!visibleOfficeIds?.includes(officeId)) {
      throw new ForbiddenException(
        'You do not have access to this office.',
      );
    }
  }

  async assertOfficeHead(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<void> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The system administrator cannot manage the internal office structure.',
      );
    }

    const employeeId = await this.resolveEmployeeId(user);
    const now = new Date();

    const assignment =
      await this.prisma.orgLeadershipAssignment.findFirst({
        where: {
          employeeId,
          officeId,
          leadershipType: OrgLeadershipType.OFFICE_HEAD,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        select: { id: true },
      });

    if (!assignment) {
      throw new ForbiddenException(
        'Only the Office Head can perform this action.',
      );
    }
  }

  async assertCanManageOrgUnit(
    user: AuthenticatedUser,
    officeId: string,
    orgUnitId: string,
  ): Promise<void> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The system administrator cannot manage the internal office structure.',
      );
    }

    const employeeId = await this.resolveEmployeeId(user);
    const now = new Date();

    const officeHead =
      await this.prisma.orgLeadershipAssignment.findFirst({
        where: {
          employeeId,
          officeId,
          leadershipType: OrgLeadershipType.OFFICE_HEAD,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        select: { id: true },
      });

    if (officeHead) {
      return;
    }

    const scopedLeader =
      await this.prisma.orgLeadershipAssignment.findFirst({
        where: {
          employeeId,
          officeId,
          effectiveFrom: { lte: now },
          AND: [
            {
              OR: [
                { effectiveUntil: null },
                { effectiveUntil: { gt: now } },
              ],
            },
            {
              OR: [
                {
                  leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
                  orgUnit: {
                    descendantLinks: {
                      some: {
                        descendantOrgUnitId: orgUnitId,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        select: { id: true },
      });

    if (!scopedLeader) {
      throw new ForbiddenException(
        'You can manage only your own organizational area.',
      );
    }
  }

  private async resolveEmployeeId(
    user: AuthenticatedUser,
  ): Promise<string> {
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
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

    if (
      !account?.isEnabled ||
      !account.employee ||
      account.employee.status !== EmployeeStatus.ACTIVE ||
      account.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      account.employee.archivedAt !== null
    ) {
      throw new ForbiddenException(
        'Your employee account is not active.',
      );
    }

    return account.employee.id;
  }
}
