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

        const existingEmployee = await transaction.employee.findFirst({
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
              ],
            },

            select: {
              id: true,
              status: true,
            },
          });

        if (existingActiveRequest) {
          throw new ConflictException(
            'An active account request already exists for this employee ID or official email.',
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
              'An employee with this employee ID or official email already exists.',
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
          'An employee with this employee ID or official email already exists.',
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
