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
  EmployeeStatus,
  EmploymentStatus,
  OrgMembershipType,
} from '../generated/prisma/client';

import {
  CAPABILITIES,
  ALL_SHARED_RESPONSIBILITIES,
  SHARED_RESPONSIBILITIES,
  DELEGABLE_CAPABILITIES,
  ORGANIZATION_ACCESS_CAPABILITIES,
  isSharedResponsibility,
  isCapability,
} from './organization-capabilities';
import type { Capability } from './organization-capabilities';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { CreateDelegatedPermissionDto } from './dto/create-delegated-permission.dto';
import { OrganizationDelegationContextQueryDto } from './dto/organization-delegation-context-query.dto';
import { RevokeDelegatedPermissionDto } from './dto/revoke-delegated-permission.dto';

const LEGACY_UI_DELEGATION_CAPABILITIES = [
  ...ORGANIZATION_ACCESS_CAPABILITIES,
  CAPABILITIES.USERS_REQUEST_CREATE,
] satisfies Capability[];

@Injectable()
export class OrganizationDelegationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  private normalizeReason(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private async resolveScopedOrgUnitIds(
    orgUnitId: string | null,
    includeDescendants: boolean,
  ): Promise<string[] | null> {
    if (!orgUnitId) {
      return null;
    }

    if (!includeDescendants) {
      return [orgUnitId];
    }

    const descendants = await this.prisma.orgUnitClosure.findMany({
      where: {
        ancestorOrgUnitId: orgUnitId,
      },
      select: {
        descendantOrgUnitId: true,
      },
    });

    return [
      ...new Set([
        orgUnitId,
        ...descendants.map((item) => item.descendantOrgUnitId),
      ]),
    ];
  }

  private parseDate(
    value: string | undefined,
    label: string,
    fallback: Date,
  ): Date {
    if (!value) {
      return fallback;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} is invalid.`);
    }

    return date;
  }

  async getUiContext(
    user: AuthenticatedUser,
    officeId: string,
    query: OrganizationDelegationContextQueryDto,
  ) {
    const orgUnitId = query.orgUnitId ?? null;
    const includeDescendants =
      orgUnitId !== null && query.includeDescendants === 'true';
    const now = new Date();
    const probeUntil = new Date(now.getTime() + 60_000);

    let selectedOrgUnitTypeCode: string | null = null;

    if (orgUnitId) {
      const orgUnit = await this.prisma.orgUnit.findFirst({
        where: {
          id: orgUnitId,
          officeId,
          isActive: true,
        },
        select: {
          id: true,
          orgUnitType: { select: { code: true } },
        },
      });

      if (!orgUnit) {
        throw new BadRequestException(
          'Select an active organizational unit from this office.',
        );
      }
      selectedOrgUnitTypeCode = orgUnit.orgUnitType.code;
    }

    const scopedCandidateOrgUnitIds = await this.resolveScopedOrgUnitIds(
      orgUnitId,
      includeDescendants,
    );

    const officeHead = await this.authorization.isOfficeHead(
      user,
      officeId,
      now,
    );

    const activeRedelegableGrant = officeHead
      ? null
      : await this.prisma.delegatedPermission.findFirst({
          where: {
            granteeAccountId: user.accountId,
            officeId,
            capability: {
              in: [
                ...ALL_SHARED_RESPONSIBILITIES,
                ...LEGACY_UI_DELEGATION_CAPABILITIES,
              ],
            },
            canRedelegate: true,
            revokedAt: null,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
          },
          select: { id: true },
        });

    const hasDelegationAuthority =
      user.accountClass !== AccountClass.SUPER_ADMIN &&
      (officeHead || Boolean(activeRedelegableGrant));

    const availableResponsibilities = hasDelegationAuthority
      ? (
          await Promise.all(
            ALL_SHARED_RESPONSIBILITIES.map(async (responsibility) => ({
              responsibility,
              allowed:
                responsibility ===
                  SHARED_RESPONSIBILITIES.WORK_TYPE_MANAGEMENT &&
                orgUnitId !== null &&
                selectedOrgUnitTypeCode !== 'DIVISION'
                  ? false
                  : await this.authorization.canRedelegateResponsibility(
                      user,
                      responsibility,
                      officeId,
                      orgUnitId,
                      includeDescendants,
                      now,
                      probeUntil,
                    ),
            })),
          )
        )
          .filter((entry) => entry.allowed)
          .map((entry) => entry.responsibility)
      : [];

    const memberships = hasDelegationAuthority
      ? await this.prisma.orgMembership.findMany({
          where: {
            officeId,
            ...(scopedCandidateOrgUnitIds
              ? { orgUnitId: { in: scopedCandidateOrgUnitIds } }
              : {}),
            membershipType: OrgMembershipType.PRIMARY,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            employee: {
              is: {
                status: EmployeeStatus.ACTIVE,
                employmentStatus: EmploymentStatus.ACTIVE,
                archivedAt: null,
                account: {
                  is: {
                    isEnabled: true,
                    accountClass: { not: AccountClass.SUPER_ADMIN },
                  },
                },
              },
            },
          },
          select: {
            orgUnit: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            employee: {
              select: {
                id: true,
                empId: true,
                empName: true,
                designation: true,
                account: {
                  select: {
                    id: true,
                    username: true,
                    accountClass: true,
                    isEnabled: true,
                  },
                },
              },
            },
          },
        })
      : [];

    const candidates = memberships
      .filter(
        (membership) =>
          membership.employee.account &&
          membership.employee.account.id !== user.accountId,
      )
      .map((membership) => ({
        accountId: membership.employee.account!.id,
        username: membership.employee.account!.username,
        employeeId: membership.employee.id,
        empId: membership.employee.empId,
        empName: membership.employee.empName,
        designation: membership.employee.designation,
        primaryOrgUnit: membership.orgUnit,
      }))
      .sort((left, right) => left.empName.localeCompare(right.empName));

    return {
      officeId,
      orgUnitId,
      includeDescendants,
      hasDelegationAuthority,
      availableResponsibilities,
      candidates,
    };
  }

  async list(user: AuthenticatedUser, officeId: string) {
    const visibleOrgUnitIds = await this.authorization.visibleOrgUnitIds(
      user,
      CAPABILITIES.LEADERSHIP_VIEW,
      officeId,
    );

    const officeWide = await this.authorization.can(
      user,
      CAPABILITIES.LEADERSHIP_VIEW,
      officeId,
      null,
    );

    const officeHead = await this.authorization.isOfficeHead(user, officeId);

    const data = await this.prisma.delegatedPermission.findMany({
      where: {
        officeId,
        ...(officeWide
          ? {}
          : {
              OR: [
                ...(visibleOrgUnitIds.length > 0
                  ? [
                      {
                        orgUnitId: {
                          in: visibleOrgUnitIds,
                        },
                      },
                    ]
                  : []),
                { grantedByAccountId: user.accountId },
                { granteeAccountId: user.accountId },
              ],
            }),
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
      ],
      include: {
        grantee: {
          select: {
            id: true,
            username: true,
            employee: {
              select: {
                empId: true,
                empName: true,
              },
            },
          },
        },
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        grantedBy: {
          select: {
            id: true,
            username: true,
          },
        },
        revokedBy: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    const now = Date.now();

    return {
      data: data.map((permission) => ({
        ...permission,
        availableActions: {
          revoke:
            permission.revokedAt === null &&
            (permission.effectiveUntil === null ||
              permission.effectiveUntil.getTime() > now) &&
            (officeHead || permission.grantedByAccountId === user.accountId),
        },
      })),
    };
  }

  async create(
    user: AuthenticatedUser,
    officeId: string,
    dto: CreateDelegatedPermissionDto,
  ) {
    if (user.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The system administrator cannot grant internal office delegation.',
      );
    }

    const requestedGrantKey = dto.capability;
    const sharedResponsibility = isSharedResponsibility(requestedGrantKey)
      ? requestedGrantKey
      : null;
    const atomicCapability = isCapability(requestedGrantKey)
      ? requestedGrantKey
      : null;

    if (!sharedResponsibility && !atomicCapability) {
      throw new BadRequestException(
        'The selected responsibility is not supported.',
      );
    }

    if (atomicCapability && !DELEGABLE_CAPABILITIES.has(atomicCapability)) {
      throw new ForbiddenException('This capability cannot be delegated.');
    }

    const orgUnitId = dto.orgUnitId ?? null;
    const includeDescendants =
      orgUnitId !== null && (dto.includeDescendants ?? false);
    const now = new Date();
    const effectiveFrom = this.parseDate(
      dto.effectiveFrom,
      'Effective start time',
      now,
    );
    const effectiveUntil = dto.effectiveUntil
      ? this.parseDate(dto.effectiveUntil, 'Effective end time', effectiveFrom)
      : null;

    if (effectiveUntil && effectiveUntil.getTime() <= effectiveFrom.getTime()) {
      throw new BadRequestException(
        'Effective end time must be later than the start time.',
      );
    }

    let selectedOrgUnitTypeCode: string | null = null;

    if (orgUnitId) {
      const orgUnit = await this.prisma.orgUnit.findFirst({
        where: {
          id: orgUnitId,
          officeId,
          isActive: true,
        },
        select: {
          id: true,
          orgUnitType: { select: { code: true } },
        },
      });

      if (!orgUnit) {
        throw new BadRequestException(
          'Select an active organizational unit from this office.',
        );
      }
      selectedOrgUnitTypeCode = orgUnit.orgUnitType.code;
    }

    if (
      sharedResponsibility === SHARED_RESPONSIBILITIES.WORK_TYPE_MANAGEMENT &&
      orgUnitId !== null &&
      (selectedOrgUnitTypeCode !== 'DIVISION' || !includeDescendants)
    ) {
      throw new BadRequestException(
        'Work Type Management must be delegated Office-wide or to a Division including its child OrgUnits.',
      );
    }

    const canDelegate = sharedResponsibility
      ? await this.authorization.canRedelegateResponsibility(
          user,
          sharedResponsibility,
          officeId,
          orgUnitId,
          includeDescendants,
          effectiveFrom,
          effectiveUntil,
        )
      : atomicCapability
        ? await this.authorization.canRedelegate(
            user,
            atomicCapability,
            officeId,
            orgUnitId,
            includeDescendants,
            effectiveFrom,
            effectiveUntil,
          )
        : false;

    if (!canDelegate) {
      throw new ForbiddenException(
        'You cannot delegate this responsibility or organizational scope.',
      );
    }

    const scopedGranteeOrgUnitIds = await this.resolveScopedOrgUnitIds(
      orgUnitId,
      includeDescendants,
    );

    const grantee = await this.prisma.account.findUnique({
      where: {
        id: dto.granteeAccountId,
      },
      select: {
        id: true,
        accountClass: true,
        isEnabled: true,
        employeeId: true,
      },
    });

    if (!grantee?.isEnabled || !grantee.employeeId) {
      throw new ConflictException('Select an active employee account.');
    }

    if (grantee.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The system administrator cannot receive office delegation.',
      );
    }

    if (grantee.id === user.accountId) {
      throw new ForbiddenException(
        'You cannot delegate a permission to your own account.',
      );
    }

    const membership = await this.prisma.orgMembership.findFirst({
      where: {
        employeeId: grantee.employeeId,
        officeId,
        ...(scopedGranteeOrgUnitIds
          ? { orgUnitId: { in: scopedGranteeOrgUnitIds } }
          : {}),
        membershipType: OrgMembershipType.PRIMARY,
        startsAt: {
          lte: effectiveFrom,
        },
        OR: [
          {
            endsAt: null,
          },
          {
            endsAt: {
              gt: effectiveFrom,
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new ConflictException(
        orgUnitId
          ? 'The employee must have an active primary membership inside the delegated organizational scope.'
          : 'The employee must have an active primary membership in this office.',
      );
    }

    const duplicate = await this.prisma.delegatedPermission.findFirst({
      where: {
        granteeAccountId: grantee.id,
        officeId,
        orgUnitId,
        capability: dto.capability,
        revokedAt: null,
        ...(effectiveUntil
          ? {
              effectiveFrom: {
                lt: effectiveUntil,
              },
            }
          : {}),
        OR: [
          {
            effectiveUntil: null,
          },
          {
            effectiveUntil: {
              gt: effectiveFrom,
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      throw new ConflictException(
        'An overlapping delegation already exists for this employee and scope.',
      );
    }

    const delegatedPermission = await this.prisma.delegatedPermission.create({
      data: {
        granteeAccountId: grantee.id,
        officeId,
        orgUnitId,
        capability: dto.capability,
        includeDescendants,
        canRedelegate: dto.canRedelegate ?? false,
        effectiveFrom,
        effectiveUntil,
        grantedByAccountId: user.accountId,
        grantReason: this.normalizeReason(dto.reason),
      },
    });

    return {
      message: 'Permission delegated successfully.',
      delegatedPermission,
    };
  }

  async revoke(
    user: AuthenticatedUser,
    officeId: string,
    permissionId: string,
    dto: RevokeDelegatedPermissionDto,
  ) {
    const permission = await this.prisma.delegatedPermission.findFirst({
      where: {
        id: permissionId,
        officeId,
      },
    });

    if (!permission) {
      throw new NotFoundException('Delegated permission was not found.');
    }

    if (permission.revokedAt) {
      throw new ConflictException(
        'This delegated permission has already been revoked.',
      );
    }

    const officeHead = await this.authorization.isOfficeHead(user, officeId);

    if (!officeHead && permission.grantedByAccountId !== user.accountId) {
      throw new ForbiddenException(
        'Only the Office Head or original grantor can revoke this delegation.',
      );
    }

    const revokedAt = this.parseDate(
      dto.effectiveAt,
      'Revocation time',
      new Date(),
    );

    if (revokedAt.getTime() < permission.effectiveFrom.getTime()) {
      throw new BadRequestException(
        'Revocation time cannot be earlier than the delegation start time.',
      );
    }

    if (revokedAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('Revocation time cannot be in the future.');
    }

    const delegatedPermission = await this.prisma.delegatedPermission.update({
      where: {
        id: permission.id,
      },
      data: {
        revokedAt,
        revokedByAccountId: user.accountId,
        revokeReason: this.normalizeReason(dto.reason),
      },
    });

    return {
      message: 'Delegated permission revoked successfully.',
      delegatedPermission,
    };
  }
}
