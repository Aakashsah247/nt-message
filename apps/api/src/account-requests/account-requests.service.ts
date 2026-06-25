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
  AccountRequestActionType,
  AccountRequestStatus,
  AccountRole,
  EmployeeStatus,
  ManagementPositionType,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import { CreateAccountRequestDto } from './dto/create-account-request.dto';
import { ListAccountRequestsQueryDto } from './dto/list-account-requests-query.dto';
import { ResubmitAccountRequestDto } from './dto/resubmit-account-request.dto';

interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class AccountRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSuperAdmin(user: AuthenticatedUser) {
    if (user.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can review account requests.',
      );
    }
  }

  private async getRequester(user: AuthenticatedUser) {
    const requester = await this.prisma.account.findUnique({
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

            managementAssignments: {
              where: {
                endedAt: null,

                position: {
                  is: {
                    isActive: true,
                  },
                },
              },

              take: 1,

              orderBy: {
                startedAt: 'desc',
              },

              select: {
                id: true,
                startedAt: true,

                position: {
                  select: {
                    id: true,
                    positionType: true,
                    divisionId: true,
                    departmentId: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!requester || !requester.isEnabled || requester.role !== user.role) {
      throw new ForbiddenException(
        'Your authenticated account cannot submit account requests.',
      );
    }

    if (
      requester.role !== AccountRole.SENIOR_MANAGEMENT &&
      requester.role !== AccountRole.TEAM_MANAGER
    ) {
      throw new ForbiddenException('Your role cannot submit account requests.');
    }

    if (
      !requester.employee ||
      requester.employee.status !== EmployeeStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        'Your account does not have an active employee identity.',
      );
    }

    const activeManagementAssignment =
      requester.employee.managementAssignments[0] ?? null;

    if (!activeManagementAssignment) {
      throw new ForbiddenException(
        'Your management role does not have an active position assignment.',
      );
    }

    const position = activeManagementAssignment.position;

    if (requester.role === AccountRole.SENIOR_MANAGEMENT) {
      if (
        position.positionType !== ManagementPositionType.SENIOR_MANAGEMENT ||
        position.divisionId !== requester.employee.divisionId ||
        position.departmentId !== null
      ) {
        throw new ForbiddenException(
          'Your Senior Management position assignment is invalid.',
        );
      }
    }

    if (requester.role === AccountRole.TEAM_MANAGER) {
      if (
        position.positionType !== ManagementPositionType.TEAM_MANAGER ||
        position.divisionId !== requester.employee.divisionId ||
        position.departmentId !== requester.employee.departmentId
      ) {
        throw new ForbiddenException(
          'Your Team Manager position assignment is invalid.',
        );
      }
    }

    return requester;
  }

  private async validateManagementPositionVacancy(
    transaction: Prisma.TransactionClient,
    managementPositionId: string,
    requestedRole: AccountRole,
    divisionId: string,
    departmentId: string | null,
  ) {
    const requiredPositionType =
      requestedRole === AccountRole.SENIOR_MANAGEMENT
        ? ManagementPositionType.SENIOR_MANAGEMENT
        : requestedRole === AccountRole.TEAM_MANAGER
          ? ManagementPositionType.TEAM_MANAGER
          : null;

    if (!requiredPositionType) {
      throw new BadRequestException(
        'A normal employee request must not reference a management position.',
      );
    }

    const position = await transaction.managementPosition.findUnique({
      where: {
        id: managementPositionId,
      },

      select: {
        id: true,
        positionType: true,
        divisionId: true,
        departmentId: true,
        isActive: true,
        reservedByAccountRequestId: true,

        assignments: {
          where: {
            endedAt: null,
          },

          take: 1,

          select: {
            id: true,
          },
        },
      },
    });

    if (!position) {
      throw new NotFoundException(
        'No active management position exists for the selected organization scope.',
      );
    }

    if (position.positionType !== requiredPositionType) {
      throw new BadRequestException(
        'The selected management position does not match the requested role.',
      );
    }

    if (position.divisionId !== divisionId) {
      throw new BadRequestException(
        'The selected management position does not belong to the selected division.',
      );
    }

    if (
      requiredPositionType === ManagementPositionType.SENIOR_MANAGEMENT &&
      position.departmentId !== null
    ) {
      throw new BadRequestException(
        'The selected Senior Management position has an invalid organization scope.',
      );
    }

    if (
      requiredPositionType === ManagementPositionType.TEAM_MANAGER &&
      position.departmentId !== departmentId
    ) {
      throw new BadRequestException(
        'The selected Team Manager position does not belong to the selected department.',
      );
    }

    if (!position.isActive) {
      throw new ConflictException(
        'The selected management position is inactive.',
      );
    }

    if (position.reservedByAccountRequestId) {
      throw new ConflictException(
        'The selected management position is already reserved for another approved account request.',
      );
    }

    if (position.assignments.length > 0) {
      throw new ConflictException(
        'The selected management position is not vacant.',
      );
    }

    return position;
  }

  private async resolveManagementPositionId(
    transaction: Prisma.TransactionClient,
    suppliedManagementPositionId: string | null,
    requestedRole: AccountRole,
    divisionId: string,
    departmentId: string | null,
  ): Promise<string> {
    const requiredPositionType =
      requestedRole === AccountRole.SENIOR_MANAGEMENT
        ? ManagementPositionType.SENIOR_MANAGEMENT
        : requestedRole === AccountRole.TEAM_MANAGER
          ? ManagementPositionType.TEAM_MANAGER
          : null;

    if (!requiredPositionType) {
      throw new BadRequestException(
        'A normal employee request must not reference a management position.',
      );
    }

    if (suppliedManagementPositionId) {
      const selectedPosition =
        await this.validateManagementPositionVacancy(
          transaction,
          suppliedManagementPositionId,
          requestedRole,
          divisionId,
          departmentId,
        );

      return selectedPosition.id;
    }

    /*
     * Official positions are unique by division or department.
     * This fallback keeps existing clients compatible while still
     * storing the exact position ID on every management request.
     */
    const officialPosition =
      await transaction.managementPosition.findFirst({
        where: {
          positionType: requiredPositionType,
          divisionId,

          departmentId:
            requiredPositionType ===
            ManagementPositionType.SENIOR_MANAGEMENT
              ? null
              : departmentId,
        },

        select: {
          id: true,
        },
      });

    if (!officialPosition) {
      throw new NotFoundException(
        'No active management position exists for the selected organization scope.',
      );
    }

    const validatedPosition =
      await this.validateManagementPositionVacancy(
        transaction,
        officialPosition.id,
        requestedRole,
        divisionId,
        departmentId,
      );

    return validatedPosition.id;
  }

  async getRequestContext(user: AuthenticatedUser) {
    const requester = await this.getRequester(user);

    const employee = requester.employee;

    if (!employee) {
      throw new ForbiddenException(
        'Your account does not have an active employee identity.',
      );
    }

    if (requester.role === AccountRole.SENIOR_MANAGEMENT) {
      if (
        !employee.divisionId ||
        !employee.division ||
        !employee.division.isActive
      ) {
        throw new ForbiddenException(
          'Your Senior Management account does not have an active division assignment.',
        );
      }

      const departments = await this.prisma.department.findMany({
        where: {
          divisionId: employee.divisionId,
          isActive: true,
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

      const availableManagementPositions =
        await this.prisma.managementPosition.findMany({
          where: {
            positionType: ManagementPositionType.TEAM_MANAGER,
            divisionId: employee.divisionId,
            isActive: true,
            reservedByAccountRequestId: null,

            assignments: {
              none: {
                endedAt: null,
              },
            },

            department: {
              is: {
                isActive: true,
              },
            },
          },

          orderBy: {
            createdAt: 'asc',
          },

          select: {
            id: true,
            positionType: true,
            divisionId: true,
            departmentId: true,
            isActive: true,

            department: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        });

      return {
        role: requester.role,

        requestedRole: AccountRole.TEAM_MANAGER,

        scope: {
          division: employee.division,

          department: null,
        },

        departments,

        availableManagementPositions,
      };
    }

    if (
      !employee.divisionId ||
      !employee.departmentId ||
      !employee.division ||
      !employee.departmentUnit
    ) {
      throw new ForbiddenException(
        'Your Team Manager account does not have a complete organization assignment.',
      );
    }

    if (!employee.division.isActive || !employee.departmentUnit.isActive) {
      throw new ForbiddenException('Your organization assignment is inactive.');
    }

    if (employee.departmentUnit.divisionId !== employee.divisionId) {
      throw new ForbiddenException('Your organization assignment is invalid.');
    }

    return {
      role: requester.role,

      requestedRole: AccountRole.EMPLOYEE,

      scope: {
        division: employee.division,

        department: employee.departmentUnit,
      },

      departments: [employee.departmentUnit],

      availableManagementPositions: [],
    };
  }

  async createRequest(
    user: AuthenticatedUser,
    dto: CreateAccountRequestDto,
    metadata: RequestMetadata,
  ) {
    const requester = await this.getRequester(user);

    const requesterEmployee = requester.employee;

    if (!requesterEmployee) {
      throw new ForbiddenException(
        'Your account does not have an active employee identity.',
      );
    }

    const empId = dto.empId.trim().toUpperCase();
    const empName = dto.empName.trim().replace(/\s+/g, ' ');
    const phoneNumber = dto.phoneNumber.trim();
    const officialEmail = dto.officialEmail.trim().toLowerCase();
    const designation = dto.designation?.trim() || null;

    if (empName.length < 2) {
      throw new BadRequestException(
        'Employee name must contain at least 2 characters.',
      );
    }

    let requestedRole: AccountRole;
    let divisionId: string;
    let departmentId: string;
    let managementPositionId: string | null = null;

    if (requester.role === AccountRole.SENIOR_MANAGEMENT) {
      requestedRole = AccountRole.TEAM_MANAGER;

      if (
        !requesterEmployee.divisionId ||
        !requesterEmployee.division ||
        !requesterEmployee.division.isActive
      ) {
        throw new ForbiddenException(
          'Your Senior Management account does not have an active division assignment.',
        );
      }

      if (!dto.departmentId) {
        throw new BadRequestException(
          'Department ID is required when requesting a Team Manager account.',
        );
      }

      const department = await this.prisma.department.findUnique({
        where: {
          id: dto.departmentId,
        },

        select: {
          id: true,
          divisionId: true,
          isActive: true,

          division: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
      });

      if (!department) {
        throw new NotFoundException('Department was not found.');
      }

      if (!department.isActive || !department.division.isActive) {
        throw new ConflictException(
          'The selected organization assignment is inactive.',
        );
      }

      if (department.divisionId !== requesterEmployee.divisionId) {
        throw new ForbiddenException(
          'You can request Team Manager accounts only inside your assigned division.',
        );
      }

      divisionId = requesterEmployee.divisionId;
      departmentId = department.id;
      managementPositionId = dto.managementPositionId ?? null;
    } else {
      requestedRole = AccountRole.EMPLOYEE;

      if (
        !requesterEmployee.divisionId ||
        !requesterEmployee.departmentId ||
        !requesterEmployee.division ||
        !requesterEmployee.departmentUnit
      ) {
        throw new ForbiddenException(
          'Your Team Manager account does not have a complete organization assignment.',
        );
      }

      if (
        !requesterEmployee.division.isActive ||
        !requesterEmployee.departmentUnit.isActive
      ) {
        throw new ForbiddenException(
          'Your organization assignment is inactive.',
        );
      }

      if (
        requesterEmployee.departmentUnit.divisionId !==
        requesterEmployee.divisionId
      ) {
        throw new ForbiddenException(
          'Your organization assignment is invalid.',
        );
      }

      if (
        dto.departmentId &&
        dto.departmentId !== requesterEmployee.departmentId
      ) {
        throw new ForbiddenException(
          'You can request employee accounts only inside your assigned department.',
        );
      }

      if (dto.managementPositionId) {
        throw new BadRequestException(
          'A normal employee request must not reference a management position.',
        );
      }

      divisionId = requesterEmployee.divisionId;
      departmentId = requesterEmployee.departmentId;
    }

    const existingEmployee = await this.prisma.employee.findFirst({
      where: {
        OR: [
          {
            empId,
          },
          {
            officialEmail,
          },
          {
            phoneNumber,
          },
        ],
      },

      select: {
        id: true,
      },
    });

    if (existingEmployee) {
      throw new ConflictException(
        'An employee with this employee ID, phone number, or official email already exists.',
      );
    }

    const existingRequest = await this.prisma.accountRequest.findFirst({
      where: {
        status: {
          not: AccountRequestStatus.REJECTED,
        },

        OR: [
          {
            empId,
          },
          {
            officialEmail,
          },
          {
            phoneNumber,
          },
        ],
      },

      select: {
        id: true,
        status: true,
      },
    });

    if (existingRequest) {
      throw new ConflictException(
        'An active account request already exists for this employee ID, phone number, or official email.',
      );
    }

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const accountRequest = await this.prisma.$transaction(
      async (transaction) => {
        if (requestedRole !== AccountRole.EMPLOYEE) {
          // Resolve and recheck the official vacancy inside the transaction.
          managementPositionId =
            await this.resolveManagementPositionId(
              transaction,
              managementPositionId,
              requestedRole,
              divisionId,
              departmentId,
            );
        }

        const createdRequest = await transaction.accountRequest.create({
          data: {
            empId,
            empName,
            phoneNumber,
            officialEmail,
            designation,
            requestedRole,
            divisionId,
            departmentId,
            managementPositionId,
            requestedByAccountId: requester.id,
            status: AccountRequestStatus.PENDING_APPROVAL,
          },

          select: {
            id: true,
            empId: true,
            empName: true,
            phoneNumber: true,
            officialEmail: true,
            designation: true,
            requestedRole: true,
            divisionId: true,
            departmentId: true,
            managementPositionId: true,
            requestedByAccountId: true,
            revisionNumber: true,
            status: true,
            submittedAt: true,
            createdAt: true,
            updatedAt: true,

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
        });

        await transaction.accountRequestAction.create({
          data: {
            accountRequestId: createdRequest.id,
            actorAccountId: requester.id,
            action: AccountRequestActionType.SUBMITTED,
            ipAddress,
            userAgent,

            metadata: {
              requestedRole,
              divisionId,
              departmentId,
              managementPositionId,
            },
          },
        });

        return createdRequest;
      },
    );

    return {
      message: 'Account request submitted successfully.',
      accountRequest,
    };
  }

  async resubmitRequest(
    user: AuthenticatedUser,
    id: string,
    dto: ResubmitAccountRequestDto,
    metadata: RequestMetadata,
  ) {
    const requester = await this.getRequester(user);

    const requesterEmployee = requester.employee;

    if (!requesterEmployee) {
      throw new ForbiddenException(
        'Your account does not have an active employee identity.',
      );
    }

    const rejectedRequest = await this.prisma.accountRequest.findFirst({
      where: {
        id,
        requestedByAccountId: requester.id,
      },

      select: {
        id: true,
        empId: true,
        empName: true,
        phoneNumber: true,
        officialEmail: true,
        designation: true,
        requestedRole: true,
        divisionId: true,
        departmentId: true,
        managementPositionId: true,
        revisionNumber: true,
        status: true,
      },
    });

    if (!rejectedRequest) {
      throw new NotFoundException('Rejected account request was not found.');
    }

    if (rejectedRequest.status !== AccountRequestStatus.REJECTED) {
      throw new ConflictException(
        'Only a rejected account request can be resubmitted.',
      );
    }

    const empId =
      dto.empId !== undefined
        ? dto.empId.trim().toUpperCase()
        : rejectedRequest.empId;

    const empName =
      dto.empName !== undefined
        ? dto.empName.trim().replace(/\s+/g, ' ')
        : rejectedRequest.empName;

    const phoneNumber =
      dto.phoneNumber !== undefined
        ? dto.phoneNumber.trim()
        : rejectedRequest.phoneNumber;

    const officialEmail =
      dto.officialEmail !== undefined
        ? dto.officialEmail.trim().toLowerCase()
        : rejectedRequest.officialEmail;

    const designation =
      dto.designation !== undefined
        ? dto.designation.trim() || null
        : rejectedRequest.designation;

    if (empName.length < 2) {
      throw new BadRequestException(
        'Employee name must contain at least 2 characters.',
      );
    }

    let requestedRole: AccountRole;
    let divisionId: string;
    let departmentId: string;
    let managementPositionId: string | null = null;

    if (requester.role === AccountRole.SENIOR_MANAGEMENT) {
      requestedRole = AccountRole.TEAM_MANAGER;

      if (
        !requesterEmployee.divisionId ||
        !requesterEmployee.division ||
        !requesterEmployee.division.isActive
      ) {
        throw new ForbiddenException(
          'Your Senior Management account does not have an active division assignment.',
        );
      }

      const targetDepartmentId =
        dto.departmentId ?? rejectedRequest.departmentId;

      if (!targetDepartmentId) {
        throw new BadRequestException(
          'Department ID is required when resubmitting a Team Manager request.',
        );
      }

      const targetManagementPositionId =
        dto.managementPositionId ?? rejectedRequest.managementPositionId;

      const department = await this.prisma.department.findUnique({
        where: {
          id: targetDepartmentId,
        },

        select: {
          id: true,
          divisionId: true,
          isActive: true,

          division: {
            select: {
              id: true,
              isActive: true,
            },
          },
        },
      });

      if (!department) {
        throw new NotFoundException('Department was not found.');
      }

      if (!department.isActive || !department.division.isActive) {
        throw new ConflictException(
          'The selected organization assignment is inactive.',
        );
      }

      if (department.divisionId !== requesterEmployee.divisionId) {
        throw new ForbiddenException(
          'You can resubmit Team Manager requests only inside your assigned division.',
        );
      }

      divisionId = requesterEmployee.divisionId;

      departmentId = department.id;

      managementPositionId = targetManagementPositionId;
    } else {
      requestedRole = AccountRole.EMPLOYEE;

      if (
        !requesterEmployee.divisionId ||
        !requesterEmployee.departmentId ||
        !requesterEmployee.division ||
        !requesterEmployee.departmentUnit
      ) {
        throw new ForbiddenException(
          'Your Team Manager account does not have a complete organization assignment.',
        );
      }

      if (
        !requesterEmployee.division.isActive ||
        !requesterEmployee.departmentUnit.isActive
      ) {
        throw new ForbiddenException(
          'Your organization assignment is inactive.',
        );
      }

      if (
        requesterEmployee.departmentUnit.divisionId !==
        requesterEmployee.divisionId
      ) {
        throw new ForbiddenException(
          'Your organization assignment is invalid.',
        );
      }

      if (
        dto.departmentId &&
        dto.departmentId !== requesterEmployee.departmentId
      ) {
        throw new ForbiddenException(
          'You can resubmit employee requests only inside your assigned department.',
        );
      }

      if (dto.managementPositionId) {
        throw new BadRequestException(
          'A normal employee request must not reference a management position.',
        );
      }

      divisionId = requesterEmployee.divisionId;

      departmentId = requesterEmployee.departmentId;
    }

    if (rejectedRequest.requestedRole !== requestedRole) {
      throw new ForbiddenException(
        'Your current role cannot resubmit this account request.',
      );
    }

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const resubmittedRequest = await this.prisma.$transaction(
      async (transaction) => {
        /*
         * Re-read the original inside the transaction
         * so its state is verified again before creating
         * the next revision.
         */
        const previousRequest = await transaction.accountRequest.findFirst({
          where: {
            id: rejectedRequest.id,
            requestedByAccountId: requester.id,
          },

          select: {
            id: true,
            requestedRole: true,
            managementPositionId: true,
            revisionNumber: true,
            status: true,
          },
        });

        if (!previousRequest) {
          throw new NotFoundException(
            'Rejected account request was not found.',
          );
        }

        if (previousRequest.status !== AccountRequestStatus.REJECTED) {
          throw new ConflictException(
            'Only a rejected account request can be resubmitted.',
          );
        }

        if (previousRequest.requestedRole !== requestedRole) {
          throw new ForbiddenException(
            'Your current role cannot resubmit this account request.',
          );
        }

        /*
         * A rejected request can have only one direct
         * revision. A later rejection must be resubmitted
         * from the latest rejected revision.
         */
        const existingRevision = await transaction.accountRequest.findFirst({
          where: {
            previousRequestId: previousRequest.id,
          },

          select: {
            id: true,
            status: true,
          },
        });

        if (existingRevision) {
          throw new ConflictException(
            'This rejected request has already been resubmitted.',
          );
        }

        if (requestedRole !== AccountRole.EMPLOYEE) {
          // Resolve and recheck the official vacancy for this revision.
          managementPositionId =
            await this.resolveManagementPositionId(
              transaction,
              managementPositionId,
              requestedRole,
              divisionId,
              departmentId,
            );
        }

        const existingEmployee = await transaction.employee.findFirst({
          where: {
            OR: [
              {
                empId,
              },
              {
                officialEmail,
              },
              {
                phoneNumber,
              },
            ],
          },

          select: {
            id: true,
          },
        });

        if (existingEmployee) {
          throw new ConflictException(
            'An employee with this employee ID, phone number, or official email already exists.',
          );
        }

        const existingActiveRequest =
          await transaction.accountRequest.findFirst({
            where: {
              status: {
                not: AccountRequestStatus.REJECTED,
              },

              OR: [
                {
                  empId,
                },
                {
                  officialEmail,
                },
                {
                  phoneNumber,
                },
              ],
            },

            select: {
              id: true,
              status: true,
            },
          });

        if (existingActiveRequest) {
          throw new ConflictException(
            'An active account request already exists for this employee ID, phone number, or official email.',
          );
        }

        const revisionNumber = previousRequest.revisionNumber + 1;

        const createdRequest = await transaction.accountRequest.create({
          data: {
            empId,
            empName,
            phoneNumber,
            officialEmail,
            designation,
            requestedRole,
            divisionId,
            departmentId,
            managementPositionId,

            requestedByAccountId: requester.id,

            previousRequestId: previousRequest.id,

            revisionNumber,

            status: AccountRequestStatus.PENDING_APPROVAL,
          },

          select: {
            id: true,
            empId: true,
            empName: true,
            phoneNumber: true,
            officialEmail: true,
            designation: true,
            requestedRole: true,
            divisionId: true,
            departmentId: true,
            managementPositionId: true,
            requestedByAccountId: true,
            previousRequestId: true,
            revisionNumber: true,
            status: true,
            submittedAt: true,
            createdAt: true,
            updatedAt: true,

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
        });

        await transaction.accountRequestAction.create({
          data: {
            accountRequestId: createdRequest.id,

            actorAccountId: requester.id,

            action: AccountRequestActionType.RESUBMITTED,

            ipAddress,
            userAgent,

            metadata: {
              previousRequestId: previousRequest.id,

              previousRevisionNumber: previousRequest.revisionNumber,

              revisionNumber,

              requestedRole,
              divisionId,
              departmentId,
              managementPositionId,
            },
          },
        });

        return createdRequest;
      },
    );

    return {
      message: 'Account request resubmitted successfully.',

      accountRequest: resubmittedRequest,
    };
  }

  async listAdminRequests(
    user: AuthenticatedUser,
    query: ListAccountRequestsQueryDto,
  ) {
    this.assertSuperAdmin(user);

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    /*
     * The default Super Admin queue displays pending requests.
     * Another status may be supplied through the query parameter.
     */
    const status = query.status ?? AccountRequestStatus.PENDING_APPROVAL;

    const where = {
      status,
    };

    const [accountRequests, total] = await this.prisma.$transaction([
      this.prisma.accountRequest.findMany({
        where,
        skip,
        take: limit,

        orderBy: {
          createdAt: 'asc',
        },

        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          designation: true,
          requestedRole: true,
          managementPositionId: true,
          revisionNumber: true,
          status: true,
          rejectionReason: true,
          submittedAt: true,
          reviewedAt: true,
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

          requestedBy: {
            select: {
              id: true,
              username: true,
              role: true,

              employee: {
                select: {
                  empId: true,
                  empName: true,
                  officialEmail: true,
                },
              },
            },
          },

          reviewedBy: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
        },
      }),

      this.prisma.accountRequest.count({
        where,
      }),
    ]);

    return {
      data: accountRequests,

      filters: {
        status,
      },

      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async getAdminRequest(user: AuthenticatedUser, id: string) {
    this.assertSuperAdmin(user);

    const accountRequest = await this.prisma.accountRequest.findUnique({
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
        requestedRole: true,
        divisionId: true,
        departmentId: true,
        managementPositionId: true,
        employeeId: true,
        previousRequestId: true,
        revisionNumber: true,
        status: true,
        rejectionReason: true,
        submittedAt: true,
        reviewedAt: true,
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
            divisionId: true,
            code: true,
            name: true,
            isActive: true,
          },
        },

        employee: {
          select: {
            id: true,
            empId: true,
            empName: true,
            officialEmail: true,
            isActivated: true,
            status: true,
          },
        },

        requestedBy: {
          select: {
            id: true,
            username: true,
            role: true,

            employee: {
              select: {
                empId: true,
                empName: true,
                officialEmail: true,
              },
            },
          },
        },

        reviewedBy: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },

        actions: {
          orderBy: {
            createdAt: 'asc',
          },

          select: {
            id: true,
            action: true,
            reason: true,
            ipAddress: true,
            userAgent: true,
            metadata: true,
            createdAt: true,

            actor: {
              select: {
                id: true,
                username: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!accountRequest) {
      throw new NotFoundException('Account request was not found.');
    }

    return {
      accountRequest,
    };
  }

  async approveRequest(
    user: AuthenticatedUser,
    id: string,
    metadata: RequestMetadata,
  ) {
    this.assertSuperAdmin(user);

    const reviewedAt = new Date();
    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;
    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    try {
      const accountRequest = await this.prisma.$transaction(
        async (transaction) => {
          const request = await transaction.accountRequest.findUnique({
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
              requestedRole: true,
              divisionId: true,
              departmentId: true,
              managementPositionId: true,
              status: true,

              division: {
                select: {
                  id: true,
                  isActive: true,
                },
              },

              department: {
                select: {
                  id: true,
                  divisionId: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          });

          if (!request) {
            throw new NotFoundException('Account request was not found.');
          }

          if (request.status !== AccountRequestStatus.PENDING_APPROVAL) {
            throw new ConflictException(
              'Only a pending account request can be approved.',
            );
          }

          if (
            request.requestedRole !== AccountRole.TEAM_MANAGER &&
            request.requestedRole !== AccountRole.EMPLOYEE
          ) {
            throw new BadRequestException(
              'The requested role is not supported by this approval workflow.',
            );
          }

          if (
            !request.divisionId ||
            !request.departmentId ||
            !request.division ||
            !request.department
          ) {
            throw new BadRequestException(
              'The request does not have a complete organization assignment.',
            );
          }

          if (!request.division.isActive || !request.department.isActive) {
            throw new ConflictException(
              'The request organization assignment is inactive.',
            );
          }

          if (request.department.divisionId !== request.divisionId) {
            throw new BadRequestException(
              'The request department does not belong to its division.',
            );
          }

          let managementPositionId: string | null = null;

          if (request.requestedRole === AccountRole.TEAM_MANAGER) {
            if (!request.managementPositionId) {
              throw new BadRequestException(
                'The Team Manager request does not reference a management position.',
              );
            }

            await this.validateManagementPositionVacancy(
              transaction,
              request.managementPositionId,
              request.requestedRole,
              request.divisionId,
              request.departmentId,
            );

            managementPositionId = request.managementPositionId;
          } else if (request.managementPositionId) {
            throw new BadRequestException(
              'A normal employee request must not reference a management position.',
            );
          }

          const duplicateEmployee = await transaction.employee.findFirst({
            where: {
              OR: [
                {
                  empId: request.empId,
                },
                {
                  officialEmail: request.officialEmail,
                },
              ],
            },

            select: {
              id: true,
            },
          });

          if (duplicateEmployee) {
            throw new ConflictException(
              'An employee with this employee ID, phone number, or official email already exists.',
            );
          }

          /*
           * Claim the pending request before creating the employee.
           * If another review has already changed the status,
           * this update affects zero rows and the transaction rolls back.
           */
          const reviewClaim = await transaction.accountRequest.updateMany({
            where: {
              id: request.id,
              status: AccountRequestStatus.PENDING_APPROVAL,
            },

            data: {
              status: AccountRequestStatus.APPROVED,
              reviewedByAccountId: user.accountId,
              reviewedAt,
              rejectionReason: null,
            },
          });

          if (reviewClaim.count !== 1) {
            throw new ConflictException(
              'This account request has already been reviewed.',
            );
          }

          if (managementPositionId) {
            /*
             * Atomically change the official position from
             * VACANT to RESERVED for this approved request.
             */
            const reservationClaim =
              await transaction.managementPosition.updateMany({
                where: {
                  id: managementPositionId,
                  isActive: true,
                  reservedByAccountRequestId: null,

                  assignments: {
                    none: {
                      endedAt: null,
                    },
                  },
                },

                data: {
                  reservedByAccountRequestId: request.id,
                },
              });

            if (reservationClaim.count !== 1) {
              throw new ConflictException(
                'The selected management position is no longer vacant.',
              );
            }
          }

          const employee = await transaction.employee.create({
            data: {
              empId: request.empId,
              empName: request.empName,
              phoneNumber: request.phoneNumber,
              officialEmail: request.officialEmail,
              designation: request.designation,

              /*
               * Temporary legacy department text.
               */
              department: request.department.name,

              status: EmployeeStatus.ACTIVE,
              isActivated: false,

              division: {
                connect: {
                  id: request.divisionId,
                },
              },

              departmentUnit: {
                connect: {
                  id: request.departmentId,
                },
              },
            },

            select: {
              id: true,
              empId: true,
              empName: true,
              phoneNumber: true,
              officialEmail: true,
              divisionId: true,
              departmentId: true,
              department: true,
              designation: true,
              status: true,
              isActivated: true,
              createdAt: true,
            },
          });

          const approvedRequest = await transaction.accountRequest.update({
            where: {
              id: request.id,
            },

            data: {
              employeeId: employee.id,
            },

            select: {
              id: true,
              empId: true,
              empName: true,
              officialEmail: true,
              requestedRole: true,
              divisionId: true,
              departmentId: true,
              managementPositionId: true,
              employeeId: true,
              revisionNumber: true,
              status: true,
              rejectionReason: true,
              submittedAt: true,
              reviewedAt: true,
              updatedAt: true,

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
          });

          await transaction.accountRequestAction.create({
            data: {
              accountRequestId: request.id,
              actorAccountId: user.accountId,
              action: AccountRequestActionType.APPROVED,
              ipAddress,
              userAgent,

              metadata: {
                employeeId: employee.id,
                requestedRole: request.requestedRole,
                divisionId: request.divisionId,
                departmentId: request.departmentId,
                managementPositionId,
              },
            },
          });

          return {
            approvedRequest,
            employee,
          };
        },
      );

      return {
        message: 'Account request approved successfully.',
        accountRequest: accountRequest.approvedRequest,
        employee: accountRequest.employee,
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An employee with this employee ID, phone number, or official email already exists.',
        );
      }

      throw error;
    }
  }

  async rejectRequest(
    user: AuthenticatedUser,
    id: string,
    rawReason: string,
    metadata: RequestMetadata,
  ) {
    this.assertSuperAdmin(user);

    const reason = rawReason.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'A rejection reason of at least 3 characters is required.',
      );
    }

    const reviewedAt = new Date();
    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;
    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const rejectedRequest = await this.prisma.$transaction(
      async (transaction) => {
        const request = await transaction.accountRequest.findUnique({
          where: {
            id,
          },

          select: {
            id: true,
            status: true,
          },
        });

        if (!request) {
          throw new NotFoundException('Account request was not found.');
        }

        if (request.status !== AccountRequestStatus.PENDING_APPROVAL) {
          throw new ConflictException(
            'Only a pending account request can be rejected.',
          );
        }

        const reviewClaim = await transaction.accountRequest.updateMany({
          where: {
            id: request.id,
            status: AccountRequestStatus.PENDING_APPROVAL,
          },

          data: {
            status: AccountRequestStatus.REJECTED,
            rejectionReason: reason,
            reviewedByAccountId: user.accountId,
            reviewedAt,
          },
        });

        if (reviewClaim.count !== 1) {
          throw new ConflictException(
            'This account request has already been reviewed.',
          );
        }

        await transaction.accountRequestAction.create({
          data: {
            accountRequestId: request.id,
            actorAccountId: user.accountId,
            action: AccountRequestActionType.REJECTED,
            reason,
            ipAddress,
            userAgent,

            metadata: {
              previousStatus: AccountRequestStatus.PENDING_APPROVAL,
              newStatus: AccountRequestStatus.REJECTED,
            },
          },
        });

        return transaction.accountRequest.findUniqueOrThrow({
          where: {
            id: request.id,
          },

          select: {
            id: true,
            empId: true,
            empName: true,
            officialEmail: true,
            requestedRole: true,
            divisionId: true,
            departmentId: true,
            managementPositionId: true,
            employeeId: true,
            revisionNumber: true,
            status: true,
            rejectionReason: true,
            submittedAt: true,
            reviewedAt: true,
            updatedAt: true,

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

            reviewedBy: {
              select: {
                id: true,
                username: true,
                role: true,
              },
            },
          },
        });
      },
    );

    return {
      message: 'Account request rejected successfully.',
      accountRequest: rejectedRequest,
    };
  }

  private normalizeClosureReason(
    rawReason: string,
  ): string {
    const reason = rawReason
      .trim()
      .replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'A reason of at least 3 characters is required.',
      );
    }

    if (reason.length > 500) {
      throw new BadRequestException(
        'The reason cannot exceed 500 characters.',
      );
    }

    return reason;
  }

  private async closeUnactivatedRequest(
    actorAccountId: string,
    requestId: string,
    rawReason: string,
    metadata: RequestMetadata,
    options: {
      closureType:
        | 'CANCELLED'
        | 'INVALIDATED';

      allowedStatuses:
        AccountRequestStatus[];

      requestedByAccountId?:
        string;

      notFoundMessage:
        string;
    },
  ) {
    const reason =
      this.normalizeClosureReason(
        rawReason,
      );

    const ipAddress =
      metadata.ipAddress
        ?.slice(0, 45) ||
      null;

    const userAgent =
      metadata.userAgent
        ?.slice(0, 500) ||
      null;

    return this.prisma.$transaction(
      async (transaction) => {
        const request =
          await transaction
            .accountRequest
            .findFirst({
              where: {
                id: requestId,

                ...(options
                  .requestedByAccountId
                  ? {
                      requestedByAccountId:
                        options
                          .requestedByAccountId,
                    }
                  : {}),
              },

              select: {
                id: true,
                empId: true,
                empName: true,
                officialEmail: true,
                requestedRole: true,
                divisionId: true,
                departmentId: true,
                managementPositionId: true,
                employeeId: true,
                revisionNumber: true,
                status: true,
                rejectionReason: true,
                submittedAt: true,
                reviewedAt: true,
                updatedAt: true,

                employee: {
                  select: {
                    id: true,
                    isActivated: true,

                    account: {
                      select: {
                        id: true,
                      },
                    },
                  },
                },

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
            });

        if (!request) {
          throw new NotFoundException(
            options.notFoundMessage,
          );
        }

        if (
          !options
            .allowedStatuses
            .includes(request.status)
        ) {
          throw new ConflictException(
            options.closureType ===
              'CANCELLED'
              ? 'Only a pending or unactivated account request can be cancelled.'
              : 'Only an approved or activation-pending account request can be invalidated.',
          );
        }

        if (
          request.employee &&
          (
            request.employee
              .isActivated ||
            request.employee.account
          )
        ) {
          throw new ConflictException(
            'This request can no longer be closed because its employee account is already active.',
          );
        }

        /*
         * Claim the current status before releasing anything.
         * A simultaneous activation or review therefore causes
         * one of the operations to fail safely.
         */
        const closeClaim =
          await transaction
            .accountRequest
            .updateMany({
              where: {
                id: request.id,
                status:
                  request.status,

                ...(options
                  .requestedByAccountId
                  ? {
                      requestedByAccountId:
                        options
                          .requestedByAccountId,
                    }
                  : {}),
              },

              data: {
                status:
                  AccountRequestStatus
                    .REJECTED,

                rejectionReason:
                  reason,

                employeeId:
                  null,
              },
            });

        if (closeClaim.count !== 1) {
          throw new ConflictException(
            'This account request changed before it could be closed.',
          );
        }

        /*
         * Release only the position reserved by this exact
         * account request. Another request cannot be affected.
         */
        const reservationRelease =
          await transaction
            .managementPosition
            .updateMany({
              where: {
                reservedByAccountRequestId:
                  request.id,
              },

              data: {
                reservedByAccountRequestId:
                  null,
              },
            });

        let provisionalEmployeeDeleted =
          false;

        if (request.employee) {
          /*
           * Remove all unused OTP records before deleting
           * the unactivated provisional employee identity.
           */
          await transaction
            .otpVerification
            .deleteMany({
              where: {
                employeeId:
                  request.employee.id,
              },
            });

          const deletedEmployee =
            await transaction
              .employee
              .deleteMany({
                where: {
                  id:
                    request.employee.id,

                  isActivated:
                    false,

                  account: {
                    is:
                      null,
                  },
                },
              });

          if (
            deletedEmployee.count !==
            1
          ) {
            throw new ConflictException(
              'The provisional employee identity could not be safely removed.',
            );
          }

          provisionalEmployeeDeleted =
            true;
        }

        await transaction
          .accountRequestAction
          .create({
            data: {
              accountRequestId:
                request.id,

              actorAccountId,

              /*
               * Existing enum value is used while metadata
               * records the exact closure operation.
               */
              action:
                AccountRequestActionType
                  .REJECTED,

              reason,
              ipAddress,
              userAgent,

              metadata: {
                closureType:
                  options.closureType,

                previousStatus:
                  request.status,

                newStatus:
                  AccountRequestStatus
                    .REJECTED,

                releasedReservation:
                  reservationRelease
                    .count === 1,

                provisionalEmployeeDeleted,
              },
            },
          });

        return transaction
          .accountRequest
          .findUniqueOrThrow({
            where: {
              id: request.id,
            },

            select: {
              id: true,
              empId: true,
              empName: true,
              officialEmail: true,
              requestedRole: true,
              divisionId: true,
              departmentId: true,
              managementPositionId: true,
              employeeId: true,
              revisionNumber: true,
              status: true,
              rejectionReason: true,
              submittedAt: true,
              reviewedAt: true,
              updatedAt: true,

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
          });
      },
    );
  }

  async cancelRequest(
    user: AuthenticatedUser,
    id: string,
    reason: string,
    metadata: RequestMetadata,
  ) {
    const requester =
      await this.getRequester(user);

    const accountRequest =
      await this
        .closeUnactivatedRequest(
          requester.id,
          id,
          reason,
          metadata,
          {
            closureType:
              'CANCELLED',

            allowedStatuses: [
              AccountRequestStatus
                .PENDING_APPROVAL,

              AccountRequestStatus
                .APPROVED,

              AccountRequestStatus
                .ACTIVATION_PENDING,
            ],

            requestedByAccountId:
              requester.id,

            notFoundMessage:
              'Your account request was not found.',
          },
        );

    return {
      message:
        'Account request cancelled successfully.',

      accountRequest,
    };
  }

  async invalidateRequest(
    user: AuthenticatedUser,
    id: string,
    reason: string,
    metadata: RequestMetadata,
  ) {
    this.assertSuperAdmin(user);

    const accountRequest =
      await this
        .closeUnactivatedRequest(
          user.accountId,
          id,
          reason,
          metadata,
          {
            closureType:
              'INVALIDATED',

            allowedStatuses: [
              AccountRequestStatus
                .APPROVED,

              AccountRequestStatus
                .ACTIVATION_PENDING,
            ],

            notFoundMessage:
              'Account request was not found.',
          },
        );

    return {
      message:
        'Account request invalidated successfully.',

      accountRequest,
    };
  }

  async listMyRequests(
    user: AuthenticatedUser,
    query: ListAccountRequestsQueryDto,
  ) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where = {
      requestedByAccountId: user.accountId,

      ...(query.status
        ? {
            status: query.status,
          }
        : {}),
    };

    const [accountRequests, total] = await this.prisma.$transaction([
      this.prisma.accountRequest.findMany({
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
          officialEmail: true,
          designation: true,
          requestedRole: true,
          managementPositionId: true,
          revisionNumber: true,
          status: true,
          rejectionReason: true,
          submittedAt: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,

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

          reviewedBy: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
        },
      }),

      this.prisma.accountRequest.count({
        where,
      }),
    ]);

    return {
      data: accountRequests,

      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async getMyRequest(user: AuthenticatedUser, id: string) {
    const accountRequest = await this.prisma.accountRequest.findFirst({
      where: {
        id,
        requestedByAccountId: user.accountId,
      },

      select: {
        id: true,
        empId: true,
        empName: true,
        phoneNumber: true,
        officialEmail: true,
        designation: true,
        requestedRole: true,
        divisionId: true,
        departmentId: true,
        managementPositionId: true,
        employeeId: true,
        previousRequestId: true,
        revisionNumber: true,
        status: true,
        rejectionReason: true,
        submittedAt: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,

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

        reviewedBy: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },

        actions: {
          orderBy: {
            createdAt: 'asc',
          },

          select: {
            id: true,
            action: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    if (!accountRequest) {
      throw new NotFoundException('Account request was not found.');
    }

    return {
      accountRequest,
    };
  }
}
