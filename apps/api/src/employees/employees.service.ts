import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagingEventsService } from '../realtime/messaging-events.service';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  EmployeeLifecycleActionType,
  EmployeeStatus,
  EmploymentStatus,
  OrgAssignmentSource,
  OrgLeadershipType,
  OrgMembershipType,
  WorkStageStatus,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

import { ArchiveEmployeeDto } from './dto/archive-employee.dto';
import { EndEmployeeEmploymentDto } from './dto/end-employee-employment.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { TransferEmployeeOfficeDto } from './dto/transfer-employee-office.dto';
import { TransferOfficeHeadDto } from './dto/transfer-office-head.dto';
import type { OfficeHeadTransferMode } from './dto/transfer-office-head.dto';
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
    private readonly messagingEvents: MessagingEventsService,
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

    this.messagingEvents.emitDirectoryChanged({
      reason: 'EMPLOYEE_DESIGNATION_UPDATED',
      occurredAt: new Date().toISOString(),
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

    this.messagingEvents.emitDirectoryChanged({
      reason: 'EMPLOYEE_ARCHIVED',
      occurredAt: new Date().toISOString(),
    });

    return {
      message: 'Former employee record archived successfully.',

      employee: result.employee,

      revokedSessions: result.revokedSessions,
    };
  }

  async transferEmployeeOffice(
    user: AuthenticatedUser,
    id: string,
    dto: TransferEmployeeOfficeDto,
    metadata: EmployeeLifecycleMetadata,
  ) {
    return this.transferEmployeeOfficeInternal(user, id, dto, metadata, null);
  }

  async transferOfficeHead(
    user: AuthenticatedUser,
    id: string,
    dto: TransferOfficeHeadDto,
    metadata: EmployeeLifecycleMetadata,
  ) {
    return this.transferEmployeeOfficeInternal(user, id, dto, metadata, {
      replacementEmployeeId: dto.replacementEmployeeId,
      transferAs: dto.transferAs,
    });
  }

  private async transferEmployeeOfficeInternal(
    user: AuthenticatedUser,
    id: string,
    dto: TransferEmployeeOfficeDto | TransferOfficeHeadDto,
    metadata: EmployeeLifecycleMetadata,
    officeHeadTransition: {
      replacementEmployeeId: string;
      transferAs: OfficeHeadTransferMode;
    } | null,
  ) {
    if (user.accountClass !== AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can transfer an employee between Offices.',
      );
    }

    const reason = dto.reason.trim().replace(/\s+/g, ' ');
    if (reason.length < 3) {
      throw new BadRequestException(
        'Office transfer reason must contain at least 3 characters.',
      );
    }

    const now = new Date();
    const effectiveAt = dto.effectiveAt ? new Date(dto.effectiveAt) : now;
    if (Number.isNaN(effectiveAt.getTime())) {
      throw new BadRequestException(
        'Office transfer effective date is invalid.',
      );
    }
    if (effectiveAt.getTime() > now.getTime()) {
      throw new BadRequestException(
        'Office transfer effective date cannot be in the future.',
      );
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id },
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
            accountClass: true,
            isEnabled: true,
          },
        },
        orgMemberships: {
          where: {
            membershipType: OrgMembershipType.PRIMARY,
            endsAt: null,
          },
          orderBy: { startsAt: 'desc' },
          take: 1,
          select: {
            id: true,
            officeId: true,
            orgUnitId: true,
            startsAt: true,
            office: { select: { id: true, code: true, name: true } },
            orgUnit: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }
    if (employee.account?.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The Super Admin identity cannot be transferred between Offices.',
      );
    }
    if (
      employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      employee.archivedAt !== null
    ) {
      throw new ConflictException(
        'Only a current employee can be transferred between Offices.',
      );
    }

    const currentPrimary = employee.orgMemberships[0] ?? null;
    if (!currentPrimary) {
      throw new ConflictException(
        'The employee does not have an open primary Office placement.',
      );
    }
    if (currentPrimary.officeId === dto.targetOfficeId) {
      throw new ConflictException(
        'Use Organization Management for movement inside the same Office.',
      );
    }
    if (effectiveAt.getTime() <= currentPrimary.startsAt.getTime()) {
      throw new BadRequestException(
        'Office transfer time must be later than the current placement start time.',
      );
    }

    const transferAsOfficeHead =
      officeHeadTransition?.transferAs === 'OFFICE_HEAD';

    let targetOrgUnit: {
      id: string;
      code: string;
      name: string;
      officeId: string;
      office: { id: string; code: string; name: string };
    } | null = null;
    let targetOffice: { id: string; code: string; name: string };

    if (transferAsOfficeHead) {
      const office = await this.prisma.office.findFirst({
        where: { id: dto.targetOfficeId, isActive: true },
        select: { id: true, code: true, name: true },
      });
      if (!office) {
        throw new NotFoundException(
          'The selected target Office was not found.',
        );
      }
      targetOffice = office;
    } else {
      if (!dto.targetOrgUnitId) {
        throw new BadRequestException(
          'Select a target organizational unit when transferring as an employee.',
        );
      }

      targetOrgUnit = await this.prisma.orgUnit.findFirst({
        where: {
          id: dto.targetOrgUnitId,
          officeId: dto.targetOfficeId,
          isActive: true,
          office: { is: { isActive: true } },
          orgUnitType: {
            is: {
              isActive: true,
              isTeam: false,
              code: { in: ['DIVISION', 'DEPARTMENT', 'SECTION', 'UNIT'] },
            },
          },
        },
        select: {
          id: true,
          code: true,
          name: true,
          officeId: true,
          office: { select: { id: true, code: true, name: true } },
        },
      });
      if (!targetOrgUnit) {
        throw new NotFoundException(
          'The selected target Office organization unit was not found.',
        );
      }
      targetOffice = targetOrgUnit.office;
    }

    const activeLeadership = await this.prisma.orgLeadershipAssignment.findMany(
      {
        where: {
          employeeId: employee.id,
          officeId: currentPrimary.officeId,
          leadershipType: {
            in: [
              OrgLeadershipType.OFFICE_HEAD,
              OrgLeadershipType.ORG_UNIT_HEAD,
            ],
          },
          effectiveFrom: { lte: effectiveAt },
          OR: [
            { effectiveUntil: null },
            { effectiveUntil: { gt: effectiveAt } },
          ],
        },
        select: {
          id: true,
          leadershipType: true,
          isActing: true,
          effectiveFrom: true,
          orgUnit: { select: { name: true } },
        },
      },
    );

    let currentOfficeHead: { id: string; effectiveFrom: Date } | null = null;
    let replacementEmployee: {
      id: string;
      empId: string;
      empName: string;
      status: EmployeeStatus;
      employmentStatus: EmploymentStatus;
      archivedAt: Date | null;
      account: { id: string; accountClass: AccountClass } | null;
      orgMemberships: Array<{
        id: string;
        orgUnitId: string | null;
        startsAt: Date;
      }>;
    } | null = null;

    if (officeHeadTransition) {
      const head = activeLeadership.find(
        (assignment) =>
          assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD &&
          !assignment.isActing,
      );
      if (!head) {
        throw new ConflictException(
          'This employee is not the current permanent Office Head.',
        );
      }
      if (effectiveAt.getTime() <= head.effectiveFrom.getTime()) {
        throw new BadRequestException(
          'Office Head transfer time must be later than the leadership start time.',
        );
      }
      currentOfficeHead = { id: head.id, effectiveFrom: head.effectiveFrom };

      const otherLeadership = activeLeadership.filter(
        (assignment) => assignment.id !== head.id,
      );
      if (otherLeadership.length > 0) {
        const labels = otherLeadership.map((assignment) =>
          assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD
            ? 'Office Head'
            : `Head of ${assignment.orgUnit?.name ?? 'organization unit'}`,
        );
        throw new ConflictException(
          `Resolve the employee's other formal leadership before Office transfer: ${labels.join(', ')}.`,
        );
      }

      if (officeHeadTransition.replacementEmployeeId === employee.id) {
        throw new ConflictException(
          'Select another office member as the replacement Office Head.',
        );
      }

      replacementEmployee = await this.prisma.employee.findUnique({
        where: { id: officeHeadTransition.replacementEmployeeId },
        select: {
          id: true,
          empId: true,
          empName: true,
          status: true,
          employmentStatus: true,
          archivedAt: true,
          account: {
            select: { id: true, accountClass: true },
          },
          orgMemberships: {
            where: {
              officeId: currentPrimary.officeId,
              membershipType: OrgMembershipType.PRIMARY,
              startsAt: { lte: effectiveAt },
              OR: [{ endsAt: null }, { endsAt: { gt: effectiveAt } }],
            },
            take: 1,
            select: { id: true, orgUnitId: true, startsAt: true },
          },
        },
      });

      if (
        !replacementEmployee ||
        replacementEmployee.status !== EmployeeStatus.ACTIVE ||
        replacementEmployee.employmentStatus !== EmploymentStatus.ACTIVE ||
        replacementEmployee.archivedAt !== null ||
        replacementEmployee.account?.accountClass ===
          AccountClass.SUPER_ADMIN ||
        replacementEmployee.orgMemberships.length === 0
      ) {
        throw new ConflictException(
          'Select an active member of the source Office as the replacement Office Head.',
        );
      }

      const replacementPrimary = replacementEmployee.orgMemberships[0];
      if (
        replacementPrimary.orgUnitId &&
        effectiveAt.getTime() <= replacementPrimary.startsAt.getTime()
      ) {
        throw new BadRequestException(
          'Office Head replacement time must be later than the replacement employee organizational placement start time.',
        );
      }

      if (transferAsOfficeHead) {
        const destinationHead =
          await this.prisma.orgLeadershipAssignment.findFirst({
            where: {
              officeId: dto.targetOfficeId,
              orgUnitId: null,
              leadershipType: OrgLeadershipType.OFFICE_HEAD,
              isActing: false,
              effectiveFrom: { lte: effectiveAt },
              OR: [
                { effectiveUntil: null },
                { effectiveUntil: { gt: effectiveAt } },
              ],
            },
            select: { id: true },
          });
        if (destinationHead) {
          throw new ConflictException(
            'The target Office already has a permanent Office Head. Resolve that assignment first.',
          );
        }
      }
    } else if (activeLeadership.length > 0) {
      const labels = activeLeadership.map((assignment) =>
        assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD
          ? 'Office Head'
          : `Head of ${assignment.orgUnit?.name ?? 'organization unit'}`,
      );
      throw new ConflictException(
        `End or transfer the employee's current formal leadership before Office transfer: ${labels.join(', ')}.`,
      );
    }

    if (employee.account) {
      const [openWorkAssignments, currentDutyAssignments] = await Promise.all([
        this.prisma.workStageAssignment.count({
          where: {
            targetAccountId: employee.account.id,
            endsAt: null,
            workStage: {
              is: {
                status: {
                  notIn: [
                    WorkStageStatus.COMPLETED,
                    WorkStageStatus.SKIPPED,
                    WorkStageStatus.CANCELLED,
                  ],
                },
              },
            },
          },
        }),
        this.prisma.dutyAssignment.count({
          where: {
            employeeAccountId: employee.account.id,
            cancelledAt: null,
            endsAt: { gt: effectiveAt },
          },
        }),
      ]);

      const blockers: string[] = [];
      if (openWorkAssignments > 0) {
        blockers.push(`${openWorkAssignments} open Work assignment(s)`);
      }
      if (currentDutyAssignments > 0) {
        blockers.push(
          `${currentDutyAssignments} current/future Duty assignment(s)`,
        );
      }
      if (blockers.length > 0) {
        throw new ConflictException(
          `Complete or hand off responsibilities before Office transfer: ${blockers.join(', ')}.`,
        );
      }
    }

    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;
    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const result = await this.prisma.$transaction(async (transaction) => {
      let sourceReplacementAssignment = null;
      let destinationOfficeHeadAssignment = null;

      if (officeHeadTransition && currentOfficeHead && replacementEmployee) {
        const replacementPrimary = replacementEmployee.orgMemberships[0];

        await transaction.orgLeadershipAssignment.update({
          where: { id: currentOfficeHead.id },
          data: {
            effectiveUntil: effectiveAt,
            endedByAccountId: user.accountId,
            endReason: `Office transfer: ${reason}`,
          },
        });

        if (replacementPrimary.orgUnitId) {
          await transaction.orgMembership.update({
            where: { id: replacementPrimary.id },
            data: {
              endsAt: effectiveAt,
              endedByAccountId: user.accountId,
              endReason: `Promoted to Office Head during transfer: ${reason}`,
            },
          });
          await transaction.orgMembership.create({
            data: {
              employeeId: replacementEmployee.id,
              officeId: currentPrimary.officeId,
              orgUnitId: null,
              membershipType: OrgMembershipType.PRIMARY,
              assignmentSource: OrgAssignmentSource.SYSTEM,
              startsAt: effectiveAt,
              assignedByAccountId: user.accountId,
              assignmentReason: `Office-level placement for Office Head: ${reason}`,
            },
          });
        }

        await transaction.orgLeadershipAssignment.updateMany({
          where: {
            employeeId: replacementEmployee.id,
            officeId: currentPrimary.officeId,
            leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
            isActing: false,
            effectiveUntil: null,
            effectiveFrom: { lte: effectiveAt },
          },
          data: {
            effectiveUntil: effectiveAt,
            endedByAccountId: user.accountId,
            endReason: `Promoted to Office Head during transfer: ${reason}`,
          },
        });

        sourceReplacementAssignment =
          await transaction.orgLeadershipAssignment.create({
            data: {
              employeeId: replacementEmployee.id,
              officeId: currentPrimary.officeId,
              orgUnitId: null,
              leadershipType: OrgLeadershipType.OFFICE_HEAD,
              assignmentSource: OrgAssignmentSource.SYSTEM,
              isActing: false,
              effectiveFrom: effectiveAt,
              assignedByAccountId: user.accountId,
              assignmentReason: `Office Head replacement during transfer: ${reason}`,
            },
          });
      }

      const sourceMemberships = await transaction.orgMembership.findMany({
        where: {
          employeeId: employee.id,
          officeId: currentPrimary.officeId,
          endsAt: null,
        },
        select: { id: true },
      });

      if (sourceMemberships.length > 0) {
        await transaction.orgMembership.updateMany({
          where: { id: { in: sourceMemberships.map((row) => row.id) } },
          data: {
            endsAt: effectiveAt,
            endedByAccountId: user.accountId,
            endReason: reason,
          },
        });
      }

      const teamMembers = await transaction.operationalTeamMember.findMany({
        where: {
          employeeId: employee.id,
          endsAt: null,
          team: {
            is: { orgUnit: { is: { officeId: currentPrimary.officeId } } },
          },
        },
        select: { id: true },
      });
      if (teamMembers.length > 0) {
        await transaction.operationalTeamMember.updateMany({
          where: { id: { in: teamMembers.map((row) => row.id) } },
          data: {
            endsAt: effectiveAt,
            endedByAccountId: user.accountId,
            endReason: `Office transfer: ${reason}`,
          },
        });
      }

      const teamLeads =
        await transaction.operationalTeamLeadAssignment.findMany({
          where: {
            employeeId: employee.id,
            effectiveUntil: null,
            team: {
              is: { orgUnit: { is: { officeId: currentPrimary.officeId } } },
            },
          },
          select: { id: true },
        });
      if (teamLeads.length > 0) {
        await transaction.operationalTeamLeadAssignment.updateMany({
          where: { id: { in: teamLeads.map((row) => row.id) } },
          data: {
            effectiveUntil: effectiveAt,
            endedByAccountId: user.accountId,
            endReason: `Office transfer: ${reason}`,
          },
        });
      }

      let revokedDelegations = 0;
      if (employee.account) {
        const delegationResult =
          await transaction.delegatedPermission.updateMany({
            where: {
              granteeAccountId: employee.account.id,
              officeId: currentPrimary.officeId,
              revokedAt: null,
            },
            data: {
              revokedAt: effectiveAt,
              effectiveUntil: effectiveAt,
              revokedByAccountId: user.accountId,
              revokeReason: `Office transfer: ${reason}`,
            },
          });
        revokedDelegations = delegationResult.count;
      }

      const membership = await transaction.orgMembership.create({
        data: {
          employeeId: employee.id,
          officeId: dto.targetOfficeId,
          orgUnitId: targetOrgUnit?.id ?? null,
          membershipType: OrgMembershipType.PRIMARY,
          assignmentSource: OrgAssignmentSource.TRANSFER,
          startsAt: effectiveAt,
          assignedByAccountId: user.accountId,
          assignmentReason: reason,
        },
        select: {
          id: true,
          officeId: true,
          orgUnitId: true,
          startsAt: true,
        },
      });

      if (transferAsOfficeHead) {
        destinationOfficeHeadAssignment =
          await transaction.orgLeadershipAssignment.create({
            data: {
              employeeId: employee.id,
              officeId: dto.targetOfficeId,
              orgUnitId: null,
              leadershipType: OrgLeadershipType.OFFICE_HEAD,
              assignmentSource: OrgAssignmentSource.TRANSFER,
              isActing: false,
              effectiveFrom: effectiveAt,
              assignedByAccountId: user.accountId,
              assignmentReason: `Transferred as Office Head: ${reason}`,
            },
          });
      }

      let revokedSessions = 0;
      if (employee.account) {
        const sessionResult = await transaction.authSession.updateMany({
          where: { accountId: employee.account.id, revokedAt: null },
          data: { revokedAt: now },
        });
        revokedSessions = sessionResult.count;
      }

      await transaction.employee.update({
        where: { id: employee.id },
        data: { updatedAt: now },
      });

      await transaction.employeeLifecycleAction.create({
        data: {
          employeeId: employee.id,
          actorAccountId: user.accountId,
          action: EmployeeLifecycleActionType.TRANSFERRED,
          previousEmployeeStatus: employee.status,
          newEmployeeStatus: employee.status,
          previousEmploymentStatus: employee.employmentStatus,
          newEmploymentStatus: employee.employmentStatus,
          reason,
          effectiveAt,
          ipAddress,
          userAgent,
          metadata: {
            transferKind: officeHeadTransition
              ? 'OFFICE_HEAD_TRANSFER'
              : 'OFFICE_TRANSFER',
            transferAs: officeHeadTransition?.transferAs ?? 'EMPLOYEE',
            sourceOfficeId: currentPrimary.officeId,
            sourceOfficeCode: currentPrimary.office.code,
            sourceOfficeName: currentPrimary.office.name,
            sourceOrgUnitId: currentPrimary.orgUnitId,
            sourceOrgUnitName: currentPrimary.orgUnit?.name ?? null,
            targetOfficeId: targetOffice.id,
            targetOfficeCode: targetOffice.code,
            targetOfficeName: targetOffice.name,
            targetOrgUnitId: targetOrgUnit?.id ?? null,
            targetOrgUnitName: targetOrgUnit?.name ?? null,
            replacementEmployeeId: replacementEmployee?.id ?? null,
            replacementEmployeeCode: replacementEmployee?.empId ?? null,
            endedMemberships: sourceMemberships.length,
            endedTeamMemberships: teamMembers.length,
            endedTeamLeadAssignments: teamLeads.length,
            revokedDelegations,
            revokedSessions,
          },
        },
      });

      return {
        membership,
        revokedSessions,
        sourceReplacementAssignment,
        destinationOfficeHeadAssignment,
      };
    });

    await this.synchronizeOfficialGroups(
      employee.account?.id,
      user.accountId,
      officeHeadTransition
        ? 'OFFICE_HEAD_OFFICE_TRANSFERRED'
        : 'EMPLOYEE_OFFICE_TRANSFERRED',
    );
    if (officeHeadTransition) {
      await this.conversationsService.synchronizeAllOfficialGroupsSafely(
        user.accountId,
        'OFFICE_HEAD_TRANSFERRED',
      );
    }
    this.messagingEvents.emitDirectoryChanged({
      reason: officeHeadTransition
        ? 'OFFICE_HEAD_TRANSFERRED'
        : 'OFFICE_TRANSFERRED',
      occurredAt: new Date().toISOString(),
    });

    return {
      message: officeHeadTransition
        ? transferAsOfficeHead
          ? 'Office Head transferred and assigned as the target Office Head successfully.'
          : 'Office Head transferred as an employee and the source Office Head was replaced successfully.'
        : 'Employee transferred to the new Office successfully.',
      employee: {
        id: employee.id,
        empId: employee.empId,
        empName: employee.empName,
        status: employee.status,
        employmentStatus: employee.employmentStatus,
      },
      transfer: {
        sourceOffice: currentPrimary.office,
        sourceOrgUnit: currentPrimary.orgUnit,
        targetOffice,
        targetOrgUnit: targetOrgUnit
          ? {
              id: targetOrgUnit.id,
              code: targetOrgUnit.code,
              name: targetOrgUnit.name,
            }
          : null,
        effectiveAt,
        membership: result.membership,
        sourceReplacementOfficeHead: result.sourceReplacementAssignment,
        destinationOfficeHead: result.destinationOfficeHeadAssignment,
      },
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

      default:
        throw new BadRequestException(
          'Employment status must be resigned, retired or terminated.',
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

      const activeOfficeHead =
        await transaction.orgLeadershipAssignment.findFirst({
          where: {
            employeeId: employee.id,
            leadershipType: OrgLeadershipType.OFFICE_HEAD,
            isActing: false,
            effectiveFrom: { lte: effectiveAt },
            OR: [
              { effectiveUntil: null },
              { effectiveUntil: { gt: effectiveAt } },
            ],
          },
          select: { id: true },
        });
      if (activeOfficeHead) {
        throw new ConflictException(
          'Resolve this employee Office Head assignment in Office Head Management before ending employment.',
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

    this.messagingEvents.emitDirectoryChanged({
      reason: 'EMPLOYMENT_ENDED',
      occurredAt: new Date().toISOString(),
    });

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

    this.messagingEvents.emitDirectoryChanged({
      reason:
        status === EmployeeStatus.ACTIVE
          ? 'EMPLOYEE_REACTIVATED'
          : 'EMPLOYEE_SUSPENDED',
      occurredAt: new Date().toISOString(),
    });

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
