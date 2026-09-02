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
  AccountRole,
  OrgMembershipType,
} from '../generated/prisma/client';

import {
  DELEGABLE_CAPABILITIES,
  isCapability,
} from './organization-capabilities';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { CreateDelegatedPermissionDto } from './dto/create-delegated-permission.dto';
import { RevokeDelegatedPermissionDto } from './dto/revoke-delegated-permission.dto';

@Injectable()
export class OrganizationDelegationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  private normalizeReason(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
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

  async list(
    user: AuthenticatedUser,
    officeId: string,
  ) {
    const visibleOrgUnitIds =
      await this.authorization.visibleOrgUnitIds(
        user,
        'leadership.view',
        officeId,
      );

    const officeWide =
      await this.authorization.can(
        user,
        'leadership.view',
        officeId,
        null,
      );

    if (!officeWide && visibleOrgUnitIds.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to view delegation history.',
      );
    }

    const data = await this.prisma.delegatedPermission.findMany({
      where: {
        officeId,
        ...(officeWide
          ? {}
          : {
              orgUnitId: {
                in: visibleOrgUnitIds,
              },
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

    return { data };
  }

  async create(
    user: AuthenticatedUser,
    officeId: string,
    dto: CreateDelegatedPermissionDto,
  ) {
    if (user.role === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The system administrator cannot grant internal office delegation.',
      );
    }

    if (!isCapability(dto.capability)) {
      throw new BadRequestException(
        'The selected capability is not supported.',
      );
    }

    if (!DELEGABLE_CAPABILITIES.has(dto.capability)) {
      throw new ForbiddenException(
        'This capability cannot be delegated.',
      );
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
      ? this.parseDate(
          dto.effectiveUntil,
          'Effective end time',
          effectiveFrom,
        )
      : null;

    if (
      effectiveUntil &&
      effectiveUntil.getTime() <= effectiveFrom.getTime()
    ) {
      throw new BadRequestException(
        'Effective end time must be later than the start time.',
      );
    }

    if (orgUnitId) {
      const orgUnit = await this.prisma.orgUnit.findFirst({
        where: {
          id: orgUnitId,
          officeId,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      if (!orgUnit) {
        throw new BadRequestException(
          'Select an active organizational unit from this office.',
        );
      }
    }

    if (
      !(await this.authorization.canRedelegate(
        user,
        dto.capability,
        officeId,
        orgUnitId,
        includeDescendants,
        effectiveFrom,
        effectiveUntil,
      ))
    ) {
      throw new ForbiddenException(
        'You cannot delegate this capability or organizational scope.',
      );
    }

    const grantee = await this.prisma.account.findUnique({
      where: {
        id: dto.granteeAccountId,
      },
      select: {
        id: true,
        role: true,
        isEnabled: true,
        employeeId: true,
      },
    });

    if (!grantee?.isEnabled || !grantee.employeeId) {
      throw new ConflictException(
        'Select an active employee account.',
      );
    }

    if (grantee.role === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The system administrator cannot receive office delegation.',
      );
    }

    const membership =
      await this.prisma.orgMembership.findFirst({
        where: {
          employeeId: grantee.employeeId,
          officeId,
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
        'The employee must have an active primary membership in this office.',
      );
    }

    const duplicate =
      await this.prisma.delegatedPermission.findFirst({
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

    const delegatedPermission =
      await this.prisma.delegatedPermission.create({
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
    const permission =
      await this.prisma.delegatedPermission.findFirst({
        where: {
          id: permissionId,
          officeId,
        },
      });

    if (!permission) {
      throw new NotFoundException(
        'Delegated permission was not found.',
      );
    }

    if (permission.revokedAt) {
      throw new ConflictException(
        'This delegated permission has already been revoked.',
      );
    }

    const officeHead =
      await this.authorization.isOfficeHead(
        user,
        officeId,
      );

    if (
      !officeHead &&
      permission.grantedByAccountId !== user.accountId
    ) {
      throw new ForbiddenException(
        'Only the Office Head or original grantor can revoke this delegation.',
      );
    }

    const revokedAt = this.parseDate(
      dto.effectiveAt,
      'Revocation time',
      new Date(),
    );

    if (
      revokedAt.getTime() < permission.effectiveFrom.getTime()
    ) {
      throw new BadRequestException(
        'Revocation time cannot be earlier than the delegation start time.',
      );
    }

    const delegatedPermission =
      await this.prisma.delegatedPermission.update({
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
