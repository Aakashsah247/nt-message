import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ActivationInvitationsService } from '../activation-invitations/activation-invitations.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { normalizeAccountIdentity } from '../common/normalization/account-identity-normalization';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRequestActionType,
  AccountRequestStatus,
  AccountRole,
  ActivationEmailDeliveryStatus,
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import { resolveOrCreateVacantManagementPosition } from '../management-assignments/management-position-resolver';

import { getActivationEmailResendPolicyViolation } from './account-request-activation-email-policy';
import { CreateAccountRequestDto } from './dto/create-account-request.dto';
import { ListAccountRequestsQueryDto } from './dto/list-account-requests-query.dto';
import { ResubmitAccountRequestDto } from './dto/resubmit-account-request.dto';

interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

const activationEmailDeliverySelect = {
  activationEmailStatus: true,
  activationEmailLastAttemptAt: true,
  activationEmailSentAt: true,
  activationEmailFailureCategory: true,
} as const;

@Injectable()
export class AccountRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activationInvitationsService: ActivationInvitationsService,
  ) {}

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
            employmentStatus: true,
            archivedAt: true,
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
      requester.employee.status !== EmployeeStatus.ACTIVE ||
      requester.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      requester.employee.archivedAt
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

  private buildRequestListFilters(
    query: ListAccountRequestsQueryDto,
  ): Prisma.AccountRequestWhereInput {
    const search = query.search?.trim();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
    const dateTo = query.dateTo ? new Date(query.dateTo) : null;

    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException(
        'The request start date cannot be after the end date.',
      );
    }

    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.requestedRole ? { requestedRole: query.requestedRole } : {}),
      ...(query.divisionId ? { divisionId: query.divisionId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(dateFrom || dateTo
        ? {
            submittedAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { empName: { contains: search, mode: 'insensitive' } },
              { empId: { contains: search, mode: 'insensitive' } },
              { officialEmail: { contains: search, mode: 'insensitive' } },
              {
                requestedBy: {
                  is: {
                    employee: {
                      is: {
                        OR: [
                          {
                            empName: { contains: search, mode: 'insensitive' },
                          },
                          { empId: { contains: search, mode: 'insensitive' } },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async getCurrentAccountIdentity(user: AuthenticatedUser) {
    const account = await this.prisma.account.findUnique({
      where: {
        id: user.accountId,
      },

      select: {
        id: true,
        username: true,
        role: true,
        isEnabled: true,
        lastLoginAt: true,
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
            isActivated: true,
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

    if (!account || account.role !== user.role) {
      throw new ForbiddenException(
        'Your authenticated account identity is unavailable.',
      );
    }

    return account;
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
    const position = await resolveOrCreateVacantManagementPosition(
      transaction,
      {
        requestedRole,
        divisionId,
        departmentId,

        suppliedManagementPositionId,
      },
    );

    return position.id;
  }

  async getOwnAccountStatus(user: AuthenticatedUser) {
    const account = await this.getCurrentAccountIdentity(user);

    const accountRequest = account.employee
      ? await this.prisma.accountRequest.findFirst({
          where: {
            OR: [
              { employeeId: account.employee.id },
              {
                empId: account.employee.empId,
                officialEmail: account.employee.officialEmail,
              },
            ],
          },

          orderBy: [{ revisionNumber: 'desc' }, { createdAt: 'desc' }],

          select: {
            id: true,
            empId: true,
            empName: true,
            officialEmail: true,
            designation: true,
            requestedRole: true,
            revisionNumber: true,
            status: true,
            ...activationEmailDeliverySelect,
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
                createdAt: true,
              },
            },
          },
        })
      : null;

    return {
      account,
      accountRequest,
    };
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

      return {
        role: requester.role,

        requestedRole: AccountRole.TEAM_MANAGER,

        scope: {
          division: employee.division,

          department: null,
        },

        departments,

        availableManagementPositions: [],
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

    const {
      empId,
      empName,
      phoneNumber,
      phoneLookupValues,
      officialEmail,
      officialEmailLookup,
    } = normalizeAccountIdentity(dto);
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
            officialEmail: {
              equals: officialEmailLookup,
              mode: 'insensitive',
            },
          },
          {
            phoneNumber: {
              in: phoneLookupValues,
            },
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
            officialEmail: {
              equals: officialEmailLookup,
              mode: 'insensitive',
            },
          },
          {
            phoneNumber: {
              in: phoneLookupValues,
            },
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
          managementPositionId = await this.resolveManagementPositionId(
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
            ...activationEmailDeliverySelect,
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

    const {
      empId,
      empName,
      phoneNumber,
      phoneLookupValues,
      officialEmail,
      officialEmailLookup,
    } = normalizeAccountIdentity({
      empId: dto.empId ?? rejectedRequest.empId,
      empName: dto.empName ?? rejectedRequest.empName,
      phoneNumber: dto.phoneNumber ?? rejectedRequest.phoneNumber,
      officialEmail: dto.officialEmail ?? rejectedRequest.officialEmail,
    });

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
          managementPositionId = await this.resolveManagementPositionId(
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
                officialEmail: {
                  equals: officialEmailLookup,
                  mode: 'insensitive',
                },
              },
              {
                phoneNumber: {
                  in: phoneLookupValues,
                },
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
                  officialEmail: {
                    equals: officialEmailLookup,
                    mode: 'insensitive',
                  },
                },
                {
                  phoneNumber: {
                    in: phoneLookupValues,
                  },
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
            ...activationEmailDeliverySelect,
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

  async getAdminRequestSummary(user: AuthenticatedUser) {
    this.assertSuperAdmin(user);

    const requestListSelect = {
      id: true,
      empId: true,
      empName: true,
      officialEmail: true,
      designation: true,
      requestedRole: true,
      managementPositionId: true,
      revisionNumber: true,
      status: true,
      ...activationEmailDeliverySelect,
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
    } satisfies Prisma.AccountRequestSelect;

    /*
     * A dedicated aggregate query keeps the Dashboard and status tabs
     * consistent without issuing one list request for every status.
     * Only governance metadata is returned; message content is never queried.
     */
    const [countRows, attentionRequests, recentActivity] =
      await this.prisma.$transaction([
        this.prisma.accountRequest.groupBy({
          by: ['status'],
          orderBy: {
            status: 'asc',
          },
          _count: {
            id: true,
          },
        }),

        this.prisma.accountRequest.findMany({
          where: {
            status: {
              in: [
                AccountRequestStatus.PENDING_APPROVAL,
                AccountRequestStatus.ACTIVATION_PENDING,
                AccountRequestStatus.REJECTED,
              ],
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 6,
          select: requestListSelect,
        }),

        this.prisma.accountRequest.findMany({
          where: {
            status: {
              not: AccountRequestStatus.DRAFT,
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 6,
          select: requestListSelect,
        }),
      ]);

    const counts: Record<AccountRequestStatus, number> = {
      [AccountRequestStatus.DRAFT]: 0,
      [AccountRequestStatus.PENDING_APPROVAL]: 0,
      [AccountRequestStatus.APPROVED]: 0,
      [AccountRequestStatus.REJECTED]: 0,
      [AccountRequestStatus.ACTIVATION_PENDING]: 0,
      [AccountRequestStatus.ACTIVATED]: 0,
    };

    countRows.forEach((row) => {
      // Prisma's generated groupBy type permits `_count` to be `true`,
      // so narrow it before reading the requested `id` aggregate.
      const statusCount =
        typeof row._count === 'object' && row._count !== null
          ? (row._count.id ?? 0)
          : 0;

      counts[row.status] = statusCount;
    });

    const activationTotal =
      counts[AccountRequestStatus.ACTIVATED] +
      counts[AccountRequestStatus.ACTIVATION_PENDING];

    return {
      counts,
      totalRequests: Object.values(counts).reduce(
        (total, count) => total + count,
        0,
      ),
      attentionTotal:
        counts[AccountRequestStatus.PENDING_APPROVAL] +
        counts[AccountRequestStatus.ACTIVATION_PENDING] +
        counts[AccountRequestStatus.REJECTED],
      activationCompletionRate:
        activationTotal === 0
          ? 100
          : Math.round(
              (counts[AccountRequestStatus.ACTIVATED] / activationTotal) * 100,
            ),
      attentionRequests,
      recentActivity,
      generatedAt: new Date().toISOString(),
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

    const where: Prisma.AccountRequestWhereInput = {
      ...this.buildRequestListFilters(query),
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
          ...activationEmailDeliverySelect,
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
        ...activationEmailDeliverySelect,
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

    /*
     * The raw invitation token is never stored. Only its SHA-256 hash is
     * committed with the approval transaction before email delivery begins.
     */
    const preparedInvitation =
      this.activationInvitationsService.prepareInvitation(reviewedAt);

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
                  name: true,
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

          const {
            empId,
            empName,
            phoneNumber,
            phoneLookupValues,
            officialEmail,
            officialEmailLookup,
          } = normalizeAccountIdentity(request);

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

          /*
           * A request may contain an older approved phone representation or
           * mixed-case email. Normalize once and check all unique identities
           * in one query before the employee row is created.
           */
          const duplicateEmployee = await transaction.employee.findFirst({
            where: {
              OR: [
                {
                  empId,
                },
                {
                  officialEmail: {
                    equals: officialEmailLookup,
                    mode: 'insensitive',
                  },
                },
                {
                  phoneNumber: {
                    in: phoneLookupValues,
                  },
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
              empId,
              empName,
              phoneNumber,
              officialEmail,
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
              /*
               * Keep the approved request aligned with the canonical identity
               * written to Employee, including older request records.
               */
              empId,
              empName,
              phoneNumber,
              officialEmail,
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
              ...activationEmailDeliverySelect,
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

          const invitation =
            await this.activationInvitationsService.queueInvitation(
              transaction,
              {
                accountRequestId: request.id,
                employeeId: employee.id,
                actorAccountId: user.accountId,
                source: 'SUPER_ADMIN_APPROVAL',
                ipAddress,
                userAgent,
              },
              preparedInvitation,
            );

          return {
            approvedRequest,
            employee,
            invitation,
            divisionName: request.division.name,
            departmentName: request.department.name,
          };
        },
      );

      /*
       * The request and employee are already committed. Email failure changes
       * only delivery state and must never reverse the approval decision.
       */
      const activationEmailDelivery =
        await this.activationInvitationsService.deliverQueuedInvitation({
          ...accountRequest.invitation,
          employeeName: accountRequest.employee.empName,
          employeeCode: accountRequest.employee.empId,
          officialEmail: accountRequest.employee.officialEmail,
          phoneNumber: accountRequest.employee.phoneNumber,
          divisionName: accountRequest.divisionName,
          departmentName: accountRequest.departmentName,
          requestedRole: accountRequest.approvedRequest.requestedRole,
        });

      return {
        message: 'Account request approved successfully.',
        accountRequest: {
          ...accountRequest.approvedRequest,
          activationEmailStatus: activationEmailDelivery.status,
          activationEmailLastAttemptAt: activationEmailDelivery.attemptedAt,
          activationEmailSentAt: activationEmailDelivery.sentAt,
          activationEmailFailureCategory:
            activationEmailDelivery.failureCategory,
        },
        employee: accountRequest.employee,
        activationEmailDelivery,
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

  async resendActivationEmail(
    user: AuthenticatedUser,
    id: string,
    metadata: RequestMetadata,
  ) {
    const requester =
      user.role === AccountRole.SUPER_ADMIN
        ? null
        : await this.getRequester(user);

    const now = new Date();
    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;
    const userAgent = metadata.userAgent?.slice(0, 500) || null;
    const preparedInvitation =
      this.activationInvitationsService.prepareInvitation(now);

    /*
     * The usable token remains in process memory only. The transaction stores
     * its one-way hash and safe identifiers, never the raw token or email body.
     */
    const queued = await this.prisma.$transaction(async (transaction) => {
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
          requestedRole: true,
          requestedByAccountId: true,
          status: true,
          divisionId: true,
          departmentId: true,
          employeeId: true,
          activationEmailStatus: true,
          activationEmailLastAttemptAt: true,
          division: {
            select: {
              name: true,
              isActive: true,
            },
          },
          department: {
            select: {
              name: true,
              divisionId: true,
              isActive: true,
            },
          },
          employee: {
            select: {
              id: true,
              empId: true,
              empName: true,
              phoneNumber: true,
              officialEmail: true,
              status: true,
              employmentStatus: true,
              archivedAt: true,
              isActivated: true,
              account: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      });

      if (!request) {
        throw new NotFoundException('Account request was not found.');
      }

      /*
       * Authorization is derived from authenticated and persisted records.
       * No requester identity, role, division, or department from the browser
       * is trusted for this decision.
       */
      const policyViolation = getActivationEmailResendPolicyViolation(
        requester
          ? {
              accountId: requester.id,
              role: requester.role,
              divisionId: requester.employee!.divisionId,
              departmentId: requester.employee!.departmentId,
            }
          : {
              accountId: user.accountId,
              role: user.role,
              divisionId: null,
              departmentId: null,
            },
        request,
      );

      if (policyViolation) {
        throw new ForbiddenException(
          'You are not authorized to resend this activation email.',
        );
      }

      if (
        request.status !== AccountRequestStatus.APPROVED &&
        request.status !== AccountRequestStatus.ACTIVATION_PENDING
      ) {
        throw new ConflictException(
          'Activation email can be resent only for an approved, unactivated request.',
        );
      }

      if (
        !request.employee ||
        !request.employeeId ||
        request.employee.id !== request.employeeId ||
        request.employee.status !== EmployeeStatus.ACTIVE ||
        request.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
        request.employee.archivedAt ||
        request.employee.isActivated ||
        request.employee.account
      ) {
        throw new ConflictException(
          'The linked employee is not eligible for account activation.',
        );
      }

      if (
        !request.divisionId ||
        !request.division ||
        !request.division.isActive ||
        (request.departmentId
          ? !request.department ||
            !request.department.isActive ||
            request.department.divisionId !== request.divisionId
          : request.requestedRole !== AccountRole.SENIOR_MANAGEMENT)
      ) {
        throw new ConflictException(
          'The request organization assignment is not eligible for activation.',
        );
      }

      const cooldownRemaining =
        this.activationInvitationsService.getResendCooldownRemainingSeconds(
          request.activationEmailLastAttemptAt,
          now,
        );

      if (cooldownRemaining > 0) {
        throw new HttpException(
          `Wait ${cooldownRemaining} seconds before resending the activation email.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      /*
       * Optimistically claim the resend before invalidating the previous link.
       * Concurrent requests cannot both deliver separate activation emails.
       */
      const resendClaim = await transaction.accountRequest.updateMany({
        where: {
          id: request.id,
          employeeId: request.employee.id,
          status: request.status,
          activationEmailStatus: request.activationEmailStatus,
          activationEmailLastAttemptAt: request.activationEmailLastAttemptAt,
        },
        data: {
          activationEmailStatus: ActivationEmailDeliveryStatus.PENDING,
          activationEmailLastAttemptAt: now,
          activationEmailSentAt: null,
          activationEmailFailureCategory: null,
        },
      });

      if (resendClaim.count !== 1) {
        throw new ConflictException(
          'The activation email state changed before the resend could begin.',
        );
      }

      const invitation =
        await this.activationInvitationsService.queueInvitation(
          transaction,
          {
            accountRequestId: request.id,
            employeeId: request.employee.id,
            actorAccountId: user.accountId,
            source: 'AUTHORIZED_RESEND',
            ipAddress,
            userAgent,
          },
          preparedInvitation,
        );

      /*
       * Audit metadata contains only internal identifiers and delivery state.
       * It intentionally excludes raw tokens, OTPs, passwords, SMTP payloads,
       * provider stack traces, and complete phone numbers.
       */
      await transaction.accountRequestAction.create({
        data: {
          accountRequestId: request.id,
          actorAccountId: user.accountId,
          action: AccountRequestActionType.ACTIVATION_EMAIL_RESENT,
          ipAddress,
          userAgent,
          metadata: {
            source: 'AUTHORIZED_RESEND',
            authorization:
              user.role === AccountRole.SUPER_ADMIN
                ? 'SUPER_ADMIN'
                : 'ORIGINAL_REQUESTER',
            employeeId: request.employee.id,
            invitationId: invitation.id,
            previousDeliveryStatus: request.activationEmailStatus,
            requestedRole: request.requestedRole,
            expiresAt: invitation.expiresAt.toISOString(),
          },
        },
      });

      return {
        invitation,
        request: {
          id: request.id,
          status: request.status,
          requestedRole: request.requestedRole,
        },
        employee: request.employee,
        divisionName: request.division.name,
        departmentName: request.department?.name ?? null,
      };
    });

    /*
     * Delivery is deliberately outside the approval/resend transaction. SMTP
     * failure is recorded as FAILED and cannot roll back the approved employee
     * or the authoritative account-request state.
     */
    const activationEmailDelivery =
      await this.activationInvitationsService.deliverQueuedInvitation({
        ...queued.invitation,
        employeeName: queued.employee.empName,
        employeeCode: queued.employee.empId,
        officialEmail: queued.employee.officialEmail,
        phoneNumber: queued.employee.phoneNumber,
        divisionName: queued.divisionName,
        departmentName: queued.departmentName,
        requestedRole: queued.request.requestedRole,
      });

    return {
      message:
        activationEmailDelivery.status === ActivationEmailDeliveryStatus.SENT
          ? 'Activation email sent successfully.'
          : activationEmailDelivery.status ===
              ActivationEmailDeliveryStatus.FAILED
            ? 'The account remains approved, but activation email delivery failed.'
            : 'Activation email delivery is still being confirmed.',
      accountRequest: {
        ...queued.request,
        activationEmailStatus: activationEmailDelivery.status,
        activationEmailLastAttemptAt: activationEmailDelivery.attemptedAt,
        activationEmailSentAt: activationEmailDelivery.sentAt,
        activationEmailFailureCategory: activationEmailDelivery.failureCategory,
      },
      activationEmailDelivery,
      resendAvailableAt: this.activationInvitationsService.getResendAvailableAt(
        activationEmailDelivery.attemptedAt,
      ),
    };
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
            ...activationEmailDeliverySelect,
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

  private normalizeClosureReason(rawReason: string): string {
    const reason = rawReason.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'A reason of at least 3 characters is required.',
      );
    }

    if (reason.length > 500) {
      throw new BadRequestException('The reason cannot exceed 500 characters.');
    }

    return reason;
  }

  private async closeUnactivatedRequest(
    actorAccountId: string,
    requestId: string,
    rawReason: string,
    metadata: RequestMetadata,
    options: {
      closureType: 'CANCELLED' | 'INVALIDATED';

      allowedStatuses: AccountRequestStatus[];

      requestedByAccountId?: string;

      notFoundMessage: string;
    },
  ) {
    const reason = this.normalizeClosureReason(rawReason);

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;

    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    return this.prisma.$transaction(async (transaction) => {
      const request = await transaction.accountRequest.findFirst({
        where: {
          id: requestId,

          ...(options.requestedByAccountId
            ? {
                requestedByAccountId: options.requestedByAccountId,
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
        throw new NotFoundException(options.notFoundMessage);
      }

      if (!options.allowedStatuses.includes(request.status)) {
        throw new ConflictException(
          options.closureType === 'CANCELLED'
            ? 'Only a pending or unactivated account request can be cancelled.'
            : 'Only an approved or activation-pending account request can be invalidated.',
        );
      }

      if (
        request.employee &&
        (request.employee.isActivated || request.employee.account)
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
      const closeClaim = await transaction.accountRequest.updateMany({
        where: {
          id: request.id,
          status: request.status,

          ...(options.requestedByAccountId
            ? {
                requestedByAccountId: options.requestedByAccountId,
              }
            : {}),
        },

        data: {
          status: AccountRequestStatus.REJECTED,

          rejectionReason: reason,

          employeeId: null,

          /*
           * Closing an unactivated request removes its usable invitation.
           * Historical delivery events remain available in the audit trail.
           */
          activationEmailStatus: ActivationEmailDeliveryStatus.NOT_SENT,
          activationEmailLastAttemptAt: null,
          activationEmailSentAt: null,
          activationEmailFailureCategory: null,
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
        await transaction.managementPosition.updateMany({
          where: {
            reservedByAccountRequestId: request.id,
          },

          data: {
            reservedByAccountRequestId: null,
          },
        });

      let provisionalEmployeeDeleted = false;

      if (request.employee) {
        /*
         * Remove all unused OTP records before deleting
         * the unactivated provisional employee identity.
         */
        await transaction.otpVerification.deleteMany({
          where: {
            employeeId: request.employee.id,
          },
        });

        const deletedEmployee = await transaction.employee.deleteMany({
          where: {
            id: request.employee.id,

            isActivated: false,

            account: {
              is: null,
            },
          },
        });

        if (deletedEmployee.count !== 1) {
          throw new ConflictException(
            'The provisional employee identity could not be safely removed.',
          );
        }

        provisionalEmployeeDeleted = true;
      }

      await transaction.accountRequestAction.create({
        data: {
          accountRequestId: request.id,

          actorAccountId,

          /*
           * Existing enum value is used while metadata
           * records the exact closure operation.
           */
          action: AccountRequestActionType.REJECTED,

          reason,
          ipAddress,
          userAgent,

          metadata: {
            closureType: options.closureType,

            previousStatus: request.status,

            newStatus: AccountRequestStatus.REJECTED,

            releasedReservation: reservationRelease.count === 1,

            provisionalEmployeeDeleted,
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
          ...activationEmailDeliverySelect,
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
    });
  }

  async cancelRequest(
    user: AuthenticatedUser,
    id: string,
    reason: string,
    metadata: RequestMetadata,
  ) {
    const requester = await this.getRequester(user);

    const accountRequest = await this.closeUnactivatedRequest(
      requester.id,
      id,
      reason,
      metadata,
      {
        closureType: 'CANCELLED',

        allowedStatuses: [
          AccountRequestStatus.PENDING_APPROVAL,

          AccountRequestStatus.APPROVED,

          AccountRequestStatus.ACTIVATION_PENDING,
        ],

        requestedByAccountId: requester.id,

        notFoundMessage: 'Your account request was not found.',
      },
    );

    return {
      message: 'Account request cancelled successfully.',

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

    const accountRequest = await this.closeUnactivatedRequest(
      user.accountId,
      id,
      reason,
      metadata,
      {
        closureType: 'INVALIDATED',

        allowedStatuses: [
          AccountRequestStatus.APPROVED,

          AccountRequestStatus.ACTIVATION_PENDING,
        ],

        notFoundMessage: 'Account request was not found.',
      },
    );

    return {
      message: 'Account request invalidated successfully.',

      accountRequest,
    };
  }

  async listDivisionEmployeeRequests(
    user: AuthenticatedUser,
    query: ListAccountRequestsQueryDto,
  ) {
    const requester = await this.getRequester(user);
    const divisionId = requester.employee?.divisionId;

    if (requester.role !== AccountRole.SENIOR_MANAGEMENT || !divisionId) {
      throw new ForbiddenException(
        'Only Senior Management can view employee requests inside its assigned division.',
      );
    }

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    // The authenticated division is the security boundary. Frontend filters can only narrow it.
    const where: Prisma.AccountRequestWhereInput = {
      ...this.buildRequestListFilters(query),
      requestedRole: AccountRole.EMPLOYEE,
      divisionId,
      requestedBy: {
        is: {
          role: AccountRole.TEAM_MANAGER,
          employee: {
            is: {
              divisionId,
            },
          },
        },
      },
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
          ...activationEmailDeliverySelect,
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
      scope: {
        divisionId,
        requestedRole: AccountRole.EMPLOYEE,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async getDivisionEmployeeRequest(user: AuthenticatedUser, id: string) {
    const requester = await this.getRequester(user);
    const divisionId = requester.employee?.divisionId;

    if (requester.role !== AccountRole.SENIOR_MANAGEMENT || !divisionId) {
      throw new ForbiddenException(
        'Only Senior Management can view employee requests inside its assigned division.',
      );
    }

    const accountRequest = await this.prisma.accountRequest.findFirst({
      where: {
        id,
        requestedRole: AccountRole.EMPLOYEE,
        divisionId,
        requestedBy: {
          is: {
            role: AccountRole.TEAM_MANAGER,
            employee: {
              is: {
                divisionId,
              },
            },
          },
        },
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
        ...activationEmailDeliverySelect,
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
            createdAt: true,
          },
        },
      },
    });

    if (!accountRequest) {
      throw new NotFoundException(
        'The employee request was not found inside your assigned division.',
      );
    }

    return {
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

    const where: Prisma.AccountRequestWhereInput = {
      requestedByAccountId: user.accountId,
      ...this.buildRequestListFilters(query),
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
          ...activationEmailDeliverySelect,
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
        ...activationEmailDeliverySelect,
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
