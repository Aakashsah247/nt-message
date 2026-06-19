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
} from '../generated/prisma/client';

import { CreateAccountRequestDto } from './dto/create-account-request.dto';
import { ListAccountRequestsQueryDto } from './dto/list-account-requests-query.dto';

interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class AccountRequestsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return requester;
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
        ],
      },

      select: {
        id: true,
      },
    });

    if (existingEmployee) {
      throw new ConflictException(
        'An employee with this employee ID or official email already exists.',
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
        ],
      },

      select: {
        id: true,
        status: true,
      },
    });

    if (existingRequest) {
      throw new ConflictException(
        'An active account request already exists for this employee ID or official email.',
      );
    }

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const accountRequest = await this.prisma.$transaction(
      async (transaction) => {
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
