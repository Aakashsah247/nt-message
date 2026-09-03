import {
  BadRequestException,
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
  OrgMembershipType,
} from '../generated/prisma/client';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { CAPABILITIES } from '../organization/organization-capabilities';

interface ResolveRequestTargetInput {
  officeId?: string;
  intendedOrgUnitId?: string;
  legacyDepartmentId?: string;
}

@Injectable()
export class AccountRequestAuthorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  private async resolveActiveOfficeUser(user: AuthenticatedUser) {
    const account = await this.prisma.account.findUnique({
      where: {
        id: user.accountId,
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
            divisionId: true,
            departmentId: true,
            division: {
              select: {
                id: true,
                code: true,
                name: true,
                isActive: true,
              },
            },
            departmentUnit: {
              select: {
                id: true,
                divisionId: true,
                code: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (
      !account ||
      !account.isEnabled ||
      account.role !== user.role ||
      account.role === AccountRole.SUPER_ADMIN ||
      !account.employee ||
      account.employee.status !== EmployeeStatus.ACTIVE ||
      account.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      account.employee.archivedAt !== null
    ) {
      throw new ForbiddenException(
        'Your active Office account is required to submit account requests.',
      );
    }

    const now = new Date();
    const primaryMembership = await this.prisma.orgMembership.findFirst({
      where: {
        employeeId: account.employee.id,
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
      orderBy: {
        startsAt: 'desc',
      },
      select: {
        id: true,
        officeId: true,
        orgUnitId: true,
        office: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            parentOrgUnitId: true,
            orgUnitType: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (
      !primaryMembership ||
      !primaryMembership.office.isActive ||
      (primaryMembership.orgUnit !== null &&
        !primaryMembership.orgUnit.isActive)
    ) {
      throw new ForbiddenException(
        'Your account does not have an active primary Office placement.',
      );
    }

    return {
      account,
      primaryMembership,
    };
  }

  async getCreatorContext(user: AuthenticatedUser) {
    const { account, primaryMembership } =
      await this.resolveActiveOfficeUser(user);

    const visibleOrgUnitIds =
      await this.authorization.visibleOrgUnitIds(
        user,
        CAPABILITIES.USERS_REQUEST_CREATE,
        primaryMembership.officeId,
      );

    if (visibleOrgUnitIds.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to create account requests in this Office.',
      );
    }

    const requestableOrgUnits = await this.prisma.orgUnit.findMany({
      where: {
        officeId: primaryMembership.officeId,
        id: {
          in: visibleOrgUnitIds,
        },
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        parentOrgUnitId: true,
        sortOrder: true,
        orgUnitType: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (requestableOrgUnits.length === 0) {
      throw new ForbiddenException(
        'No active organizational area is available for account requests.',
      );
    }

    const legacyDepartmentMappings =
      await this.prisma.legacyOrgUnitMapping.findMany({
        where: {
          officeId: primaryMembership.officeId,
          legacyEntityType: 'DEPARTMENT',
          orgUnitId: {
            in: requestableOrgUnits.map((unit) => unit.id),
          },
        },
        select: {
          legacyEntityId: true,
        },
      });

    const compatibilityDepartments =
      legacyDepartmentMappings.length === 0
        ? []
        : await this.prisma.department.findMany({
            where: {
              id: {
                in: legacyDepartmentMappings.map(
                  (mapping) => mapping.legacyEntityId,
                ),
              },
              isActive: true,
              division: {
                is: {
                  isActive: true,
                },
              },
            },
            orderBy: {
              name: 'asc',
            },
            select: {
              id: true,
              divisionId: true,
              code: true,
              name: true,
              isActive: true,
            },
          });

    return {
      requester: account,
      office: primaryMembership.office,
      primaryOrgUnit: primaryMembership.orgUnit,
      requestableOrgUnits,
      compatibilityDepartments,
    };
  }

  async resolveCreateTarget(
    user: AuthenticatedUser,
    input: ResolveRequestTargetInput,
  ) {
    const { account, primaryMembership } =
      await this.resolveActiveOfficeUser(user);

    if (
      input.officeId &&
      input.officeId !== primaryMembership.officeId
    ) {
      throw new ForbiddenException(
        'Account requests may be created only for your active Office.',
      );
    }

    let legacyMappedOrgUnitId: string | null = null;

    if (input.legacyDepartmentId) {
      const legacyMapping =
        await this.prisma.legacyOrgUnitMapping.findFirst({
          where: {
            legacyEntityType: 'DEPARTMENT',
            legacyEntityId: input.legacyDepartmentId,
          },
          select: {
            officeId: true,
            orgUnitId: true,
          },
        });

      if (!legacyMapping) {
        throw new NotFoundException(
          'The selected legacy department does not have a reconciled OrgUnit.',
        );
      }

      if (legacyMapping.officeId !== primaryMembership.officeId) {
        throw new ForbiddenException(
          'The selected department is outside your active Office.',
        );
      }

      legacyMappedOrgUnitId = legacyMapping.orgUnitId;
    }

    if (
      input.intendedOrgUnitId &&
      legacyMappedOrgUnitId &&
      input.intendedOrgUnitId !== legacyMappedOrgUnitId
    ) {
      throw new BadRequestException(
        'The intended OrgUnit does not match the selected legacy department.',
      );
    }

    const intendedOrgUnitId =
      input.intendedOrgUnitId ?? legacyMappedOrgUnitId;

    if (!intendedOrgUnitId) {
      throw new BadRequestException(
        'Intended OrgUnit is required for an account request.',
      );
    }

    const intendedOrgUnit = await this.prisma.orgUnit.findUnique({
      where: {
        id: intendedOrgUnitId,
      },
      select: {
        id: true,
        officeId: true,
        code: true,
        name: true,
        isActive: true,
        parentOrgUnitId: true,
        orgUnitType: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    if (!intendedOrgUnit) {
      throw new NotFoundException('Intended OrgUnit was not found.');
    }

    if (
      !intendedOrgUnit.isActive ||
      intendedOrgUnit.officeId !== primaryMembership.officeId
    ) {
      throw new ForbiddenException(
        'The intended OrgUnit is not active inside your Office.',
      );
    }

    await this.authorization.assertCan(
      user,
      CAPABILITIES.USERS_REQUEST_CREATE,
      primaryMembership.officeId,
      intendedOrgUnit.id,
    );

    const ancestry = await this.prisma.orgUnitClosure.findMany({
      where: {
        descendantOrgUnitId: intendedOrgUnit.id,
      },
      orderBy: {
        depth: 'asc',
      },
      select: {
        ancestorOrgUnitId: true,
        depth: true,
      },
    });

    const ancestorIds = ancestry.map(
      (item) => item.ancestorOrgUnitId,
    );

    const compatibilityMappings =
      ancestorIds.length === 0
        ? []
        : await this.prisma.legacyOrgUnitMapping.findMany({
            where: {
              officeId: primaryMembership.officeId,
              orgUnitId: {
                in: ancestorIds,
              },
              legacyEntityType: {
                in: ['DIVISION', 'DEPARTMENT'],
              },
            },
            select: {
              legacyEntityType: true,
              legacyEntityId: true,
              orgUnitId: true,
            },
          });

    const depthByOrgUnitId = new Map(
      ancestry.map((item) => [item.ancestorOrgUnitId, item.depth]),
    );

    const nearestMapping = (legacyEntityType: string) =>
      compatibilityMappings
        .filter(
          (mapping) =>
            mapping.legacyEntityType === legacyEntityType,
        )
        .sort(
          (left, right) =>
            (depthByOrgUnitId.get(left.orgUnitId) ??
              Number.MAX_SAFE_INTEGER) -
            (depthByOrgUnitId.get(right.orgUnitId) ??
              Number.MAX_SAFE_INTEGER),
        )[0] ?? null;

    const departmentMapping = nearestMapping('DEPARTMENT');
    const divisionMapping = nearestMapping('DIVISION');

    let legacyDepartmentId: string | null =
      departmentMapping?.legacyEntityId ?? null;
    let legacyDivisionId = divisionMapping?.legacyEntityId ?? null;

    if (legacyDepartmentId) {
      const department = await this.prisma.department.findUnique({
        where: {
          id: legacyDepartmentId,
        },
        select: {
          id: true,
          divisionId: true,
          isActive: true,
          division: {
            select: {
              isActive: true,
            },
          },
        },
      });

      if (
        department?.isActive &&
        department.division.isActive
      ) {
        legacyDivisionId = department.divisionId;
      } else {
        legacyDepartmentId = null;
      }
    }

    return {
      requesterId: account.id,
      office: primaryMembership.office,
      intendedOrgUnit,
      legacyDivisionId,
      legacyDepartmentId,
    };
  }
}
