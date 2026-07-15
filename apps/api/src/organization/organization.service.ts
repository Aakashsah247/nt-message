import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../database/prisma.service';

import type { Prisma } from '../generated/prisma/client';

import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
  ) {}

  private normalizeCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private isForeignKeyConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2003'
    );
  }

  async createDivision(dto: CreateDivisionDto) {
    const code = this.normalizeCode(dto.code);

    const name = this.normalizeName(dto.name);

    const existingDivision = await this.prisma.division.findFirst({
      where: {
        OR: [
          {
            code,
          },
          {
            name: {
              equals: name,
              mode: 'insensitive',
            },
          },
        ],
      },

      select: {
        code: true,
        name: true,
      },
    });

    if (existingDivision) {
      if (existingDivision.code === code) {
        throw new ConflictException(
          'A division with this code already exists.',
        );
      }

      throw new ConflictException('A division with this name already exists.');
    }

    const division = await this.prisma.division.create({
      data: {
        code,
        name,
        isActive: true,
      },

      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Division created successfully.',
      division,
    };
  }

  async listDivisions() {
    const divisions = await this.prisma.division.findMany({
      orderBy: [
        {
          isActive: 'desc',
        },
        {
          name: 'asc',
        },
      ],

      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        _count: {
          select: {
            departments: true,
            employees: true,
            accountRequests: true,
            managementPositions: true,
          },
        },
      },
    });

    return {
      data: divisions,
    };
  }

  async getDivisionById(id: string) {
    const division = await this.prisma.division.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        departments: {
          orderBy: [
            {
              isActive: 'desc',
            },
            {
              name: 'asc',
            },
          ],

          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,

            _count: {
              select: {
                employees: true,
                accountRequests: true,
                managementPositions: true,
              },
            },
          },
        },

        _count: {
          select: {
            departments: true,
            employees: true,
            accountRequests: true,
            managementPositions: true,
          },
        },
      },
    });

    if (!division) {
      throw new NotFoundException('Division was not found.');
    }

    return {
      division,
    };
  }

  async updateDivision(id: string, dto: UpdateDivisionDto) {
    const existingDivision = await this.prisma.division.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!existingDivision) {
      throw new NotFoundException('Division was not found.');
    }

    const code =
      dto.code !== undefined ? this.normalizeCode(dto.code) : undefined;

    const name =
      dto.name !== undefined ? this.normalizeName(dto.name) : undefined;

    if (
      code === undefined &&
      name === undefined &&
      dto.isActive === undefined
    ) {
      throw new BadRequestException(
        'Provide at least one division field to update.',
      );
    }

    const duplicateConditions: Prisma.DivisionWhereInput[] = [];

    if (code !== undefined) {
      duplicateConditions.push({
        code,
      });
    }

    if (name !== undefined) {
      duplicateConditions.push({
        name: {
          equals: name,
          mode: 'insensitive',
        },
      });
    }

    if (duplicateConditions.length > 0) {
      const duplicateDivision = await this.prisma.division.findFirst({
        where: {
          id: {
            not: id,
          },

          OR: duplicateConditions,
        },

        select: {
          code: true,
          name: true,
        },
      });

      if (duplicateDivision?.code === code) {
        throw new ConflictException(
          'A division with this code already exists.',
        );
      }

      if (duplicateDivision) {
        throw new ConflictException(
          'A division with this name already exists.',
        );
      }
    }

    if (dto.isActive === false && existingDivision.isActive) {
      const activeDepartmentCount = await this.prisma.department.count({
        where: {
          divisionId: id,
          isActive: true,
        },
      });

      if (activeDepartmentCount > 0) {
        throw new ConflictException(
          "Deactivate the division's active departments before deactivating the division.",
        );
      }

      const protectedManagementPosition =
        await this.prisma.managementPosition.findFirst({
          where: {
            divisionId: id,

            OR: [
              {
                reservedByAccountRequestId: {
                  not: null,
                },
              },
              {
                assignments: {
                  some: {
                    endedAt: null,
                  },
                },
              },
            ],
          },

          select: {
            positionType: true,

            department: {
              select: {
                name: true,
              },
            },
          },
        });

      if (protectedManagementPosition) {
        const scopeName =
          protectedManagementPosition.department?.name ?? existingDivision.name;

        throw new ConflictException(
          `Deactivate or release the ${protectedManagementPosition.positionType} management position for ${scopeName} before deactivating this division.`,
        );
      }
    }

    const data: Prisma.DivisionUpdateInput = {};

    if (code !== undefined) {
      data.code = code;
    }

    if (name !== undefined) {
      data.name = name;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    const division = await this.prisma.$transaction(async (transaction) => {
      const updatedDivision = await transaction.division.update({
        where: {
          id,
        },

        data,

        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (
        dto.isActive !== undefined &&
        dto.isActive !== existingDivision.isActive
      ) {
        await transaction.managementPosition.updateMany({
          where: {
            divisionId: id,

            // Department positions remain inactive until their own
            // departments are reactivated.
            ...(dto.isActive
              ? {
                  departmentId: null,
                }
              : {}),
          },

          data: {
            isActive: dto.isActive,
          },
        });
      }

      return updatedDivision;
    });

    await this.conversationsService.synchronizeAllOfficialGroupsSafely(
      null,
      'DIVISION_UPDATED',
    );

    return {
      message: 'Division updated successfully.',
      division,
    };
  }

  async deleteDivision(id: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const division = await transaction.division.findUnique({
          where: {
            id,
          },

          select: {
            id: true,
            code: true,
            name: true,

            _count: {
              select: {
                departments: true,
                employees: true,
                accountRequests: true,
                managementPositions: true,
              },
            },
          },
        });

        if (!division) {
          throw new NotFoundException('Division was not found.');
        }

        const blockers: string[] = [];

        if (division._count.departments > 0) {
          blockers.push(`${division._count.departments} department record(s)`);
        }

        if (division._count.employees > 0) {
          blockers.push(`${division._count.employees} employee record(s)`);
        }

        if (division._count.accountRequests > 0) {
          blockers.push(
            `${division._count.accountRequests} account request record(s)`,
          );
        }

        if (division._count.managementPositions > 0) {
          blockers.push(
            `${division._count.managementPositions} management position record(s)`,
          );
        }

        // Historical references block permanent deletion.
        if (blockers.length > 0) {
          throw new ConflictException(
            `This division cannot be deleted because it has ${blockers.join(', ')}. Deactivate it instead.`,
          );
        }

        await transaction.division.delete({
          where: {
            id,
          },
        });

        return {
          message: 'Division deleted successfully.',

          deletedDivision: {
            id: division.id,
            code: division.code,
            name: division.name,
          },
        };
      });
    } catch (error: unknown) {
      // Database constraints protect concurrent writes.
      if (this.isForeignKeyConstraintError(error)) {
        throw new ConflictException(
          'This division cannot be deleted because another record still uses it.',
        );
      }

      throw error;
    }
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const code = this.normalizeCode(dto.code);

    const name = this.normalizeName(dto.name);

    const division = await this.prisma.division.findUnique({
      where: {
        id: dto.divisionId,
      },

      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    if (!division) {
      throw new NotFoundException('Division was not found.');
    }

    if (!division.isActive) {
      throw new ConflictException(
        'A department cannot be created inside an inactive division.',
      );
    }

    const existingDepartment = await this.prisma.department.findFirst({
      where: {
        divisionId: division.id,

        OR: [
          {
            code,
          },
          {
            name: {
              equals: name,
              mode: 'insensitive',
            },
          },
        ],
      },

      select: {
        code: true,
        name: true,
      },
    });

    if (existingDepartment) {
      if (existingDepartment.code === code) {
        throw new ConflictException(
          'A department with this code already exists in this division.',
        );
      }

      throw new ConflictException(
        'A department with this name already exists in this division.',
      );
    }

    const department = await this.prisma.department.create({
      data: {
        code,
        name,
        isActive: true,

        division: {
          connect: {
            id: division.id,
          },
        },
      },

      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        division: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    return {
      message: 'Department created successfully.',
      department,
    };
  }

  async listDepartments() {
    const departments = await this.prisma.department.findMany({
      orderBy: [
        {
          isActive: 'desc',
        },
        {
          name: 'asc',
        },
      ],

      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        division: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },

        _count: {
          select: {
            employees: true,
            accountRequests: true,
            managementPositions: true,
          },
        },
      },
    });

    return {
      data: departments,
    };
  }

  async listPublicDepartments() {
    const departments = await this.prisma.department.findMany({
      where: {
        isActive: true,

        division: {
          is: {
            isActive: true,
          },
        },
      },

      orderBy: [
        {
          division: {
            name: 'asc',
          },
        },
        {
          name: 'asc',
        },
      ],

      select: {
        id: true,
        code: true,
        name: true,
        divisionId: true,

        division: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    return {
      data: departments,
    };
  }

  async getDepartmentById(id: string) {
    const department = await this.prisma.department.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,

        division: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },

        _count: {
          select: {
            employees: true,
            accountRequests: true,
            managementPositions: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department was not found.');
    }

    return {
      department,
    };
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    const existingDepartment = await this.prisma.department.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        divisionId: true,
        code: true,
        name: true,
        isActive: true,

        _count: {
          select: {
            employees: true,
            accountRequests: true,
            managementPositions: true,
          },
        },
      },
    });

    if (!existingDepartment) {
      throw new NotFoundException('Department was not found.');
    }

    const code =
      dto.code !== undefined ? this.normalizeCode(dto.code) : undefined;

    const name =
      dto.name !== undefined ? this.normalizeName(dto.name) : undefined;

    if (
      dto.divisionId === undefined &&
      code === undefined &&
      name === undefined &&
      dto.isActive === undefined
    ) {
      throw new BadRequestException(
        'Provide at least one department field to update.',
      );
    }

    const targetDivisionId = dto.divisionId ?? existingDepartment.divisionId;

    if (dto.isActive === false && existingDepartment.isActive) {
      const protectedManagementPosition =
        await this.prisma.managementPosition.findFirst({
          where: {
            departmentId: id,

            OR: [
              {
                reservedByAccountRequestId: {
                  not: null,
                },
              },
              {
                assignments: {
                  some: {
                    endedAt: null,
                  },
                },
              },
            ],
          },

          select: {
            positionType: true,
          },
        });

      if (protectedManagementPosition) {
        throw new ConflictException(
          `Deactivate or release the ${protectedManagementPosition.positionType} management position before deactivating this department.`,
        );
      }
    }

    if (dto.isActive === true && !existingDepartment.isActive) {
      const targetDivision = await this.prisma.division.findUnique({
        where: {
          id: targetDivisionId,
        },

        select: {
          isActive: true,
        },
      });

      if (!targetDivision) {
        throw new NotFoundException('Target division was not found.');
      }

      if (!targetDivision.isActive) {
        throw new ConflictException(
          'A department cannot be reactivated inside an inactive division.',
        );
      }
    }

    if (
      dto.divisionId !== undefined &&
      dto.divisionId !== existingDepartment.divisionId
    ) {
      if (
        existingDepartment._count.employees > 0 ||
        existingDepartment._count.accountRequests > 0 ||
        existingDepartment._count.managementPositions > 0
      ) {
        throw new ConflictException(
          'A department with employees, account requests, or management positions cannot be moved to another division.',
        );
      }

      const targetDivision = await this.prisma.division.findUnique({
        where: {
          id: dto.divisionId,
        },

        select: {
          id: true,
          isActive: true,
        },
      });

      if (!targetDivision) {
        throw new NotFoundException('Target division was not found.');
      }

      if (!targetDivision.isActive) {
        throw new ConflictException(
          'A department cannot be moved into an inactive division.',
        );
      }
    }

    const duplicateConditions: Prisma.DepartmentWhereInput[] = [];

    if (code !== undefined) {
      duplicateConditions.push({
        code,
      });
    }

    if (name !== undefined) {
      duplicateConditions.push({
        name: {
          equals: name,
          mode: 'insensitive',
        },
      });
    }

    if (duplicateConditions.length > 0) {
      const duplicateDepartment = await this.prisma.department.findFirst({
        where: {
          id: {
            not: id,
          },

          divisionId: targetDivisionId,

          OR: duplicateConditions,
        },

        select: {
          code: true,
          name: true,
        },
      });

      if (duplicateDepartment?.code === code) {
        throw new ConflictException(
          'A department with this code already exists in the target division.',
        );
      }

      if (duplicateDepartment) {
        throw new ConflictException(
          'A department with this name already exists in the target division.',
        );
      }
    }

    const data: Prisma.DepartmentUpdateInput = {};

    if (code !== undefined) {
      data.code = code;
    }

    if (name !== undefined) {
      data.name = name;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (
      dto.divisionId !== undefined &&
      dto.divisionId !== existingDepartment.divisionId
    ) {
      data.division = {
        connect: {
          id: dto.divisionId,
        },
      };
    }

    const department = await this.prisma.$transaction(async (transaction) => {
      const updatedDepartment = await transaction.department.update({
        where: {
          id,
        },

        data,

        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,

          division: {
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
            },
          },

          _count: {
            select: {
              employees: true,
              accountRequests: true,
              managementPositions: true,
            },
          },
        },
      });

      if (
        dto.divisionId !== undefined &&
        dto.divisionId !== existingDepartment.divisionId
      ) {
        await transaction.conversation.updateMany({
          where: {
            officialDepartmentId: id,
          },
          data: {
            officialDivisionId: dto.divisionId,
          },
        });
      }

      if (
        dto.isActive !== undefined &&
        dto.isActive !== existingDepartment.isActive
      ) {
        await transaction.managementPosition.updateMany({
          where: {
            departmentId: id,
          },

          data: {
            isActive: dto.isActive,
          },
        });
      }

      return updatedDepartment;
    });

    await this.conversationsService.synchronizeAllOfficialGroupsSafely(
      null,
      'DEPARTMENT_UPDATED',
    );

    return {
      message: 'Department updated successfully.',
      department,
    };
  }

  async deleteDepartment(id: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const department = await transaction.department.findUnique({
          where: {
            id,
          },

          select: {
            id: true,
            code: true,
            name: true,

            division: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },

            _count: {
              select: {
                employees: true,
                accountRequests: true,
                managementPositions: true,
              },
            },
          },
        });

        if (!department) {
          throw new NotFoundException('Department was not found.');
        }

        const blockers: string[] = [];

        if (department._count.employees > 0) {
          blockers.push(`${department._count.employees} employee record(s)`);
        }

        if (department._count.accountRequests > 0) {
          blockers.push(
            `${department._count.accountRequests} account request record(s)`,
          );
        }

        if (department._count.managementPositions > 0) {
          blockers.push(
            `${department._count.managementPositions} management position record(s)`,
          );
        }

        // Used departments must be deactivated, not deleted.
        if (blockers.length > 0) {
          throw new ConflictException(
            `This department cannot be deleted because it has ${blockers.join(', ')}. Deactivate it instead.`,
          );
        }

        await transaction.department.delete({
          where: {
            id,
          },
        });

        return {
          message: 'Department deleted successfully.',

          deletedDepartment: {
            id: department.id,
            code: department.code,
            name: department.name,
            division: department.division,
          },
        };
      });
    } catch (error: unknown) {
      // Database constraints protect concurrent writes.
      if (this.isForeignKeyConstraintError(error)) {
        throw new ConflictException(
          'This department cannot be deleted because another record still uses it.',
        );
      }

      throw error;
    }
  }
}
