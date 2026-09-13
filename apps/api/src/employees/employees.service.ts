import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  normalizeAccountIdentity,
  normalizeOfficialEmailForLookup,
} from '../common/normalization/account-identity-normalization';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  EmployeeLifecycleActionType,
  EmployeeStatus,
  EmploymentStatus,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import { ArchiveEmployeeDto } from './dto/archive-employee.dto';
import { EndEmployeeEmploymentDto } from './dto/end-employee-employment.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

interface EmployeeLifecycleMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
  ) {}

  private async synchronizeOfficialGroups(
    accountId: string | null | undefined,
    actorAccountId: string | null,
    reason: string,
  ): Promise<void> {
    await this.conversationsService.synchronizeOfficialGroupsForAccountSafely(
      accountId,
      actorAccountId,
      reason,
    );
  }

  async listEmployees(query: ListEmployeesQueryDto) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const search = query.search?.trim();

    const where: Prisma.EmployeeWhereInput = {
      ...(query.status
        ? {
            status: query.status,
          }
        : {}),



      ...(search
        ? {
            OR: [
              {
                empId: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                empName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                officialEmail: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                designation: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [employees, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,

        orderBy: {
          createdAt: 'desc',
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          phoneNumber: true,
          officialEmail: true,
          designation: true,
          status: true,
          isActivated: true,
          // Directory avatars need this key so the frontend can fetch protected photos.
          profilePhotoKey: true,
          createdAt: true,
          updatedAt: true,

        },
      }),

      this.prisma.employee.count({
        where,
      }),
    ]);

    return {
      data: employees,

      pagination: {
        page,
        limit,
        total,

        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async getEmployeeById(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        empId: true,
        empName: true,
        phoneNumber: true,
        officialEmail: true,
        designation: true,
        status: true,
        isActivated: true,
        profilePhotoKey: true,
        createdAt: true,
        updatedAt: true,


        account: {
          select: {
            id: true,
            username: true,
            role: true,
            isEnabled: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    return {
      employee,
    };
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto) {
    if (
      dto.empId !== undefined ||
      dto.empName !== undefined ||
      dto.phoneNumber !== undefined ||
      dto.officialEmail !== undefined
    ) {
      throw new ForbiddenException(
        'Protected identity fields must be changed through the protected identity correction workflow.',
      );
    }


    if (dto.designation === undefined) {
      throw new BadRequestException(
        'Provide a designation update, or use the dedicated identity or organization workflow.',
      );
    }

    const designation = dto.designation.trim() || null;

    const employee = await this.prisma.employee.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        designation: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    if (employee.designation === designation) {
      throw new ConflictException(
        'The employee already has the supplied designation.',
      );
    }

    const updatedEmployee = await this.prisma.employee.update({
      where: {
        id,
      },
      data: {
        designation,
      },
      select: {
        id: true,
        empId: true,
        empName: true,
        phoneNumber: true,
        officialEmail: true,
        designation: true,
        status: true,
        isActivated: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Employee designation updated successfully.',
      employee: updatedEmployee,
    };
  }

  async getEmployeeLifecycleHistory(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id,
      },

      select: {
        id: true,
        empId: true,
        empName: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    const actions = await this.prisma.employeeLifecycleAction.findMany({
      where: {
        employeeId: id,
      },

      orderBy: {
        createdAt: 'desc',
      },

      select: {
        id: true,
        action: true,

        previousEmployeeStatus: true,

        newEmployeeStatus: true,

        previousEmploymentStatus: true,

        newEmploymentStatus: true,

        reason: true,
        effectiveAt: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        createdAt: true,

        actor: {
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
    });

    return {
      employee,
      data: actions,
    };
  }

  async archiveEmployee(
    user: AuthenticatedUser,
    id: string,
    dto: ArchiveEmployeeDto,
    metadata: EmployeeLifecycleMetadata,
  ) {
    if (user.accountClass !== AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can archive an employee record.',
      );
    }

    const reason = dto.reason.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'Archive reason must contain at least 3 characters.',
      );
    }

    const now = new Date();

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const result = await this.prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          status: true,
          employmentStatus: true,
          archivedAt: true,

          account: {
            select: {
              id: true,
              role: true,
              accountClass: true,
              isEnabled: true,
            },
          },
        },
      });

      if (!employee) {
        throw new NotFoundException('Employee was not found.');
      }

      if (employee.account?.accountClass === AccountClass.SUPER_ADMIN) {
        throw new ForbiddenException(
          'The Super Admin record cannot be archived.',
        );
      }

      if (employee.employmentStatus === EmploymentStatus.ACTIVE) {
        throw new ConflictException(
          'Active employees cannot be archived. End employment first.',
        );
      }

      if (employee.archivedAt) {
        throw new ConflictException(
          'This employee record is already archived.',
        );
      }

      let revokedSessions = 0;

      if (employee.account) {
        await transaction.account.update({
          where: {
            id: employee.account.id,
          },

          data: {
            isEnabled: false,
          },
        });

        const sessionResult = await transaction.authSession.updateMany({
          where: {
            accountId: employee.account.id,

            revokedAt: null,
          },

          data: {
            revokedAt: now,
          },
        });

        revokedSessions = sessionResult.count;
      }

      /*
       * Archived records remain stored for
       * audit, messages and historical reporting.
       */
      const updatedEmployee = await transaction.employee.update({
        where: {
          id: employee.id,
        },

        data: {
          status: EmployeeStatus.INACTIVE,

          archivedAt: now,
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          status: true,
          employmentStatus: true,
          employmentEndedAt: true,
          employmentEndReason: true,
          archivedAt: true,
          isActivated: true,
          updatedAt: true,

          account: {
            select: {
              id: true,
              role: true,
              accountClass: true,
              isEnabled: true,
            },
          },
        },
      });

      await transaction.employeeLifecycleAction.create({
        data: {
          employeeId: employee.id,

          actorAccountId: user.accountId,

          action: EmployeeLifecycleActionType.ARCHIVED,

          previousEmployeeStatus: employee.status,

          newEmployeeStatus: EmployeeStatus.INACTIVE,

          previousEmploymentStatus: employee.employmentStatus,

          newEmploymentStatus: employee.employmentStatus,

          reason,

          effectiveAt: now,

          ipAddress,

          userAgent,

          metadata: {
            accountId: employee.account?.id ?? null,

            accountRole: employee.account?.role ?? null,

            revokedSessions,
          },
        },
      });

      return {
        employee: updatedEmployee,

        revokedSessions,
      };
    });

    await this.synchronizeOfficialGroups(
      result.employee.account?.id,
      user.accountId,
      'EMPLOYEE_ARCHIVED',
    );

    return {
      message: 'Former employee record archived successfully.',

      employee: result.employee,

      revokedSessions: result.revokedSessions,
    };
  }

  async endEmployeeEmployment(
    user: AuthenticatedUser,
    id: string,
    dto: EndEmployeeEmploymentDto,
    metadata: EmployeeLifecycleMetadata,
  ) {
    if (user.accountClass !== AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can end an employee employment record.',
      );
    }

    const reason = dto.reason.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'Employment end reason must contain at least 3 characters.',
      );
    }

    const now = new Date();

    const effectiveAt = dto.effectiveAt ? new Date(dto.effectiveAt) : now;

    if (Number.isNaN(effectiveAt.getTime())) {
      throw new BadRequestException('Employment effective date is invalid.');
    }

    if (effectiveAt.getTime() > now.getTime()) {
      throw new BadRequestException(
        'Employment end date cannot be in the future.',
      );
    }

    let lifecycleAction: EmployeeLifecycleActionType;

    switch (dto.employmentStatus) {
      case EmploymentStatus.RESIGNED:
        lifecycleAction = EmployeeLifecycleActionType.RESIGNED;
        break;

      case EmploymentStatus.RETIRED:
        lifecycleAction = EmployeeLifecycleActionType.RETIRED;
        break;

      case EmploymentStatus.TERMINATED:
        lifecycleAction = EmployeeLifecycleActionType.TERMINATED;
        break;

      case EmploymentStatus.TRANSFERRED:
        // A transfer means the employee has left Patan Branch.
        lifecycleAction = EmployeeLifecycleActionType.TRANSFERRED;
        break;

      default:
        throw new BadRequestException(
          'Employment status must be resigned, retired, terminated or transferred.',
        );
    }

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const result = await this.prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          status: true,
          employmentStatus: true,
          archivedAt: true,

          account: {
            select: {
              id: true,
              role: true,
              accountClass: true,
              isEnabled: true,
            },
          },
        },
      });

      if (!employee) {
        throw new NotFoundException('Employee was not found.');
      }

      if (employee.account?.accountClass === AccountClass.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Super Admin employment cannot be ended through this process.',
        );
      }

      if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
        throw new ConflictException(
          'This employee employment record has already ended.',
        );
      }

      if (employee.archivedAt) {
        throw new ConflictException(
          'An archived employee cannot be processed again.',
        );
      }

      const updatedEmployee = await transaction.employee.update({
        where: {
          id: employee.id,
        },

        data: {
          status: EmployeeStatus.INACTIVE,

          employmentStatus: dto.employmentStatus,

          employmentEndedAt: effectiveAt,

          employmentEndReason: reason,
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          status: true,
          employmentStatus: true,
          employmentEndedAt: true,
          employmentEndReason: true,
          archivedAt: true,
          isActivated: true,
          updatedAt: true,

          account: {
            select: {
              id: true,
              role: true,
              accountClass: true,
              isEnabled: true,
            },
          },
        },
      });

      let revokedSessions = 0;

      if (employee.account) {
        await transaction.account.update({
          where: {
            id: employee.account.id,
          },

          data: {
            isEnabled: false,
          },
        });

        const sessionResult = await transaction.authSession.updateMany({
          where: {
            accountId: employee.account.id,

            revokedAt: null,
          },

          data: {
            revokedAt: now,
          },
        });

        revokedSessions = sessionResult.count;
      }

      await transaction.employeeLifecycleAction.create({
        data: {
          employeeId: employee.id,

          actorAccountId: user.accountId,

          action: lifecycleAction,

          previousEmployeeStatus: employee.status,

          newEmployeeStatus: EmployeeStatus.INACTIVE,

          previousEmploymentStatus: employee.employmentStatus,

          newEmploymentStatus: dto.employmentStatus,

          reason,

          effectiveAt,

          ipAddress,

          userAgent,

          metadata: {
            accountId: employee.account?.id ?? null,

            accountRole: employee.account?.role ?? null,

            revokedSessions,
          },
        },
      });

      return {
        employee: updatedEmployee,

        revokedSessions,
      };
    });

    await this.synchronizeOfficialGroups(
      result.employee.account?.id,
      user.accountId,
      'EMPLOYMENT_ENDED',
    );

    return {
      message: `Employee employment marked as ${dto.employmentStatus.toLowerCase()} successfully.`,

      employee: result.employee,

      revokedSessions: result.revokedSessions,
    };
  }

  async updateEmployeeStatus(
    user: AuthenticatedUser,
    id: string,
    status: EmployeeStatus,
    metadata: EmployeeLifecycleMetadata,
  ) {
    if (user.accountClass !== AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can change employee access status.',
      );
    }

    const now = new Date();

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const result = await this.prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          status: true,
          employmentStatus: true,
          archivedAt: true,

          account: {
            select: {
              id: true,
              role: true,
              accountClass: true,
              isEnabled: true,
            },
          },
        },
      });

      if (!employee) {
        throw new NotFoundException('Employee was not found.');
      }

      if (employee.account?.accountClass === AccountClass.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Super Admin status cannot be changed through this process.',
        );
      }

      /*
       * Temporary suspension is allowed only
       * while employment remains active.
       */
      if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
        throw new ConflictException(
          'Employment has ended. Access status cannot be changed.',
        );
      }

      if (employee.archivedAt) {
        throw new ConflictException('An archived account cannot be changed.');
      }

      if (employee.status === status) {
        throw new ConflictException(
          status === EmployeeStatus.ACTIVE
            ? 'The employee account is already active.'
            : 'The employee account is already suspended.',
        );
      }

      const updatedEmployee = await transaction.employee.update({
        where: {
          id,
        },

        data: {
          status,
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          status: true,
          employmentStatus: true,
          isActivated: true,
          updatedAt: true,
        },
      });

      let revokedSessions = 0;

      if (employee.account) {
        await transaction.account.update({
          where: {
            id: employee.account.id,
          },

          data: {
            isEnabled: status === EmployeeStatus.ACTIVE,
          },
        });

        if (status === EmployeeStatus.INACTIVE) {
          const sessionResult = await transaction.authSession.updateMany({
            where: {
              accountId: employee.account.id,

              revokedAt: null,
            },

            data: {
              revokedAt: now,
            },
          });

          revokedSessions = sessionResult.count;
        }
      }

      const lifecycleAction =
        status === EmployeeStatus.ACTIVE
          ? EmployeeLifecycleActionType.REACTIVATED
          : EmployeeLifecycleActionType.SUSPENDED;

      await transaction.employeeLifecycleAction.create({
        data: {
          employeeId: employee.id,

          actorAccountId: user.accountId,

          action: lifecycleAction,

          previousEmployeeStatus: employee.status,

          newEmployeeStatus: status,

          previousEmploymentStatus: employee.employmentStatus,

          newEmploymentStatus: employee.employmentStatus,

          effectiveAt: now,

          ipAddress,

          userAgent,

          metadata: {
            accountId: employee.account?.id ?? null,

            accountRole: employee.account?.role ?? null,

            revokedSessions,
          },
        },
      });

      return {
        employee: updatedEmployee,

        accountId: employee.account?.id ?? null,

        revokedSessions,
      };
    });

    await this.synchronizeOfficialGroups(
      result.accountId,
      user.accountId,
      status === EmployeeStatus.ACTIVE
        ? 'EMPLOYEE_REACTIVATED'
        : 'EMPLOYEE_SUSPENDED',
    );

    return {
      message:
        status === EmployeeStatus.ACTIVE
          ? 'Employee reactivated successfully.'
          : 'Employee suspended successfully.',

      employee: result.employee,

      revokedSessions: result.revokedSessions,
    };
  }
}
