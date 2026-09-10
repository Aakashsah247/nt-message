import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../database/prisma.service';
import { AccountRole, type Prisma } from '../generated/prisma/client';

import { CreateOfficeDto } from './dto/create-office.dto';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { CreateOrgUnitTypeDto } from './dto/create-org-unit-type.dto';
import { MoveOrgUnitDto } from './dto/move-org-unit.dto';
import { SetOrgUnitStatusDto } from './dto/set-org-unit-status.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';
import { UpdateOrgUnitTypeDto } from './dto/update-org-unit-type.dto';
import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';

@Injectable()
export class OrganizationHierarchyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: OrganizationAuthorityService,
    private readonly authorization: OrganizationAuthorizationService,
    private readonly conversationsService?: ConversationsService,
  ) {}

  private normalizeCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private nameKey(value: string): string {
    return this.normalizeName(value).toLocaleLowerCase('en-US');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  async createOffice(user: AuthenticatedUser, dto: CreateOfficeDto) {
    this.authority.assertPlatformAdmin(user);

    const code = this.normalizeCode(dto.code);
    const name = this.normalizeName(dto.name);

    try {
      const office = await this.prisma.office.create({
        data: {
          code,
          name,
          nameKey: this.nameKey(name),
        },
      });

      return {
        message: 'Office created successfully.',
        office,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'An office with this code or name already exists.',
        );
      }

      throw error;
    }
  }

  async listOffices(user: AuthenticatedUser) {
    const visibleOfficeIds =
      await this.authority.listVisibleOfficeIds(user);

    const offices = await this.prisma.office.findMany({
      where:
        visibleOfficeIds === null
          ? {}
          : {
              id: {
                in: visibleOfficeIds,
              },
            },
      orderBy: [
        { isActive: 'desc' },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orgUnits: true,
            memberships: true,
          },
        },
      },
    });

    return { data: offices };
  }

  async getNavigationContext(user: AuthenticatedUser) {
    const { data: offices } = await this.listOffices(user);
    const officeIds = offices.map((office) => office.id);

    if (user.role === AccountRole.SUPER_ADMIN) {
      return {
        mode: 'VIEW' as const,
        officeIds,
        manageableOfficeIds: [],
      };
    }

    const manageableOfficeIds: string[] = [];

    for (const office of offices) {
      const [
        canCreateRoot,
        createScopes,
        renameScopes,
        moveScopes,
        statusScopes,
      ] = await Promise.all([
        this.authorization.can(
          user,
          CAPABILITIES.ORGANIZATION_CREATE_UNIT,
          office.id,
          null,
        ),
        this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.ORGANIZATION_CREATE_UNIT,
          office.id,
        ),
        this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.ORGANIZATION_RENAME_UNIT,
          office.id,
        ),
        this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.ORGANIZATION_MOVE_UNIT,
          office.id,
        ),
        this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
          office.id,
        ),
      ]);

      if (
        canCreateRoot ||
        createScopes.length > 0 ||
        renameScopes.length > 0 ||
        moveScopes.length > 0 ||
        statusScopes.length > 0
      ) {
        manageableOfficeIds.push(office.id);
      }
    }

    return {
      mode: manageableOfficeIds.length > 0
        ? ('MANAGE' as const)
        : ('NONE' as const),
      officeIds,
      manageableOfficeIds,
    };
  }

  async getOffice(user: AuthenticatedUser, officeId: string) {
    await this.authority.assertCanViewOffice(user, officeId);

    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        orgUnitTypes: {
          orderBy: [
            { isActive: 'desc' },
            { sortOrder: 'asc' },
            { name: 'asc' },
          ],
        },
        _count: {
          select: {
            orgUnits: true,
            memberships: true,
            leadershipAssignments: true,
          },
        },
      },
    });

    if (!office) {
      throw new NotFoundException('Office was not found.');
    }

    return { office };
  }

  async getTree(user: AuthenticatedUser, officeId: string) {
    await this.authority.assertCanViewOffice(user, officeId);

    const visibleOrgUnitIds =
      await this.authorization.visibleOrgUnitIds(
        user,
        CAPABILITIES.ORGANIZATION_VIEW,
        officeId,
      );

    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!office) {
      throw new NotFoundException('Office was not found.');
    }

    const units = await this.prisma.orgUnit.findMany({
      where: {
        officeId,
        id: {
          in: visibleOrgUnitIds,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        officeId: true,
        parentOrgUnitId: true,
        code: true,
        name: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        orgUnitType: {
          select: {
            id: true,
            code: true,
            name: true,
            isTeam: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            memberships: true,
            childOrgUnits: true,
            leadershipAssignments: true,
          },
        },
      },
    });

    const childrenByParent = new Map<
      string | null,
      typeof units
    >();

    for (const unit of units) {
      const siblings =
        childrenByParent.get(unit.parentOrgUnitId) ?? [];

      siblings.push(unit);
      childrenByParent.set(unit.parentOrgUnitId, siblings);
    }

    const buildTree = (
      parentId: string | null,
    ): Array<Record<string, unknown>> =>
      (childrenByParent.get(parentId) ?? []).map((unit) => ({
        ...unit,
        children: buildTree(unit.id),
      }));

    return {
      office,
      tree: buildTree(null),
    };
  }

  async getAvailableActions(
    user: AuthenticatedUser,
    officeId: string,
    orgUnitId: string | null,
  ) {
    await this.authority.assertCanViewOffice(user, officeId);

    if (orgUnitId) {
      await this.getUnitForOffice(officeId, orgUnitId);
    }

    const createUnit = await this.authorization.can(
      user,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      officeId,
      orgUnitId,
    );

    if (!orgUnitId) {
      return {
        officeId,
        orgUnitId: null,
        availableActions: {
          createChildUnit: createUnit,
          renameUnit: false,
          moveUnit: false,
          changeUnitStatus: false,
        },
      };
    }

    const [renameUnit, moveUnit, changeUnitStatus] =
      await Promise.all([
        this.authorization.can(
          user,
          CAPABILITIES.ORGANIZATION_RENAME_UNIT,
          officeId,
          orgUnitId,
        ),
        this.authorization.can(
          user,
          CAPABILITIES.ORGANIZATION_MOVE_UNIT,
          officeId,
          orgUnitId,
        ),
        this.authorization.can(
          user,
          CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
          officeId,
          orgUnitId,
        ),
      ]);

    return {
      officeId,
      orgUnitId,
      availableActions: {
        createChildUnit: createUnit,
        renameUnit,
        moveUnit,
        changeUnitStatus,
      },
    };
  }

  async createUnitType(
    user: AuthenticatedUser,
    officeId: string,
    dto: CreateOrgUnitTypeDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      officeId,
      null,
    );

    const code = this.normalizeCode(dto.code);
    const name = this.normalizeName(dto.name);

    if (dto.isTeam) {
      throw new BadRequestException(
        'Operational Teams are managed separately and cannot be created as OrgUnit types.',
      );
    }

    try {
      const unitType = await this.prisma.orgUnitType.create({
        data: {
          officeId,
          code,
          name,
          nameKey: this.nameKey(name),
          isTeam: dto.isTeam ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      return {
        message: 'Organization type created successfully.',
        unitType,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This organization type already exists.',
        );
      }

      throw error;
    }
  }

  async updateUnitType(
    user: AuthenticatedUser,
    officeId: string,
    typeId: string,
    dto: UpdateOrgUnitTypeDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      officeId,
      null,
    );

    if (dto.isActive !== undefined) {
      await this.authorization.assertCan(
        user,
        CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
        officeId,
        null,
      );
    }

    const existing = await this.prisma.orgUnitType.findFirst({
      where: {
        id: typeId,
        officeId,
      },
    });

    if (!existing) {
      throw new NotFoundException(
        'Organization type was not found.',
      );
    }

    if (
      dto.isActive === false &&
      existing.isActive
    ) {
      const activeUnits = await this.prisma.orgUnit.count({
        where: {
          orgUnitTypeId: typeId,
          isActive: true,
        },
      });

      if (activeUnits > 0) {
        throw new ConflictException(
          'Deactivate the active organizational units using this type first.',
        );
      }
    }

    const data: Prisma.OrgUnitTypeUpdateInput = {};

    if (dto.code !== undefined) {
      data.code = this.normalizeCode(dto.code);
    }

    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      data.name = name;
      data.nameKey = this.nameKey(name);
    }

    if (
      dto.isTeam !== undefined &&
      dto.isTeam !== existing.isTeam
    ) {
      throw new BadRequestException(
        'Team classification on legacy OrgUnit types is historical and cannot be changed.',
      );
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    try {
      const unitType = await this.prisma.orgUnitType.update({
        where: { id: typeId },
        data,
      });

      return {
        message: 'Organization type updated successfully.',
        unitType,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'This organization type already exists.',
        );
      }

      throw error;
    }
  }

  async createOrgUnit(
    user: AuthenticatedUser,
    officeId: string,
    dto: CreateOrgUnitDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      officeId,
      dto.parentOrgUnitId ?? null,
    );

    const code = this.normalizeCode(dto.code);
    const name = this.normalizeName(dto.name);

    try {
      const orgUnit = await this.prisma.$transaction(
        async (transaction) => {
          const unitType =
            await transaction.orgUnitType.findFirst({
              where: {
                id: dto.orgUnitTypeId,
                officeId,
                isActive: true,
              },
              select: {
                id: true,
                isTeam: true,
              },
            });

          if (!unitType) {
            throw new BadRequestException(
              'Select an active organization type from this office.',
            );
          }

          if (unitType.isTeam) {
            throw new BadRequestException(
              'Operational Teams cannot be created as formal OrgUnits.',
            );
          }

          if (dto.parentOrgUnitId) {
            const parent = await transaction.orgUnit.findFirst({
              where: {
                id: dto.parentOrgUnitId,
                officeId,
                isActive: true,
              },
              select: { id: true },
            });

            if (!parent) {
              throw new BadRequestException(
                'Select an active parent unit from this office.',
              );
            }
          }

          const created = await transaction.orgUnit.create({
            data: {
              officeId,
              orgUnitTypeId: dto.orgUnitTypeId,
              parentOrgUnitId: dto.parentOrgUnitId ?? null,
              code,
              name,
              nameKey: this.nameKey(name),
              sortOrder: dto.sortOrder ?? 0,
            },
          });

          await transaction.orgUnitClosure.create({
            data: {
              ancestorOrgUnitId: created.id,
              descendantOrgUnitId: created.id,
              depth: 0,
            },
          });

          if (dto.parentOrgUnitId) {
            const ancestors =
              await transaction.orgUnitClosure.findMany({
                where: {
                  descendantOrgUnitId:
                    dto.parentOrgUnitId,
                },
                select: {
                  ancestorOrgUnitId: true,
                  depth: true,
                },
              });

            if (ancestors.length > 0) {
              await transaction.orgUnitClosure.createMany({
                data: ancestors.map((ancestor) => ({
                  ancestorOrgUnitId:
                    ancestor.ancestorOrgUnitId,
                  descendantOrgUnitId: created.id,
                  depth: ancestor.depth + 1,
                })),
              });
            }
          }

          return created;
        },
      );

      return {
        message: 'Organizational unit created successfully.',
        orgUnit,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A unit with this code or name already exists in this location.',
        );
      }

      throw error;
    }
  }

  async updateOrgUnit(
    user: AuthenticatedUser,
    officeId: string,
    unitId: string,
    dto: UpdateOrgUnitDto,
  ) {
    const existing = await this.getUnitForOffice(
      officeId,
      unitId,
    );

    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      officeId,
      unitId,
    );

    if (
      dto.code === undefined &&
      dto.name === undefined &&
      dto.sortOrder === undefined
    ) {
      throw new BadRequestException(
        'Provide at least one field to update.',
      );
    }

    const data: Prisma.OrgUnitUpdateInput = {};

    if (dto.code !== undefined) {
      data.code = this.normalizeCode(dto.code);
    }

    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      data.name = name;
      data.nameKey = this.nameKey(name);
    }

    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    try {
      const orgUnit = await this.prisma.orgUnit.update({
        where: {
          id: existing.id,
        },
        data,
      });

      return {
        message: 'Organizational unit updated successfully.',
        orgUnit,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A unit with this code or name already exists in this location.',
        );
      }

      throw error;
    }
  }

  async moveOrgUnit(
    user: AuthenticatedUser,
    officeId: string,
    unitId: string,
    dto: MoveOrgUnitDto,
  ) {
    const unit = await this.getUnitForOffice(
      officeId,
      unitId,
    );

    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_MOVE_UNIT,
      officeId,
      unitId,
    );

    const newParentId = dto.parentOrgUnitId ?? null;

    if (newParentId === unit.id) {
      throw new BadRequestException(
        'A unit cannot be placed inside itself.',
      );
    }

    if (newParentId) {
      const parent = await this.prisma.orgUnit.findFirst({
        where: {
          id: newParentId,
          officeId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!parent) {
        throw new BadRequestException(
          'Select an active parent unit from this office.',
        );
      }

      await this.authorization.assertCan(
        user,
        CAPABILITIES.ORGANIZATION_MOVE_UNIT,
        officeId,
        newParentId,
      );
    } else {
      await this.authorization.assertCan(
        user,
        CAPABILITIES.ORGANIZATION_MOVE_UNIT,
        officeId,
        null,
      );
    }

    const orgUnit = await this.prisma.$transaction(
      async (transaction) => {
        if (newParentId) {
          const createsCycle =
            await transaction.orgUnitClosure.findUnique({
              where: {
                ancestorOrgUnitId_descendantOrgUnitId: {
                  ancestorOrgUnitId: unitId,
                  descendantOrgUnitId: newParentId,
                },
              },
              select: { depth: true },
            });

          if (createsCycle) {
            throw new ConflictException(
              'This move would create a circular organization structure.',
            );
          }
        }

        const subtree =
          await transaction.orgUnitClosure.findMany({
            where: {
              ancestorOrgUnitId: unitId,
            },
            select: {
              descendantOrgUnitId: true,
              depth: true,
            },
          });

        if (subtree.length === 0) {
          throw new ConflictException(
            'The organization tree is incomplete for this unit.',
          );
        }

        const subtreeIds = subtree.map(
          (item) => item.descendantOrgUnitId,
        );

        await transaction.orgUnitClosure.deleteMany({
          where: {
            descendantOrgUnitId: {
              in: subtreeIds,
            },
            ancestorOrgUnitId: {
              notIn: subtreeIds,
            },
          },
        });

        const updated = await transaction.orgUnit.update({
          where: { id: unitId },
          data: {
            parentOrgUnitId: newParentId,
            ...(dto.sortOrder !== undefined
              ? { sortOrder: dto.sortOrder }
              : {}),
          },
        });

        if (newParentId) {
          const parentAncestors =
            await transaction.orgUnitClosure.findMany({
              where: {
                descendantOrgUnitId: newParentId,
              },
              select: {
                ancestorOrgUnitId: true,
                depth: true,
              },
            });

          const links = parentAncestors.flatMap(
            (ancestor) =>
              subtree.map((descendant) => ({
                ancestorOrgUnitId:
                  ancestor.ancestorOrgUnitId,
                descendantOrgUnitId:
                  descendant.descendantOrgUnitId,
                depth:
                  ancestor.depth +
                  1 +
                  descendant.depth,
              })),
          );

          if (links.length > 0) {
            await transaction.orgUnitClosure.createMany({
              data: links,
              skipDuplicates: true,
            });
          }
        }

        return updated;
      },
    );

    await this.conversationsService?.synchronizeAllOfficialGroupsSafely(
      user.accountId,
      'ORG_UNIT_MOVED',
    );

    return {
      message: 'Organizational unit moved successfully.',
      orgUnit,
    };
  }

  async setOrgUnitStatus(
    user: AuthenticatedUser,
    officeId: string,
    unitId: string,
    dto: SetOrgUnitStatusDto,
  ) {
    const unit = await this.getUnitForOffice(
      officeId,
      unitId,
    );

    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
      officeId,
      unitId,
    );

    if (unit.isActive === dto.isActive) {
      return {
        message: dto.isActive
          ? 'Organizational unit is already active.'
          : 'Organizational unit is already inactive.',
        orgUnit: unit,
      };
    }

    if (!dto.isActive) {
      const now = new Date();

      const [
        activeChildren,
        activeMemberships,
        activeLeadership,
      ] = await Promise.all([
        this.prisma.orgUnit.count({
          where: {
            parentOrgUnitId: unitId,
            isActive: true,
          },
        }),
        this.prisma.orgMembership.count({
          where: {
            orgUnitId: unitId,
            startsAt: { lte: now },
            OR: [
              { endsAt: null },
              { endsAt: { gt: now } },
            ],
          },
        }),
        this.prisma.orgLeadershipAssignment.count({
          where: {
            orgUnitId: unitId,
            effectiveFrom: { lte: now },
            OR: [
              { effectiveUntil: null },
              { effectiveUntil: { gt: now } },
            ],
          },
        }),
      ]);

      if (
        activeChildren > 0 ||
        activeMemberships > 0 ||
        activeLeadership > 0
      ) {
        throw new ConflictException(
          'Move or end the active people, leadership and child units before deactivating this unit.',
        );
      }
    } else {
      const type = await this.prisma.orgUnitType.findUnique({
        where: { id: unit.orgUnitTypeId },
        select: {
          isActive: true,
        },
      });

      if (!type?.isActive) {
        throw new ConflictException(
          'Activate this organization type first.',
        );
      }

      if (unit.parentOrgUnitId) {
        const parent = await this.prisma.orgUnit.findUnique({
          where: { id: unit.parentOrgUnitId },
          select: { isActive: true },
        });

        if (!parent?.isActive) {
          throw new ConflictException(
            'Activate the parent unit first.',
          );
        }
      }
    }

    const orgUnit = await this.prisma.orgUnit.update({
      where: { id: unitId },
      data: {
        isActive: dto.isActive,
      },
    });

    await this.conversationsService?.synchronizeAllOfficialGroupsSafely(
      user.accountId,
      dto.isActive ? 'ORG_UNIT_ACTIVATED' : 'ORG_UNIT_DEACTIVATED',
    );

    return {
      message: dto.isActive
        ? 'Organizational unit activated successfully.'
        : 'Organizational unit deactivated successfully.',
      orgUnit,
    };
  }

  private async getUnitForOffice(
    officeId: string,
    unitId: string,
  ) {
    const unit = await this.prisma.orgUnit.findFirst({
      where: {
        id: unitId,
        officeId,
      },
    });

    if (!unit) {
      throw new NotFoundException(
        'Organizational unit was not found.',
      );
    }

    return unit;
  }
}
