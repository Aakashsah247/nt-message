import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRequestLifecycleState,
  AccountRequestOrganizationRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';

interface ResolveRequestTargetInput {
  officeId?: string;
  intendedOrgUnitId?: string;
  requestedOrganizationRole: AccountRequestOrganizationRole;
}

type RequesterAuthorityKind = 'OFFICE_HEAD' | 'ORG_UNIT_HEAD' | 'DELEGATED';

const FORMAL_ORG_UNIT_TYPE_CODES = [
  'DIVISION',
  'DEPARTMENT',
  'SECTION',
  'UNIT',
] as const;

function isFormalOrgUnitTypeCode(code: string): boolean {
  return FORMAL_ORG_UNIT_TYPE_CODES.some((formalCode) => formalCode === code);
}

function headTitle(unitTypeName: string): string {
  const normalized = unitTypeName.trim();
  if (!normalized) return 'Unit Head';
  if (/head$/i.test(normalized)) return normalized;
  return `${normalized} Head`;
}

@Injectable()
export class AccountRequestAuthorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  private async resolveActiveOfficeUser(user: AuthenticatedUser) {
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
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true,
        officeId: true,
        orgUnitId: true,
        office: {
          select: { id: true, code: true, name: true, isActive: true },
        },
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            parentOrgUnitId: true,
            orgUnitType: {
              select: { code: true, name: true, isTeam: true },
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

    return { account, primaryMembership, now };
  }

  private async resolveRequesterAuthority(
    user: AuthenticatedUser,
    employeeId: string,
    officeId: string,
    at: Date,
  ): Promise<{
    kind: RequesterAuthorityKind;
    headOrgUnitIds: string[];
  }> {
    const assignments = await this.prisma.orgLeadershipAssignment.findMany({
      where: {
        employeeId,
        officeId,
        leadershipType: {
          in: [OrgLeadershipType.OFFICE_HEAD, OrgLeadershipType.ORG_UNIT_HEAD],
        },
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
      },
      select: { leadershipType: true, orgUnitId: true },
    });

    if (
      assignments.some(
        (assignment) =>
          assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD,
      )
    ) {
      return { kind: 'OFFICE_HEAD', headOrgUnitIds: [] };
    }

    const headOrgUnitIds = assignments
      .filter(
        (assignment) =>
          assignment.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD &&
          assignment.orgUnitId !== null,
      )
      .map((assignment) => assignment.orgUnitId as string);

    if (headOrgUnitIds.length === 0) {
      const delegatedOrgUnitIds = await this.authorization.visibleOrgUnitIds(
        user,
        CAPABILITIES.USERS_REQUEST_CREATE,
        officeId,
      );
      if (delegatedOrgUnitIds.length === 0) {
        throw new ForbiddenException(
          'You do not have Account Request Coordination authority in this Office.',
        );
      }
      return { kind: 'DELEGATED', headOrgUnitIds: delegatedOrgUnitIds };
    }

    return { kind: 'ORG_UNIT_HEAD', headOrgUnitIds };
  }

  private async visibleFormalOrgUnitIds(
    officeId: string,
    authority: { kind: RequesterAuthorityKind; headOrgUnitIds: string[] },
  ): Promise<string[]> {
    if (authority.kind === 'OFFICE_HEAD') {
      const units = await this.prisma.orgUnit.findMany({
        where: {
          officeId,
          isActive: true,
          orgUnitType: {
            is: {
              isActive: true,
              isTeam: false,
              code: { in: [...FORMAL_ORG_UNIT_TYPE_CODES] },
            },
          },
        },
        select: { id: true },
      });
      return units.map((unit) => unit.id);
    }

    if (authority.kind === 'DELEGATED') {
      const units = await this.prisma.orgUnit.findMany({
        where: {
          id: { in: authority.headOrgUnitIds },
          officeId,
          isActive: true,
          orgUnitType: {
            is: {
              isActive: true,
              isTeam: false,
              code: { in: [...FORMAL_ORG_UNIT_TYPE_CODES] },
            },
          },
        },
        select: { id: true },
      });
      return units.map((unit) => unit.id);
    }

    const closure = await this.prisma.orgUnitClosure.findMany({
      where: {
        ancestorOrgUnitId: { in: authority.headOrgUnitIds },
        descendantOrgUnit: {
          is: {
            officeId,
            isActive: true,
            orgUnitType: {
              is: {
                isActive: true,
                isTeam: false,
                code: { in: [...FORMAL_ORG_UNIT_TYPE_CODES] },
              },
            },
          },
        },
      },
      select: { descendantOrgUnitId: true },
    });

    return [...new Set(closure.map((row) => row.descendantOrgUnitId))];
  }

  private async canRequestHeadForUnit(
    orgUnitId: string,
    authority: { kind: RequesterAuthorityKind; headOrgUnitIds: string[] },
  ): Promise<boolean> {
    if (authority.kind === 'OFFICE_HEAD') return true;
    if (authority.kind === 'DELEGATED') return false;

    const strictAncestor = await this.prisma.orgUnitClosure.findFirst({
      where: {
        ancestorOrgUnitId: { in: authority.headOrgUnitIds },
        descendantOrgUnitId: orgUnitId,
        depth: { gt: 0 },
      },
      select: { depth: true },
    });

    return Boolean(strictAncestor);
  }

