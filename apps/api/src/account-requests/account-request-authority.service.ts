import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgMembershipType,
} from '../generated/prisma/client';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { CAPABILITIES } from '../organization/organization-capabilities';

interface ResolveRequestTargetInput {
  officeId?: string;
  intendedOrgUnitId?: string;
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

    if (
      !account ||
      !account.isEnabled ||
      account.accountClass !== AccountClass.OFFICE_USER ||
      (user.accountClass !== undefined &&
        user.accountClass !== AccountClass.OFFICE_USER) ||
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

    const visibleOrgUnitIds = await this.authorization.visibleOrgUnitIds(
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

    return {
      requester: account,
      office: primaryMembership.office,
      primaryOrgUnit: primaryMembership.orgUnit,
      requestableOrgUnits,
    };
  }

  async resolveCreateTarget(
    user: AuthenticatedUser,
    input: ResolveRequestTargetInput,
  ) {
    const { account, primaryMembership } =
      await this.resolveActiveOfficeUser(user);

    if (input.officeId && input.officeId !== primaryMembership.officeId) {
      throw new ForbiddenException(
        'Account requests may be created only for your active Office.',
      );
    }

    if (!input.intendedOrgUnitId) {
      throw new BadRequestException(
        'Intended OrgUnit is required for an account request.',
      );
    }

    const intendedOrgUnit = await this.prisma.orgUnit.findUnique({
      where: {
        id: input.intendedOrgUnitId,
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

    return {
      requesterId: account.id,
      office: primaryMembership.office,
      intendedOrgUnit,
    };
  }
}
