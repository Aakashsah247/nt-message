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
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import { AssignManagementPositionDto } from './dto/assign-management-position.dto';
import { CreateManagementPositionDto } from './dto/create-management-position.dto';
import { EndManagementAssignmentDto } from './dto/end-management-assignment.dto';
import {
  ListManagementPositionsQueryDto,
  ManagementPositionOccupancy,
} from './dto/list-management-positions-query.dto';
import { ReplaceManagementPositionDto } from './dto/replace-management-position.dto';

interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

interface PositionScope {
  id: string;
  positionType: ManagementPositionType;
  divisionId: string;
  departmentId: string | null;
  isActive: boolean;
}

@Injectable()
export class ManagementAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSuperAdmin(user: AuthenticatedUser): void {
    if (user.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can manage organizational positions.',
      );
    }
  }

  private normalizeReason(value: string, fieldName: string): string {
    const reason = value.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        `${fieldName} must contain at least 3 characters.`,
      );
    }

    return reason;
  }

  private parseEffectiveDate(
    value: string | undefined,
    fieldName: string,
  ): Date {
    const now = new Date();
    const date = value ? new Date(value) : now;

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    if (date.getTime() > now.getTime()) {
      throw new BadRequestException(`${fieldName} cannot be in the future.`);
    }

    return date;
  }

  private getRequiredRole(positionType: ManagementPositionType): AccountRole {
    switch (positionType) {
      case ManagementPositionType.SENIOR_MANAGEMENT:
        return AccountRole.SENIOR_MANAGEMENT;

      case ManagementPositionType.TEAM_MANAGER:
        return AccountRole.TEAM_MANAGER;

      default:
        throw new BadRequestException(
          'The management position type is unsupported.',
        );
    }
  }

  private async getAssignableEmployee(
    transaction: Prisma.TransactionClient,
    employeeId: string,
    position: PositionScope,
  ) {
    const employee = await transaction.employee.findUnique({
      where: {
        id: employeeId,
      },

      select: {
        id: true,
        empId: true,
        empName: true,
        officialEmail: true,
        divisionId: true,
        departmentId: true,
        designation: true,
        status: true,
        employmentStatus: true,
        archivedAt: true,
        isActivated: true,

        account: {
          select: {
            id: true,
            role: true,
            isEnabled: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('The selected employee was not found.');
    }

    if (
      employee.status !== EmployeeStatus.ACTIVE ||
      employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      employee.archivedAt
    ) {
      throw new ConflictException(
        'Only a current active employee can hold a management position.',
      );
    }

    if (
      !employee.isActivated ||
      !employee.account ||
      !employee.account.isEnabled
    ) {
      throw new ConflictException(
        'The employee must have an active, activated account.',
      );
    }

    const requiredRole = this.getRequiredRole(position.positionType);

    if (employee.account.role !== requiredRole) {
      throw new ConflictException(
        `The employee must have the ${requiredRole.toLowerCase().replaceAll('_', ' ')} role before assignment.`,
      );
    }

    if (employee.divisionId !== position.divisionId) {
      throw new ConflictException(
        'The employee is not assigned to the position division.',
      );
    }

    if (
      position.positionType === ManagementPositionType.TEAM_MANAGER &&
      employee.departmentId !== position.departmentId
    ) {
      throw new ConflictException(
        'The employee is not assigned to the position department.',
      );
    }

    const currentAssignment = await transaction.managementAssignment.findFirst({
      where: {
        employeeId: employee.id,
        endedAt: null,
      },

      select: {
        id: true,
        positionId: true,
      },
    });

    if (currentAssignment) {
      throw new ConflictException(
        'The employee already holds an active management position.',
      );
    }

    return employee;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  async createPosition(
    user: AuthenticatedUser,
    dto: CreateManagementPositionDto,
  ) {
    this.assertSuperAdmin(user);

    try {
      const position = await this.prisma.$transaction(async (transaction) => {
        const division = await transaction.division.findUnique({
          where: {
            id: dto.divisionId,
          },

          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        });

        if (!division) {
          throw new NotFoundException('Division was not found.');
        }

        if (!division.isActive) {
          throw new ConflictException(
            'A management position cannot be created in an inactive division.',
          );
        }

        let department: {
          id: string;
          divisionId: string;
          code: string;
          name: string;
          isActive: boolean;
        } | null = null;

        if (dto.positionType === ManagementPositionType.SENIOR_MANAGEMENT) {
          if (dto.departmentId) {
            throw new BadRequestException(
              'A Senior Management position belongs to a division and must not have a department.',
            );
          }
        } else {
          if (!dto.departmentId) {
            throw new BadRequestException(
              'A Team Manager position requires a department.',
            );
          }

          department = await transaction.department.findUnique({
            where: {
              id: dto.departmentId,
            },

            select: {
              id: true,
              divisionId: true,
              code: true,
              name: true,
              isActive: true,
            },
          });

          if (!department) {
            throw new NotFoundException('Department was not found.');
          }

          if (!department.isActive) {
            throw new ConflictException(
              'A management position cannot be created in an inactive department.',
            );
          }

          if (department.divisionId !== division.id) {
            throw new BadRequestException(
              'The selected department does not belong to the selected division.',
            );
          }
        }

        const existingPosition = await transaction.managementPosition.findFirst(
          {
            where: {
              positionType: dto.positionType,

              divisionId: division.id,

              departmentId: department?.id ?? null,
            },

            select: {
              id: true,
              isActive: true,
            },
          },
        );

        // One official management position is allowed per scope.
        if (existingPosition) {
          throw new ConflictException(
            existingPosition.isActive
              ? 'This management position already exists.'
              : 'This management position already exists but is inactive. Reactivate it instead of creating a duplicate.',
          );
        }

        return transaction.managementPosition.create({
          data: {
            positionType: dto.positionType,

            divisionId: division.id,

            departmentId: department?.id ?? null,

            isActive: true,
          },

          select: {
            id: true,
            positionType: true,
            divisionId: true,
            departmentId: true,
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

            department: {
              select: {
                id: true,
                code: true,
                name: true,
                isActive: true,
              },
            },
          },
        });
      });

      return {
        message: 'Management position created successfully.',

        position: {
          ...position,
          occupancy: 'VACANT',
          currentAssignment: null,
        },
      };
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('This management position already exists.');
      }

      throw error;
    }
  }

  async listPositions(
    user: AuthenticatedUser,
    query: ListManagementPositionsQueryDto,
  ) {
    this.assertSuperAdmin(user);

    const where: Prisma.ManagementPositionWhereInput = {
      ...(query.positionType
        ? {
            positionType: query.positionType,
          }
        : {}),

      ...(query.divisionId
        ? {
            divisionId: query.divisionId,
          }
        : {}),

      ...(query.departmentId
        ? {
            departmentId: query.departmentId,
          }
        : {}),
    };

    if (query.occupancy === ManagementPositionOccupancy.VACANT) {
      where.isActive = true;

      where.reservedByAccountRequestId = null;

      where.assignments = {
        none: {
          endedAt: null,
        },
      };
    }

    if (query.occupancy === ManagementPositionOccupancy.RESERVED) {
      where.isActive = true;

      where.reservedByAccountRequestId = {
        not: null,
      };

      where.assignments = {
        none: {
          endedAt: null,
        },
      };
    }

    if (query.occupancy === ManagementPositionOccupancy.OCCUPIED) {
      where.isActive = true;

      where.assignments = {
        some: {
          endedAt: null,
        },
      };
    }

    if (query.occupancy === ManagementPositionOccupancy.INACTIVE) {
      where.isActive = false;
    }

    const positions = await this.prisma.managementPosition.findMany({
      where,

      orderBy: [
        {
          positionType: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],

      select: {
        id: true,
        positionType: true,
        divisionId: true,
        departmentId: true,
        isActive: true,
        reservedByAccountRequestId: true,
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

        department: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },

        reservedByAccountRequest: {
          select: {
            id: true,
            empId: true,
            empName: true,
            requestedRole: true,
            status: true,
            submittedAt: true,
            reviewedAt: true,
          },
        },

        assignments: {
          where: {
            endedAt: null,
          },

          take: 1,

          orderBy: {
            startedAt: 'desc',
          },

          select: {
            id: true,
            startedAt: true,
            assignmentReason: true,

            employee: {
              select: {
                id: true,
                empId: true,
                empName: true,
                officialEmail: true,
                designation: true,

                account: {
                  select: {
                    role: true,
                    isEnabled: true,
                  },
                },
              },
            },
          },
        },

        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    return {
      data: positions.map(({ assignments, ...position }) => {
        const currentAssignment = assignments[0] ?? null;

        const occupancy = !position.isActive
          ? 'INACTIVE'
          : currentAssignment
            ? 'OCCUPIED'
            : position.reservedByAccountRequestId
              ? 'RESERVED'
              : 'VACANT';

        return {
          ...position,

          occupancy,

          currentAssignment,
        };
      }),

      filters: {
        positionType: query.positionType ?? null,

        divisionId: query.divisionId ?? null,

        departmentId: query.departmentId ?? null,

        occupancy: query.occupancy,
      },
    };
  }

  async getPosition(user: AuthenticatedUser, id: string) {
    this.assertSuperAdmin(user);

    const position = await this.prisma.managementPosition.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        positionType: true,
        divisionId: true,
        departmentId: true,
        isActive: true,
        reservedByAccountRequestId: true,
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

        department: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },

        reservedByAccountRequest: {
          select: {
            id: true,
            empId: true,
            empName: true,
            requestedRole: true,
            status: true,
            submittedAt: true,
            reviewedAt: true,
          },
        },

        assignments: {
          orderBy: {
            startedAt: 'desc',
          },

          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            assignmentReason: true,
            endReason: true,
            createdAt: true,
            updatedAt: true,

            employee: {
              select: {
                id: true,
                empId: true,
                empName: true,
                officialEmail: true,
                designation: true,
                status: true,
                employmentStatus: true,

                account: {
                  select: {
                    role: true,
                    isEnabled: true,
                  },
                },
              },
            },

            assignedBy: {
              select: {
                id: true,
                username: true,
                role: true,

                employee: {
                  select: {
                    empId: true,
                    empName: true,
                  },
                },
              },
            },

            endedBy: {
              select: {
                id: true,
                username: true,
                role: true,

                employee: {
                  select: {
                    empId: true,
                    empName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!position) {
      throw new NotFoundException('Management position was not found.');
    }

    const currentAssignment =
      position.assignments.find((assignment) => assignment.endedAt === null) ??
      null;

    const occupancy = !position.isActive
      ? 'INACTIVE'
      : currentAssignment
        ? 'OCCUPIED'
        : position.reservedByAccountRequestId
          ? 'RESERVED'
          : 'VACANT';

    return {
      position: {
        ...position,

        occupancy,

        currentAssignment,
      },
    };
  }

  async assignPosition(
    user: AuthenticatedUser,
    positionId: string,
    dto: AssignManagementPositionDto,
    metadata: RequestMetadata,
  ) {
    this.assertSuperAdmin(user);

    const reason = this.normalizeReason(dto.reason, 'Assignment reason');

    const startedAt = this.parseEffectiveDate(
      dto.startedAt,
      'Assignment start date',
    );

    const ipAddress = metadata.ipAddress?.slice(0, 45) ?? null;

    const userAgent = metadata.userAgent?.slice(0, 500) ?? null;

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const position = await transaction.managementPosition.findUnique({
          where: {
            id: positionId,
          },

          select: {
            id: true,
            positionType: true,
            divisionId: true,
            departmentId: true,
            isActive: true,
          },
        });

        if (!position) {
          throw new NotFoundException('Management position was not found.');
        }

        if (!position.isActive) {
          throw new ConflictException(
            'An inactive management position cannot receive an assignment.',
          );
        }

        const currentAssignment =
          await transaction.managementAssignment.findFirst({
            where: {
              positionId: position.id,

              endedAt: null,
            },

            select: {
              id: true,
            },
          });

        if (currentAssignment) {
          throw new ConflictException(
            'This management position is already occupied.',
          );
        }

        const employee = await this.getAssignableEmployee(
          transaction,
          dto.employeeId,
          position,
        );

        const assignment = await transaction.managementAssignment.create({
          data: {
            positionId: position.id,

            employeeId: employee.id,

            assignedByAccountId: user.accountId,

            startedAt,

            assignmentReason: reason,
          },

          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            assignmentReason: true,

            employee: {
              select: {
                id: true,
                empId: true,
                empName: true,
                officialEmail: true,
                designation: true,
              },
            },

            position: {
              select: {
                id: true,
                positionType: true,
                divisionId: true,
                departmentId: true,

                division: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },

                department: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        });

        const revokedSessions = await transaction.authSession.updateMany({
          where: {
            accountId: employee.account!.id,

            revokedAt: null,
          },

          data: {
            revokedAt: new Date(),
          },
        });

        return {
          assignment,
          revokedSessions: revokedSessions.count,
        };
      });

      return {
        message: 'Employee assigned to management position successfully.',

        assignment: result.assignment,

        revokedSessions: result.revokedSessions,

        audit: {
          ipAddress,
          userAgent,
        },
      };
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'The position or employee already has an active management assignment.',
        );
      }

      throw error;
    }
  }

  async endCurrentAssignment(
    user: AuthenticatedUser,
    positionId: string,
    dto: EndManagementAssignmentDto,
    metadata: RequestMetadata,
  ) {
    this.assertSuperAdmin(user);

    const reason = this.normalizeReason(dto.reason, 'Assignment end reason');

    const effectiveAt = this.parseEffectiveDate(
      dto.effectiveAt,
      'Assignment end date',
    );

    const result = await this.prisma.$transaction(async (transaction) => {
      const assignment = await transaction.managementAssignment.findFirst({
        where: {
          positionId,
          endedAt: null,
        },

        select: {
          id: true,
          employeeId: true,
          startedAt: true,

          employee: {
            select: {
              account: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!assignment) {
        throw new NotFoundException(
          'This management position does not have a current assignment.',
        );
      }

      if (effectiveAt.getTime() < assignment.startedAt.getTime()) {
        throw new BadRequestException(
          'Assignment end date cannot be before its start date.',
        );
      }

      const claim = await transaction.managementAssignment.updateMany({
        where: {
          id: assignment.id,
          endedAt: null,
        },

        data: {
          endedAt: effectiveAt,

          endedByAccountId: user.accountId,

          endReason: reason,
        },
      });

      if (claim.count !== 1) {
        throw new ConflictException(
          'This management assignment has already ended.',
        );
      }

      let revokedSessions = 0;

      if (assignment.employee.account) {
        const revoked = await transaction.authSession.updateMany({
          where: {
            accountId: assignment.employee.account.id,

            revokedAt: null,
          },

          data: {
            revokedAt: new Date(),
          },
        });

        revokedSessions = revoked.count;
      }

      const endedAssignment =
        await transaction.managementAssignment.findUniqueOrThrow({
          where: {
            id: assignment.id,
          },

          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            assignmentReason: true,
            endReason: true,

            employee: {
              select: {
                id: true,
                empId: true,
                empName: true,
                officialEmail: true,
              },
            },

            position: {
              select: {
                id: true,
                positionType: true,
                divisionId: true,
                departmentId: true,
              },
            },
          },
        });

      return {
        assignment: endedAssignment,

        revokedSessions,
      };
    });

    return {
      message: 'Management assignment ended. The position is now vacant.',

      assignment: result.assignment,

      revokedSessions: result.revokedSessions,

      audit: {
        ipAddress: metadata.ipAddress?.slice(0, 45) ?? null,

        userAgent: metadata.userAgent?.slice(0, 500) ?? null,
      },
    };
  }

  async replacePositionHolder(
    user: AuthenticatedUser,
    positionId: string,
    dto: ReplaceManagementPositionDto,
    metadata: RequestMetadata,
  ) {
    this.assertSuperAdmin(user);

    const replacementReason = this.normalizeReason(
      dto.reason,
      'Replacement reason',
    );

    const assignmentReason = dto.assignmentReason
      ? this.normalizeReason(dto.assignmentReason, 'New assignment reason')
      : replacementReason;

    const effectiveAt = this.parseEffectiveDate(
      dto.effectiveAt,
      'Replacement effective date',
    );

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const position = await transaction.managementPosition.findUnique({
          where: {
            id: positionId,
          },

          select: {
            id: true,
            positionType: true,
            divisionId: true,
            departmentId: true,
            isActive: true,
          },
        });

        if (!position) {
          throw new NotFoundException('Management position was not found.');
        }

        if (!position.isActive) {
          throw new ConflictException(
            'An inactive management position cannot be replaced.',
          );
        }

        const currentAssignment =
          await transaction.managementAssignment.findFirst({
            where: {
              positionId: position.id,

              endedAt: null,
            },

            select: {
              id: true,
              employeeId: true,
              startedAt: true,

              employee: {
                select: {
                  account: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          });

        if (!currentAssignment) {
          throw new ConflictException(
            'The position is vacant. Use the assignment action instead.',
          );
        }

        if (currentAssignment.employeeId === dto.newEmployeeId) {
          throw new ConflictException(
            'The selected employee already holds this position.',
          );
        }

        if (effectiveAt.getTime() < currentAssignment.startedAt.getTime()) {
          throw new BadRequestException(
            'Replacement date cannot be before the current assignment start date.',
          );
        }

        const newEmployee = await this.getAssignableEmployee(
          transaction,
          dto.newEmployeeId,
          position,
        );

        const endClaim = await transaction.managementAssignment.updateMany({
          where: {
            id: currentAssignment.id,

            endedAt: null,
          },

          data: {
            endedAt: effectiveAt,

            endedByAccountId: user.accountId,

            endReason: replacementReason,
          },
        });

        if (endClaim.count !== 1) {
          throw new ConflictException(
            'The current assignment has already changed.',
          );
        }

        const newAssignment = await transaction.managementAssignment.create({
          data: {
            positionId: position.id,

            employeeId: newEmployee.id,

            assignedByAccountId: user.accountId,

            startedAt: effectiveAt,

            assignmentReason,
          },

          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            assignmentReason: true,

            employee: {
              select: {
                id: true,
                empId: true,
                empName: true,
                officialEmail: true,
                designation: true,
              },
            },

            position: {
              select: {
                id: true,
                positionType: true,
                divisionId: true,
                departmentId: true,
              },
            },
          },
        });

        const accountIds = [
          currentAssignment.employee.account?.id,

          newEmployee.account!.id,
        ].filter((accountId): accountId is string => Boolean(accountId));

        const revokedSessions =
          accountIds.length > 0
            ? await transaction.authSession.updateMany({
                where: {
                  accountId: {
                    in: accountIds,
                  },

                  revokedAt: null,
                },

                data: {
                  revokedAt: new Date(),
                },
              })
            : {
                count: 0,
              };

        return {
          previousAssignmentId: currentAssignment.id,

          newAssignment,

          revokedSessions: revokedSessions.count,
        };
      });

      return {
        message: 'Management position holder replaced successfully.',

        previousAssignmentId: result.previousAssignmentId,

        assignment: result.newAssignment,

        revokedSessions: result.revokedSessions,

        audit: {
          ipAddress: metadata.ipAddress?.slice(0, 45) ?? null,

          userAgent: metadata.userAgent?.slice(0, 500) ?? null,
        },
      };
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'The replacement employee or position already has an active management assignment.',
        );
      }

      throw error;
    }
  }
}