  async getCreatorContext(user: AuthenticatedUser) {
    const { account, primaryMembership, now } =
      await this.resolveActiveOfficeUser(user);
    const authority = await this.resolveRequesterAuthority(
      user,
      account.employee!.id,
      primaryMembership.officeId,
      now,
    );
    const visibleOrgUnitIds = await this.visibleFormalOrgUnitIds(
      primaryMembership.officeId,
      authority,
    );

    if (visibleOrgUnitIds.length === 0) {
      throw new ForbiddenException(
        'No active organizational area is available for account requests.',
      );
    }

    const requestableOrgUnits = await this.prisma.orgUnit.findMany({
      where: {
        officeId: primaryMembership.officeId,
        id: { in: visibleOrgUnitIds },
        isActive: true,
        orgUnitType: {
          is: {
            isActive: true,
            isTeam: false,
            code: { in: [...FORMAL_ORG_UNIT_TYPE_CODES] },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        parentOrgUnitId: true,
        sortOrder: true,
        orgUnitType: { select: { code: true, name: true } },
      },
    });

    const currentHeadRows = await this.prisma.orgLeadershipAssignment.findMany({
      where: {
        officeId: primaryMembership.officeId,
        orgUnitId: { in: visibleOrgUnitIds },
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
      },
      select: { orgUnitId: true },
    });
    const unitsWithHead = new Set(
      currentHeadRows.flatMap((row) => (row.orgUnitId ? [row.orgUnitId] : [])),
    );

    const orgUnits = await Promise.all(
      requestableOrgUnits.map(async (unit) => ({
        ...unit,
        headTitle: headTitle(unit.orgUnitType.name),
        hasCurrentHead: unitsWithHead.has(unit.id),
        canRequestHead:
          !unitsWithHead.has(unit.id) &&
          (await this.canRequestHeadForUnit(unit.id, authority)),
      })),
    );

    return {
      requester: account,
      office: primaryMembership.office,
      primaryOrgUnit: primaryMembership.orgUnit,
      authority,
      requestableOrgUnits: orgUnits,
    };
  }

  async resolveCreateTarget(
    user: AuthenticatedUser,
    input: ResolveRequestTargetInput,
  ) {
    const { account, primaryMembership, now } =
      await this.resolveActiveOfficeUser(user);

    if (input.officeId && input.officeId !== primaryMembership.officeId) {
      throw new ForbiddenException(
        'Account requests may be created only for your active Office.',
      );
    }

    if (!input.intendedOrgUnitId) {
      throw new BadRequestException(
        'Organization unit is required for an account request.',
      );
    }

    const intendedOrgUnit = await this.prisma.orgUnit.findUnique({
      where: { id: input.intendedOrgUnitId },
      select: {
        id: true,
        officeId: true,
        code: true,
        name: true,
        isActive: true,
        parentOrgUnitId: true,
        orgUnitType: {
          select: { code: true, name: true, isActive: true, isTeam: true },
        },
      },
    });

    if (!intendedOrgUnit) {
      throw new NotFoundException('Organization unit was not found.');
    }

    if (
      !intendedOrgUnit.isActive ||
      !intendedOrgUnit.orgUnitType.isActive ||
      intendedOrgUnit.orgUnitType.isTeam ||
      !isFormalOrgUnitTypeCode(intendedOrgUnit.orgUnitType.code) ||
      intendedOrgUnit.officeId !== primaryMembership.officeId
    ) {
      throw new ForbiddenException(
        'The selected organization unit is not an active formal unit in your Office.',
      );
    }

    const authority = await this.resolveRequesterAuthority(
      user,
      account.employee!.id,
      primaryMembership.officeId,
      now,
    );
    const visibleOrgUnitIds = await this.visibleFormalOrgUnitIds(
      primaryMembership.officeId,
      authority,
    );

    if (!visibleOrgUnitIds.includes(intendedOrgUnit.id)) {
      throw new ForbiddenException(
        'You can request accounts only inside the organizational branch you lead.',
      );
    }

    if (
      input.requestedOrganizationRole ===
      AccountRequestOrganizationRole.ORG_UNIT_HEAD
    ) {
      const canRequestHead = await this.canRequestHeadForUnit(
        intendedOrgUnit.id,
        authority,
      );

      if (!canRequestHead) {
        throw new ForbiddenException(
          'A Head may be requested only by the Head of a higher organizational level.',
        );
      }

      const existingHead = await this.prisma.orgLeadershipAssignment.findFirst({
        where: {
          officeId: primaryMembership.officeId,
          orgUnitId: intendedOrgUnit.id,
          leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        select: { id: true },
      });

      if (existingHead) {
        throw new ConflictException(
          `${headTitle(intendedOrgUnit.orgUnitType.name)} is already assigned. Use the leadership change workflow instead of creating a second Head.`,
        );
      }

      const pendingHeadRequest = await this.prisma.accountRequest.findFirst({
        where: {
          officeId: primaryMembership.officeId,
          intendedOrgUnitId: intendedOrgUnit.id,
          requestedOrganizationRole:
            AccountRequestOrganizationRole.ORG_UNIT_HEAD,
          lifecycleState: {
            in: [
              AccountRequestLifecycleState.REQUESTED,
              AccountRequestLifecycleState.UNDER_REVIEW,
              AccountRequestLifecycleState.APPROVED,
              AccountRequestLifecycleState.PROVISIONED,
            ],
          },
        },
        select: { id: true },
      });

      if (pendingHeadRequest) {
        throw new ConflictException(
          `An active request already exists for ${headTitle(intendedOrgUnit.orgUnitType.name)}.`,
        );
      }
    }

    return {
      requesterId: account.id,
      office: primaryMembership.office,
      intendedOrgUnit,
      authority,
      requestedOrganizationRole: input.requestedOrganizationRole,
    };
  }
}
