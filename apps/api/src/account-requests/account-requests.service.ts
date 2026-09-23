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
  AccountRequestLifecycleState,
  AccountRequestStatus,
  AccountRequestOrganizationRole,
  AccountClass,
  AccountRole,
  ActivationEmailDeliveryStatus,
  EmployeeStatus,
  EmploymentStatus,
  OrgAssignmentSource,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import { getActivationEmailResendPolicyViolation } from './account-request-activation-email-policy';
import { AccountRequestAuthorityService } from './account-request-authority.service';
import { AccountRequestLifecycleService } from './account-request-lifecycle.service';
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
    private readonly requestAuthority: AccountRequestAuthorityService,
    private readonly lifecycle: AccountRequestLifecycleService,
  ) {}

  private assertSuperAdmin(user: AuthenticatedUser) {
    if (user.accountClass !== AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can review account requests.',
      );
    }
  }

  private async getRequester(user: AuthenticatedUser) {
    const requester = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
        id: true,
        accountClass: true,
        isEnabled: true,
        employee: {
          select: {
            id: true,
            status: true,
            employmentStatus: true,
            archivedAt: true,
          },
        },
      },
    });

    if (
      !requester ||
      !requester.isEnabled ||
      requester.accountClass !== AccountClass.OFFICE_USER ||
      user.accountClass !== AccountClass.OFFICE_USER
    ) {
      throw new ForbiddenException(
        'Your authenticated Office account cannot manage account requests.',
      );
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
      ...(query.officeId ? { officeId: query.officeId } : {}),
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

  async getRequestContext(user: AuthenticatedUser) {
    const context = await this.requestAuthority.getCreatorContext(user);

    return {
      accountClass: context.requester.accountClass,

      authority: context.authority,
      office: context.office,
      primaryOrgUnit: context.primaryOrgUnit,
      orgUnits: context.requestableOrgUnits,
      scope: {
        office: context.office,
        orgUnit: context.primaryOrgUnit,
      },
    };
  }

  async createRequest(
    user: AuthenticatedUser,
    dto: CreateAccountRequestDto,
    metadata: RequestMetadata,
  ) {
    const target = await this.requestAuthority.resolveCreateTarget(user, {
      officeId: dto.officeId,
      intendedOrgUnitId: dto.intendedOrgUnitId,
      requestedOrganizationRole: dto.requestedOrganizationRole,
    });

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
            employmentStatus: EmploymentStatus.ACTIVE,
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
        lifecycleState: {
          not: AccountRequestLifecycleState.REJECTED,
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
        lifecycleState: true,
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
        const currentTarget = await transaction.orgUnit.findFirst({
          where: {
            id: target.intendedOrgUnit.id,
            officeId: target.office.id,
            isActive: true,
          },
          select: {
            id: true,
          },
        });

        if (!currentTarget) {
          throw new ConflictException(
            'The intended OrgUnit is no longer active in the selected Office.',
          );
        }

        const createdRequest = await transaction.accountRequest.create({
          data: {
            empId,
            empName,
            phoneNumber,
            officialEmail,
            designation,

            /*
             * Legacy role remains required by the compatibility schema, but
             * organizational authority is no longer encoded in it. New V3
             * requests therefore provision the ordinary Office-user class.
             */
            requestedRole: AccountRole.EMPLOYEE,
            requestedOrganizationRole: target.requestedOrganizationRole,

            lifecycleState: AccountRequestLifecycleState.REQUESTED,
            officeId: target.office.id,
            intendedOrgUnitId: target.intendedOrgUnit.id,

            /*
             * Phase 13 stops projecting new account requests back into the
             * retired fixed hierarchy.
             */
            requestedByAccountId: target.requesterId,
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
            requestedOrganizationRole: true,
            lifecycleState: true,
            officeId: true,
            intendedOrgUnitId: true,
            requestedByAccountId: true,
            revisionNumber: true,
            status: true,
            ...activationEmailDeliverySelect,
            submittedAt: true,
            createdAt: true,
            updatedAt: true,

            office: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },

            intendedOrgUnit: {
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
            actorAccountId: target.requesterId,
            action: AccountRequestActionType.SUBMITTED,
            ipAddress,
            userAgent,

            metadata: {
              lifecycleState: AccountRequestLifecycleState.REQUESTED,
              officeId: target.office.id,
              intendedOrgUnitId: target.intendedOrgUnit.id,
              requestedOrganizationRole: target.requestedOrganizationRole,
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
    const rejectedRequest = await this.prisma.accountRequest.findFirst({
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
        officeId: true,
        intendedOrgUnitId: true,
        requestedOrganizationRole: true,
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

    const intendedOrgUnitId =
      dto.intendedOrgUnitId ?? rejectedRequest.intendedOrgUnitId;

    if (!intendedOrgUnitId) {
      throw new BadRequestException(
        'Intended OrgUnit is required when resubmitting an account request.',
      );
    }

    const requestedOrganizationRole =
      dto.requestedOrganizationRole ??
      rejectedRequest.requestedOrganizationRole;

    const target = await this.requestAuthority.resolveCreateTarget(user, {
      officeId: rejectedRequest.officeId ?? undefined,
      intendedOrgUnitId,
      requestedOrganizationRole,
    });

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

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;
    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const resubmittedRequest = await this.prisma.$transaction(
      async (transaction) => {
        const previousRequest = await transaction.accountRequest.findFirst({
          where: {
            id: rejectedRequest.id,
            requestedByAccountId: target.requesterId,
          },
          select: {
            id: true,
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

        const currentTarget = await transaction.orgUnit.findFirst({
          where: {
            id: target.intendedOrgUnit.id,
            officeId: target.office.id,
            isActive: true,
          },
          select: {
            id: true,
          },
        });

        if (!currentTarget) {
          throw new ConflictException(
            'The intended OrgUnit is no longer active in the selected Office.',
          );
        }

        const existingEmployee = await transaction.employee.findFirst({
          where: {
            OR: [
              { empId },
              {
                officialEmail: {
                  equals: officialEmailLookup,
                  mode: 'insensitive',
                },
              },
              {
                employmentStatus: EmploymentStatus.ACTIVE,
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
                { empId },
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
            requestedRole: AccountRole.EMPLOYEE,
            requestedOrganizationRole: target.requestedOrganizationRole,
            lifecycleState: AccountRequestLifecycleState.REQUESTED,
            officeId: target.office.id,
            intendedOrgUnitId: target.intendedOrgUnit.id,
            requestedByAccountId: target.requesterId,
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
            requestedOrganizationRole: true,
            lifecycleState: true,
            officeId: true,
            intendedOrgUnitId: true,
            requestedByAccountId: true,
            previousRequestId: true,
            revisionNumber: true,
            status: true,
            ...activationEmailDeliverySelect,
            submittedAt: true,
            createdAt: true,
            updatedAt: true,
            office: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            intendedOrgUnit: {
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
            actorAccountId: target.requesterId,
            action: AccountRequestActionType.RESUBMITTED,
            ipAddress,
            userAgent,
            metadata: {
              previousRequestId: previousRequest.id,
              previousRevisionNumber: previousRequest.revisionNumber,
              revisionNumber,
              officeId: target.office.id,
              intendedOrgUnitId: target.intendedOrgUnit.id,
              requestedOrganizationRole: target.requestedOrganizationRole,
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

  async getAdminRequestSummary(user: AuthenticatedUser, officeId?: string) {
    this.assertSuperAdmin(user);

    const officeWhere: Prisma.AccountRequestWhereInput = officeId
      ? { officeId }
      : {};

    const requestListSelect = {
      id: true,
      empId: true,
      empName: true,
      officialEmail: true,
      designation: true,
      requestedRole: true,
      requestedOrganizationRole: true,
      revisionNumber: true,
      status: true,
      ...activationEmailDeliverySelect,
      rejectionReason: true,
      submittedAt: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,

      office: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      },

      intendedOrgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          orgUnitType: { select: { code: true, name: true } },
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
          where: officeWhere,
          orderBy: {
            status: 'asc',
          },
          _count: {
            id: true,
          },
        }),

        this.prisma.accountRequest.findMany({
          where: {
            ...officeWhere,
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
            ...officeWhere,
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
      officeId: officeId ?? null,
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
          requestedOrganizationRole: true,
          revisionNumber: true,
          status: true,
          ...activationEmailDeliverySelect,
          rejectionReason: true,
          submittedAt: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,

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

          office: {
            select: { id: true, code: true, name: true, isActive: true },
          },
          intendedOrgUnit: {
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
              orgUnitType: { select: { code: true, name: true } },
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
        officeId: query.officeId,
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
        requestedOrganizationRole: true,
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

        office: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },

        intendedOrgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            orgUnitType: { select: { code: true, name: true } },
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

  private normalizeReviewReason(rawReason: string): string {
    const reason = rawReason.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'A review reason of at least 3 characters is required.',
      );
    }

    if (reason.length > 500) {
      throw new BadRequestException(
        'The review reason cannot exceed 500 characters.',
      );
    }

    return reason;
  }

  private isV3ProvisioningCandidate(request: {
    officeId: string | null;
    intendedOrgUnitId: string | null;
    requestedRole: AccountRole;
    requestedOrganizationRole: AccountRequestOrganizationRole;
  }): boolean {
    return Boolean(
      request.officeId &&
      request.intendedOrgUnitId &&
      request.requestedRole === AccountRole.EMPLOYEE &&
      (request.requestedOrganizationRole ===
        AccountRequestOrganizationRole.EMPLOYEE ||
        request.requestedOrganizationRole ===
          AccountRequestOrganizationRole.ORG_UNIT_HEAD),
    );
  }

  async startReview(
    user: AuthenticatedUser,
    id: string,
    metadata: RequestMetadata,
  ) {
    this.assertSuperAdmin(user);

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;
    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const accountRequest = await this.prisma.$transaction(
      async (transaction) => {
        const request = await transaction.accountRequest.findUnique({
          where: { id },
          select: {
            id: true,
            lifecycleState: true,
            status: true,
          },
        });

        if (!request) {
          throw new NotFoundException('Account request was not found.');
        }

        this.lifecycle.assertTransition(
          request.lifecycleState,
          AccountRequestLifecycleState.UNDER_REVIEW,
        );

        const claim = await transaction.accountRequest.updateMany({
          where: {
            id: request.id,
            lifecycleState: AccountRequestLifecycleState.REQUESTED,
            status: AccountRequestStatus.PENDING_APPROVAL,
          },
          data: {
            lifecycleState: AccountRequestLifecycleState.UNDER_REVIEW,
          },
        });

        if (claim.count !== 1) {
          throw new ConflictException(
            'This account request changed before review could begin.',
          );
        }

        await transaction.accountRequestAction.create({
          data: {
            accountRequestId: request.id,
            actorAccountId: user.accountId,
            action: AccountRequestActionType.REVIEW_STARTED,
            ipAddress,
            userAgent,
          },
        });

        return transaction.accountRequest.findUniqueOrThrow({
          where: { id: request.id },
          select: {
            id: true,
            lifecycleState: true,
            status: true,
            updatedAt: true,
          },
        });
      },
    );

    return {
      message: 'Account request review started.',
      accountRequest,
    };
  }

  async returnForCorrection(
    user: AuthenticatedUser,
    id: string,
    rawReason: string,
    metadata: RequestMetadata,
  ) {
    this.assertSuperAdmin(user);

    const reason = this.normalizeReviewReason(rawReason);
    const reviewedAt = new Date();
    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;
    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const accountRequest = await this.prisma.$transaction(
      async (transaction) => {
        const request = await transaction.accountRequest.findUnique({
          where: { id },
          select: {
            id: true,
            lifecycleState: true,
            status: true,
          },
        });

        if (!request) {
          throw new NotFoundException('Account request was not found.');
        }

        this.lifecycle.assertTransition(
          request.lifecycleState,
          AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
        );

        const claim = await transaction.accountRequest.updateMany({
          where: {
            id: request.id,
            lifecycleState: AccountRequestLifecycleState.UNDER_REVIEW,
            status: AccountRequestStatus.PENDING_APPROVAL,
          },
          data: {
            lifecycleState:
              AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
            // Compatibility projection until the old status enum is retired.
            status: AccountRequestStatus.REJECTED,
            rejectionReason: reason,
            reviewedByAccountId: user.accountId,
            reviewedAt,
          },
        });

        if (claim.count !== 1) {
          throw new ConflictException(
            'This account request changed before it could be returned.',
          );
        }

        await transaction.accountRequestAction.create({
          data: {
            accountRequestId: request.id,
            actorAccountId: user.accountId,
            action: AccountRequestActionType.RETURNED_FOR_CORRECTION,
            reason,
            ipAddress,
            userAgent,
            metadata: {
              previousLifecycleState: AccountRequestLifecycleState.UNDER_REVIEW,
              newLifecycleState:
                AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
            },
          },
        });

        return transaction.accountRequest.findUniqueOrThrow({
          where: { id: request.id },
          select: {
            id: true,
            lifecycleState: true,
            status: true,
            rejectionReason: true,
            reviewedAt: true,
            updatedAt: true,
          },
        });
      },
    );

    return {
      message: 'Account request returned for correction.',
      accountRequest,
    };
  }

  private async approveV3Request(
    user: AuthenticatedUser,
    id: string,
    metadata: RequestMetadata,
  ) {
    const reviewedAt = new Date();
    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;
    const userAgent = metadata.userAgent?.slice(0, 500) || null;
    const preparedInvitation =
      this.activationInvitationsService.prepareInvitation(reviewedAt);

    const provisioned = await this.prisma.$transaction(async (transaction) => {
      const request = await transaction.accountRequest.findUnique({
        where: { id },
        select: {
          id: true,
          empId: true,
          empName: true,
          phoneNumber: true,
          officialEmail: true,
          designation: true,
          requestedRole: true,
          requestedOrganizationRole: true,
          lifecycleState: true,
          status: true,
          officeId: true,
          intendedOrgUnitId: true,
          office: {
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
            },
          },
          intendedOrgUnit: {
            select: {
              id: true,
              officeId: true,
              code: true,
              name: true,
              isActive: true,
              orgUnitType: {
                select: {
                  code: true,
                  name: true,
                  isActive: true,
                  isTeam: true,
                },
              },
            },
          },
        },
      });

      if (!request) {
        throw new NotFoundException('Account request was not found.');
      }

      if (!this.isV3ProvisioningCandidate(request)) {
        throw new BadRequestException(
          'This account request is not eligible for V3 provisioning.',
        );
      }

      if (
        request.lifecycleState !== AccountRequestLifecycleState.REQUESTED &&
        request.lifecycleState !== AccountRequestLifecycleState.UNDER_REVIEW
      ) {
        throw new ConflictException(
          'Only a requested or under-review account request can be approved.',
        );
      }

      if (request.status !== AccountRequestStatus.PENDING_APPROVAL) {
        throw new ConflictException(
          'Only a pending account request can be approved.',
        );
      }

      if (
        !request.officeId ||
        !request.intendedOrgUnitId ||
        !request.office ||
        !request.intendedOrgUnit ||
        request.intendedOrgUnit.officeId !== request.officeId
      ) {
        throw new BadRequestException(
          'The account request does not have a valid Office and intended OrgUnit.',
        );
      }

      if (
        !request.office.isActive ||
        !request.intendedOrgUnit.isActive ||
        !request.intendedOrgUnit.orgUnitType.isActive ||
        request.intendedOrgUnit.orgUnitType.isTeam
      ) {
        throw new ConflictException(
          'The intended Office or OrgUnit is inactive.',
        );
      }

      if (
        request.requestedOrganizationRole ===
        AccountRequestOrganizationRole.ORG_UNIT_HEAD
      ) {
        const currentHead = await transaction.orgLeadershipAssignment.findFirst(
          {
            where: {
              officeId: request.officeId,
              orgUnitId: request.intendedOrgUnitId,
              leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
              effectiveFrom: { lte: reviewedAt },
              OR: [
                { effectiveUntil: null },
                { effectiveUntil: { gt: reviewedAt } },
              ],
            },
            select: { id: true },
          },
        );

        if (currentHead) {
          throw new ConflictException(
            'This organization unit already has a current Head. Change the existing Head through Organization Management instead.',
          );
        }
      }

      const {
        empId,
        empName,
        phoneNumber,
        phoneLookupValues,
        officialEmail,
        officialEmailLookup,
      } = normalizeAccountIdentity(request);

      const duplicateEmployee = await transaction.employee.findFirst({
        where: {
          OR: [
            { empId },
            {
              officialEmail: {
                equals: officialEmailLookup,
                mode: 'insensitive',
              },
            },
            {
              employmentStatus: EmploymentStatus.ACTIVE,
              phoneNumber: {
                in: phoneLookupValues,
              },
            },
          ],
        },
        select: { id: true },
      });

      if (duplicateEmployee) {
        throw new ConflictException(
          'An employee with this employee ID, phone number, or official email already exists.',
        );
      }

      if (request.lifecycleState === AccountRequestLifecycleState.REQUESTED) {
        this.lifecycle.assertTransition(
          AccountRequestLifecycleState.REQUESTED,
          AccountRequestLifecycleState.UNDER_REVIEW,
        );

        const reviewClaim = await transaction.accountRequest.updateMany({
          where: {
            id: request.id,
            lifecycleState: AccountRequestLifecycleState.REQUESTED,
            status: AccountRequestStatus.PENDING_APPROVAL,
          },
          data: {
            lifecycleState: AccountRequestLifecycleState.UNDER_REVIEW,
          },
        });

        if (reviewClaim.count !== 1) {
          throw new ConflictException(
            'This account request changed before review could begin.',
          );
        }

        await transaction.accountRequestAction.create({
          data: {
            accountRequestId: request.id,
            actorAccountId: user.accountId,
            action: AccountRequestActionType.REVIEW_STARTED,
            ipAddress,
            userAgent,
            metadata: {
              source: 'SUPER_ADMIN_APPROVAL_COMPATIBILITY',
            },
          },
        });
      }

      this.lifecycle.assertTransition(
        AccountRequestLifecycleState.UNDER_REVIEW,
        AccountRequestLifecycleState.APPROVED,
      );

      const approvalClaim = await transaction.accountRequest.updateMany({
        where: {
          id: request.id,
          lifecycleState: AccountRequestLifecycleState.UNDER_REVIEW,
          status: AccountRequestStatus.PENDING_APPROVAL,
        },
        data: {
          lifecycleState: AccountRequestLifecycleState.APPROVED,
          status: AccountRequestStatus.APPROVED,
          reviewedByAccountId: user.accountId,
          reviewedAt,
          rejectionReason: null,
        },
      });

      if (approvalClaim.count !== 1) {
        throw new ConflictException(
          'This account request changed before it could be approved.',
        );
      }

      await transaction.accountRequestAction.create({
        data: {
          accountRequestId: request.id,
          actorAccountId: user.accountId,
          action: AccountRequestActionType.APPROVED,
          ipAddress,
          userAgent,
          metadata: {
            officeId: request.officeId,
            intendedOrgUnitId: request.intendedOrgUnitId,
            requestedOrganizationRole: request.requestedOrganizationRole,
          },
        },
      });

      const employee = await transaction.employee.create({
        data: {
          empId,
          empName,
          phoneNumber,
          officialEmail,
          designation: request.designation,
          department: null,
          status: EmployeeStatus.ACTIVE,
          isActivated: false,
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
        },
      });

      const membership = await transaction.orgMembership.create({
        data: {
          employeeId: employee.id,
          officeId: request.officeId,
          orgUnitId: request.intendedOrgUnitId,
          membershipType: OrgMembershipType.PRIMARY,
          assignmentSource: OrgAssignmentSource.ACCOUNT_PROVISIONING,
          startsAt: reviewedAt,
          assignedByAccountId: user.accountId,
          assignmentReason:
            'Applied from the Office-approved intended OrgUnit during account provisioning.',
        },
        select: {
          id: true,
          officeId: true,
          orgUnitId: true,
          membershipType: true,
          assignmentSource: true,
          startsAt: true,
        },
      });

      const leadership =
        request.requestedOrganizationRole ===
        AccountRequestOrganizationRole.ORG_UNIT_HEAD
          ? await transaction.orgLeadershipAssignment.create({
              data: {
                employeeId: employee.id,
                officeId: request.officeId,
                orgUnitId: request.intendedOrgUnitId,
                leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
                assignmentSource: OrgAssignmentSource.ACCOUNT_PROVISIONING,
                effectiveFrom: reviewedAt,
                assignedByAccountId: user.accountId,
                assignmentReason:
                  'Leadership requested by the authorized parent Head and provisioned after Super Admin approval.',
              },
              select: {
                id: true,
                officeId: true,
                orgUnitId: true,
                leadershipType: true,
                effectiveFrom: true,
              },
            })
          : null;

      this.lifecycle.assertTransition(
        AccountRequestLifecycleState.APPROVED,
        AccountRequestLifecycleState.PROVISIONED,
      );

      const provisionedRequest = await transaction.accountRequest.update({
        where: { id: request.id },
        data: {
          empId,
          empName,
          phoneNumber,
          officialEmail,
          employeeId: employee.id,
          lifecycleState: AccountRequestLifecycleState.PROVISIONED,
          // Existing activation services move APPROVED to ACTIVATION_PENDING
          // only when the employee actually starts the security flow.
          status: AccountRequestStatus.APPROVED,
        },
        select: {
          id: true,
          empId: true,
          empName: true,
          officialEmail: true,
          requestedRole: true,
          requestedOrganizationRole: true,
          lifecycleState: true,
          officeId: true,
          intendedOrgUnitId: true,
          employeeId: true,
          revisionNumber: true,
          status: true,
          ...activationEmailDeliverySelect,
          rejectionReason: true,
          submittedAt: true,
          reviewedAt: true,
          updatedAt: true,
        },
      });

      await transaction.accountRequestAction.create({
        data: {
          accountRequestId: request.id,
          actorAccountId: user.accountId,
          action: AccountRequestActionType.PROVISIONED,
          ipAddress,
          userAgent,
          metadata: {
            employeeId: employee.id,
            membershipId: membership.id,
            officeId: request.officeId,
            intendedOrgUnitId: request.intendedOrgUnitId,
            assignmentSource: OrgAssignmentSource.ACCOUNT_PROVISIONING,
            requestedOrganizationRole: request.requestedOrganizationRole,
            leadershipAssignmentId: leadership?.id ?? null,
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
        accountRequest: provisionedRequest,
        employee,
        membership,
        leadership,
        invitation,
        officeName: request.office.name,
        orgUnitName: request.intendedOrgUnit.name,
      };
    });

    const activationEmailDelivery =
      await this.activationInvitationsService.deliverQueuedInvitation({
        ...provisioned.invitation,
        employeeName: provisioned.employee.empName,
        employeeCode: provisioned.employee.empId,
        officialEmail: provisioned.employee.officialEmail,
        phoneNumber: provisioned.employee.phoneNumber,
        divisionName: provisioned.officeName,
        departmentName: provisioned.orgUnitName,
        requestedRole: provisioned.accountRequest.requestedRole,
      });

    return {
      message: 'Account request approved and provisioned successfully.',
      accountRequest: {
        ...provisioned.accountRequest,
        activationEmailStatus: activationEmailDelivery.status,
        activationEmailLastAttemptAt: activationEmailDelivery.attemptedAt,
        activationEmailSentAt: activationEmailDelivery.sentAt,
        activationEmailFailureCategory: activationEmailDelivery.failureCategory,
      },
      employee: provisioned.employee,
      membership: provisioned.membership,
      leadership: provisioned.leadership,
      activationEmailDelivery,
    };
  }

  async approveRequest(
    user: AuthenticatedUser,
    id: string,
    metadata: RequestMetadata,
  ) {
    this.assertSuperAdmin(user);

    const provisioningCandidate = await this.prisma.accountRequest.findUnique({
      where: { id },
      select: {
        officeId: true,
        intendedOrgUnitId: true,
        requestedRole: true,
        requestedOrganizationRole: true,
      },
    });

    if (!provisioningCandidate) {
      throw new NotFoundException('Account request was not found.');
    }

    if (!this.isV3ProvisioningCandidate(provisioningCandidate)) {
      throw new ConflictException(
        'This historical account request must be reconciled to an Office and OrgUnit before approval.',
      );
    }

    return this.approveV3Request(user, id, metadata);
  }

  async resendActivationEmail(
    user: AuthenticatedUser,
    id: string,
    metadata: RequestMetadata,
  ) {
    const requesterContext =
      user.accountClass === AccountClass.SUPER_ADMIN
        ? null
        : await this.requestAuthority.getCreatorContext(user);

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
          requestedOrganizationRole: true,
          requestedByAccountId: true,
          status: true,
          officeId: true,
          intendedOrgUnitId: true,
          employeeId: true,
          office: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
          intendedOrgUnit: {
            select: {
              id: true,
              name: true,
              officeId: true,
              isActive: true,
            },
          },
          activationEmailStatus: true,
          activationEmailLastAttemptAt: true,
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
       * No requester identity or organizational scope from the browser
       * is trusted for this decision.
       */
      const policyViolation = getActivationEmailResendPolicyViolation(
        requesterContext
          ? {
              accountId: requesterContext.requester.id,
              accountClass: AccountClass.OFFICE_USER,
              officeId: requesterContext.office.id,
              requestableOrgUnitIds: requesterContext.requestableOrgUnits.map(
                (orgUnit) => orgUnit.id,
              ),
            }
          : {
              accountId: user.accountId,
              accountClass: AccountClass.SUPER_ADMIN,
              officeId: null,
              requestableOrgUnitIds: [],
            },
        {
          requestedByAccountId: request.requestedByAccountId,
          officeId: request.officeId,
          intendedOrgUnitId: request.intendedOrgUnitId,
        },
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

      const v3OrganizationEligible = Boolean(
        request.officeId &&
        request.intendedOrgUnitId &&
        request.office?.isActive &&
        request.intendedOrgUnit?.isActive &&
        request.intendedOrgUnit.officeId === request.officeId,
      );

      if (!v3OrganizationEligible) {
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
              user.accountClass === AccountClass.SUPER_ADMIN
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
        divisionName: request.office?.name ?? 'Not assigned',
        departmentName: request.intendedOrgUnit?.name ?? null,
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

    const reason = this.normalizeReviewReason(rawReason);

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
            lifecycleState: true,
            status: true,
          },
        });

        if (!request) {
          throw new NotFoundException('Account request was not found.');
        }

        if (
          request.lifecycleState !== AccountRequestLifecycleState.REQUESTED &&
          request.lifecycleState !== AccountRequestLifecycleState.UNDER_REVIEW
        ) {
          throw new ConflictException(
            'Only a requested or under-review account request can be rejected.',
          );
        }

        if (request.status !== AccountRequestStatus.PENDING_APPROVAL) {
          throw new ConflictException(
            'Only a pending account request can be rejected.',
          );
        }

        if (request.lifecycleState === AccountRequestLifecycleState.REQUESTED) {
          this.lifecycle.assertTransition(
            AccountRequestLifecycleState.REQUESTED,
            AccountRequestLifecycleState.UNDER_REVIEW,
          );

          const startReviewClaim = await transaction.accountRequest.updateMany({
            where: {
              id: request.id,
              lifecycleState: AccountRequestLifecycleState.REQUESTED,
              status: AccountRequestStatus.PENDING_APPROVAL,
            },
            data: {
              lifecycleState: AccountRequestLifecycleState.UNDER_REVIEW,
            },
          });

          if (startReviewClaim.count !== 1) {
            throw new ConflictException(
              'This account request changed before review could begin.',
            );
          }

          await transaction.accountRequestAction.create({
            data: {
              accountRequestId: request.id,
              actorAccountId: user.accountId,
              action: AccountRequestActionType.REVIEW_STARTED,
              ipAddress,
              userAgent,
              metadata: {
                source: 'SUPER_ADMIN_REJECTION_COMPATIBILITY',
              },
            },
          });
        }

        this.lifecycle.assertTransition(
          AccountRequestLifecycleState.UNDER_REVIEW,
          AccountRequestLifecycleState.REJECTED,
        );

        const reviewClaim = await transaction.accountRequest.updateMany({
          where: {
            id: request.id,
            lifecycleState: AccountRequestLifecycleState.UNDER_REVIEW,
            status: AccountRequestStatus.PENDING_APPROVAL,
          },

          data: {
            lifecycleState: AccountRequestLifecycleState.REJECTED,
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
              previousLifecycleState: AccountRequestLifecycleState.UNDER_REVIEW,
              newLifecycleState: AccountRequestLifecycleState.REJECTED,
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
            requestedOrganizationRole: true,
            lifecycleState: true,
            officeId: true,
            intendedOrgUnitId: true,
            employeeId: true,
            revisionNumber: true,
            status: true,
            ...activationEmailDeliverySelect,
            rejectionReason: true,
            submittedAt: true,
            reviewedAt: true,
            updatedAt: true,

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
          requestedOrganizationRole: true,
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

      let provisionalEmployeeDeleted = false;

      if (request.employee) {
        /*
         * Remove all records owned only by this unactivated provisional
         * employee before deleting the employee identity. OrgMembership and
         * OrgLeadershipAssignment deliberately use RESTRICT so normal employee
         * history cannot be erased accidentally; account-request cancellation
         * is the exceptional pre-activation cleanup path.
         */
        await transaction.otpVerification.deleteMany({
          where: {
            employeeId: request.employee.id,
          },
        });

        await transaction.orgLeadershipAssignment.deleteMany({
          where: {
            employeeId: request.employee.id,
            assignmentSource: OrgAssignmentSource.ACCOUNT_PROVISIONING,
          },
        });

        await transaction.orgMembership.deleteMany({
          where: {
            employeeId: request.employee.id,
            assignmentSource: OrgAssignmentSource.ACCOUNT_PROVISIONING,
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
          requestedOrganizationRole: true,
          employeeId: true,
          revisionNumber: true,
          status: true,
          ...activationEmailDeliverySelect,
          rejectionReason: true,
          submittedAt: true,
          reviewedAt: true,
          updatedAt: true,
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
          requestedOrganizationRole: true,
          revisionNumber: true,
          status: true,
          ...activationEmailDeliverySelect,
          rejectionReason: true,
          submittedAt: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,

          office: {
            select: { id: true, code: true, name: true, isActive: true },
          },
          intendedOrgUnit: {
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
              orgUnitType: { select: { code: true, name: true } },
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
        requestedOrganizationRole: true,
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

        office: {
          select: { id: true, code: true, name: true, isActive: true },
        },
        intendedOrgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            orgUnitType: { select: { code: true, name: true } },
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
