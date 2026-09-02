import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { OrgMembershipType } from '../generated/prisma/client';

export type LegacyOrgEntityType =
  | 'DIVISION'
  | 'DEPARTMENT'
  | 'TEAM';

export interface LegacyOrganizationScopeInput {
  divisionId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
}

@Injectable()
export class LegacyOrganizationCompatibilityService {
  private static readonly LEGACY_OFFICE_CODE = 'PATAN';

  constructor(private readonly prisma: PrismaService) {}

  async resolveLegacyScope(
    input: LegacyOrganizationScopeInput,
  ) {
    if (
      !input.divisionId &&
      !input.departmentId &&
      !input.teamId
    ) {
      throw new BadRequestException(
        'Provide a legacy Division, Department or Team identifier.',
      );
    }

    const office = await this.getLegacyOffice();

    let divisionId = input.divisionId ?? null;
    let departmentId = input.departmentId ?? null;
    const teamId = input.teamId ?? null;

    if (teamId) {
      const team =
        await this.prisma.departmentTeam.findUnique({
          where: {
            id: teamId,
          },
          select: {
            id: true,
            departmentId: true,
          },
        });

      if (!team) {
        throw new NotFoundException(
          'Legacy Team was not found.',
        );
      }

      if (
        departmentId &&
        team.departmentId !== departmentId
      ) {
        throw new BadRequestException(
          'The selected legacy Team does not belong to the selected Department.',
        );
      }

      departmentId = team.departmentId;
    }

    if (departmentId) {
      const department =
        await this.prisma.department.findUnique({
          where: {
            id: departmentId,
          },
          select: {
            id: true,
            divisionId: true,
          },
        });

      if (!department) {
        throw new NotFoundException(
          'Legacy Department was not found.',
        );
      }

      if (
        divisionId &&
        department.divisionId !== divisionId
      ) {
        throw new BadRequestException(
          'The selected legacy Department does not belong to the selected Division.',
        );
      }

      divisionId = department.divisionId;
    }

    if (!divisionId) {
      throw new ConflictException(
        'The legacy organization scope cannot be resolved to a Division.',
      );
    }

    const division =
      await this.prisma.division.findUnique({
        where: {
          id: divisionId,
        },
        select: {
          id: true,
        },
      });

    if (!division) {
      throw new NotFoundException(
        'Legacy Division was not found.',
      );
    }

    const divisionOrgUnitId =
      await this.resolveMappedOrgUnitId(
        office.id,
        'DIVISION',
        divisionId,
      );

    const departmentOrgUnitId = departmentId
      ? await this.resolveMappedOrgUnitId(
          office.id,
          'DEPARTMENT',
          departmentId,
        )
      : null;

    const teamOrgUnitId = teamId
      ? await this.resolveMappedOrgUnitId(
          office.id,
          'TEAM',
          teamId,
        )
      : null;

    return {
      office,

      legacy: {
        divisionId,
        departmentId,
        teamId,
      },

      orgUnits: {
        divisionOrgUnitId,
        departmentOrgUnitId,
        teamOrgUnitId,

        mostSpecificOrgUnitId:
          teamOrgUnitId ??
          departmentOrgUnitId ??
          divisionOrgUnitId,
      },
    };
  }

  async resolveLegacyEntity(
    entityType: LegacyOrgEntityType,
    legacyEntityId: string,
  ) {
    const office = await this.getLegacyOffice();

    const mapping =
      await this.prisma.legacyOrgUnitMapping.findFirst({
        where: {
          officeId: office.id,
          legacyEntityType: entityType,
          legacyEntityId,
        },
        select: {
          id: true,
          legacyEntityType: true,
          legacyEntityId: true,
          orgUnitId: true,

          orgUnit: {
            select: {
              id: true,
              officeId: true,
              parentOrgUnitId: true,
              code: true,
              name: true,
              isActive: true,

              orgUnitType: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  isTeam: true,
                },
              },
            },
          },
        },
      });

    if (!mapping) {
      throw new ConflictException(
        `Legacy ${entityType.toLowerCase()} mapping is missing from the V3 organization hierarchy.`,
      );
    }

    return {
      office,
      mapping,
    };
  }

  async resolveOrgUnitToLegacy(
    orgUnitId: string,
  ) {
    const orgUnit =
      await this.prisma.orgUnit.findUnique({
        where: {
          id: orgUnitId,
        },
        select: {
          id: true,
          officeId: true,
          parentOrgUnitId: true,
          code: true,
          name: true,
          isActive: true,

          orgUnitType: {
            select: {
              id: true,
              code: true,
              name: true,
              isTeam: true,
            },
          },
        },
      });

    if (!orgUnit) {
      throw new NotFoundException(
        'Organizational unit was not found.',
      );
    }

    const mapping =
      await this.prisma.legacyOrgUnitMapping.findUnique({
        where: {
          orgUnitId,
        },
        select: {
          legacyEntityType: true,
          legacyEntityId: true,
        },
      });

    return {
      orgUnit,

      isLegacyBackfilled: mapping !== null,

      legacy: mapping
        ? {
            entityType: mapping.legacyEntityType,
            entityId: mapping.legacyEntityId,
          }
        : null,
    };
  }

  async resolveCurrentPrimaryPlacement(
    employeeId: string,
    at = new Date(),
  ) {
    const membership =
      await this.prisma.orgMembership.findFirst({
        where: {
          employeeId,
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

        orderBy: {
          startsAt: 'desc',
        },

        select: {
          id: true,
          employeeId: true,
          officeId: true,
          orgUnitId: true,
          membershipType: true,
          assignmentSource: true,
          startsAt: true,
          endsAt: true,

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
              parentOrgUnitId: true,
              code: true,
              name: true,
              isActive: true,

              orgUnitType: {
                select: {
                  code: true,
                  name: true,
                  isTeam: true,
                },
              },
            },
          },
        },
      });

    if (!membership) {
      return null;
    }

    if (!membership.orgUnitId) {
      return {
        membership,
        legacy: null,
      };
    }

    const mapping =
      await this.prisma.legacyOrgUnitMapping.findUnique({
        where: {
          orgUnitId: membership.orgUnitId,
        },
        select: {
          legacyEntityType: true,
          legacyEntityId: true,
        },
      });

    return {
      membership,

      legacy: mapping
        ? {
            entityType: mapping.legacyEntityType,
            entityId: mapping.legacyEntityId,
          }
        : null,
    };
  }

  private async getLegacyOffice() {
    const office = await this.prisma.office.findUnique({
      where: {
        code:
          LegacyOrganizationCompatibilityService
            .LEGACY_OFFICE_CODE,
      },

      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!office) {
      throw new ConflictException(
        'The legacy Patan Office mapping has not been initialized.',
      );
    }

    return office;
  }

  private async resolveMappedOrgUnitId(
    officeId: string,
    entityType: LegacyOrgEntityType,
    legacyEntityId: string,
  ): Promise<string> {
    const mapping =
      await this.prisma.legacyOrgUnitMapping.findFirst({
        where: {
          officeId,
          legacyEntityType: entityType,
          legacyEntityId,
        },

        select: {
          orgUnitId: true,
        },
      });

    if (!mapping) {
      throw new ConflictException(
        `Legacy ${entityType.toLowerCase()} mapping is missing from the V3 organization hierarchy.`,
      );
    }

    return mapping.orgUnitId;
  }
}
