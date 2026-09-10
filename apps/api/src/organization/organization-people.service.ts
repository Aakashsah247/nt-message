import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgAssignmentSource,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';

import { AssignOfficeHeadDto } from './dto/assign-office-head.dto';
import { AssignOrgLeadershipDto } from './dto/assign-org-leadership.dto';
import { AssignOrgMembershipDto } from './dto/assign-org-membership.dto';
import { EndOrgLeadershipDto } from './dto/end-org-leadership.dto';
import { EndOrgMembershipDto } from './dto/end-org-membership.dto';
import { TransferPrimaryMembershipDto } from './dto/transfer-primary-membership.dto';
import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';

@Injectable()
export class OrganizationPeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: OrganizationAuthorityService,
    private readonly authorization: OrganizationAuthorizationService,
    private readonly conversationsService?: ConversationsService,
  ) {}

  private async synchronizeOfficialGroupsForAccount(
    accountId: string | null | undefined,
    actorAccountId: string,
    reason: string,
  ): Promise<void> {
    if (!this.conversationsService || !accountId) {
      return;
    }

    await this.conversationsService.synchronizeOfficialGroupsForAccountSafely(
      accountId,
      actorAccountId,
      reason,
    );
  }

  private normalizeReason(value: string): string {
    const reason = value.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'Provide a clear reason containing at least 3 characters.',
      );
    }

    return reason;
  }

  private parseDate(
    value: string | undefined,
    fieldName: string,
    fallback: Date,
  ): Date {
    if (!value) {
      return fallback;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    return date;
  }

  private validatePeriod(
    startsAt: Date,
    endsAt: Date | null,
    startLabel: string,
    endLabel: string,
  ): void {
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        `${endLabel} must be later than ${startLabel}.`,
      );
    }
  }

  private async assertOfficeActive(officeId: string) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!office) {
      throw new NotFoundException('Office was not found.');
    }

    if (!office.isActive) {
      throw new ConflictException('This office is inactive.');
    }

    return office;
  }

  private async getEligibleEmployee(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        empId: true,
        empName: true,
        designation: true,
        status: true,
        employmentStatus: true,
        archivedAt: true,
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
      throw new NotFoundException('Employee was not found.');
    }

    if (
      employee.status !== EmployeeStatus.ACTIVE ||
      employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      employee.archivedAt !== null
    ) {
      throw new ConflictException(
        'Only an active employee can receive an organizational assignment.',
      );
    }

    if (employee.account?.role === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The system administrator cannot be placed inside the office hierarchy.',
      );
    }

    return employee;
  }

  private async validateOrgUnit(
    officeId: string,
    orgUnitId: string | null,
  ) {
    if (!orgUnitId) {
      return null;
    }

    const orgUnit = await this.prisma.orgUnit.findFirst({
      where: {
        id: orgUnitId,
        officeId,
      },
      select: {
        id: true,
        officeId: true,
        code: true,
        name: true,
        isActive: true,
        orgUnitType: {
          select: {
            id: true,
            name: true,
            isTeam: true,
            isActive: true,
          },
        },
      },
    });

    if (!orgUnit) {
      throw new NotFoundException(
        'Organizational unit was not found in this office.',
      );
    }

    if (!orgUnit.isActive || !orgUnit.orgUnitType.isActive) {
      throw new ConflictException(
        'The selected organizational unit is inactive.',
      );
    }

    if (orgUnit.orgUnitType.isTeam) {
      throw new BadRequestException(
        'Legacy Team OrgUnits are historical only. Use Operational Team membership and leadership for current Team operations.',
      );
    }

    return orgUnit;
  }

  private async assertPrimaryOfficeMembership(
    employeeId: string,
    officeId: string,
    at: Date,
  ) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: {
        employeeId,
        officeId,
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
      select: {
        id: true,
        orgUnitId: true,
      },
    });

    if (!membership) {
      throw new ConflictException(
        'The employee must have an active primary membership in this office first.',
      );
    }

    return membership;
  }

  async getPeopleActionContext(
    user: AuthenticatedUser,
    officeId: string,
    orgUnitId: string | null,
  ) {
    await this.authority.assertCanViewOffice(user, officeId);

    if (orgUnitId) {
      const orgUnit = await this.prisma.orgUnit.findFirst({
        where: {
          id: orgUnitId,
          officeId,
        },
        select: {
          id: true,
        },
      });

      if (!orgUnit) {
        throw new NotFoundException(
          'Organizational unit was not found in this office.',
        );
      }
    }

    const [
      viewMemberships,
      transferPrimary,
      assignSecondary,
      viewLeadership,
      assignLeadership,
      assignActing,
      assignDeputy,
    ] = await Promise.all([
      this.authorization.can(
        user,
        CAPABILITIES.MEMBERSHIP_VIEW,
        officeId,
        orgUnitId,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
        officeId,
        orgUnitId,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.MEMBERSHIP_ASSIGN_SECONDARY,
        officeId,
        orgUnitId,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.LEADERSHIP_VIEW,
        officeId,
        orgUnitId,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.LEADERSHIP_ASSIGN,
        officeId,
        orgUnitId,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.LEADERSHIP_ASSIGN_ACTING,
        officeId,
        orgUnitId,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.LEADERSHIP_ASSIGN_DEPUTY,
        officeId,
        orgUnitId,
      ),
    ]);

    return {
      officeId,
      orgUnitId,
      availableActions: {
        viewMemberships,
        transferPrimary,
        assignSecondary,
        viewLeadership,
        assignLeadership,
        assignActing,
        assignDeputy,
      },
    };
  }

  async listOfficePeople(
    user: AuthenticatedUser,
    officeId: string,
  ) {
    await this.authority.assertCanViewOffice(user, officeId);

    const [officeWideMemberships, officeWideLeadership] =
      await Promise.all([
        this.authorization.can(
          user,
          CAPABILITIES.MEMBERSHIP_VIEW,
          officeId,
          null,
        ),
        this.authorization.can(
          user,
          CAPABILITIES.LEADERSHIP_VIEW,
          officeId,
          null,
        ),
      ]);

    const officeWide = officeWideMemberships || officeWideLeadership;

    const visibleOrgUnitIds = officeWide
      ? []
      : Array.from(
          new Set(
            (
              await Promise.all([
                this.authorization.visibleOrgUnitIds(
                  user,
                  CAPABILITIES.MEMBERSHIP_VIEW,
                  officeId,
                ),
                this.authorization.visibleOrgUnitIds(
                  user,
                  CAPABILITIES.LEADERSHIP_VIEW,
                  officeId,
                ),
              ])
            ).flat(),
          ),
        );

    if (!officeWide && visibleOrgUnitIds.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to view people in this organizational area.',
      );
    }

    const now = new Date();
    const primaryMemberships = await this.prisma.orgMembership.findMany({
      where: {
        officeId,
        membershipType: OrgMembershipType.PRIMARY,
        startsAt: {
          lte: now,
        },
        OR: [
          {
            endsAt: null,
          },
          {
            endsAt: {
              gt: now,
            },
          },
        ],
        ...(officeWide
          ? {}
          : {
              orgUnitId: {
                in: visibleOrgUnitIds,
              },
            }),
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
          },
        },
      },
      select: {
        id: true,
        officeId: true,
        orgUnitId: true,
        membershipType: true,
        assignmentSource: true,
        startsAt: true,
        employee: {
          select: {
            id: true,
            empId: true,
            empName: true,
            designation: true,
            status: true,
            employmentStatus: true,
            isActivated: true,
            account: {
              select: {
                id: true,
                username: true,
                role: true,
                isEnabled: true,
              },
            },
          },
        },
        orgUnit: {
          select: {
            id: true,
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

    const data = primaryMemberships
      .filter(
        (membership) =>
          membership.employee.account?.role !==
          AccountRole.SUPER_ADMIN,
      )
      .sort((left, right) => {
        const byName = left.employee.empName.localeCompare(
          right.employee.empName,
        );

        return byName !== 0
          ? byName
          : left.employee.empId.localeCompare(
              right.employee.empId,
            );
      })
      .map((membership) => ({
        employee: membership.employee,
        primaryMembership: {
          id: membership.id,
          officeId: membership.officeId,
          orgUnitId: membership.orgUnitId,
          membershipType: membership.membershipType,
          assignmentSource: membership.assignmentSource,
          startsAt: membership.startsAt,
          orgUnit: membership.orgUnit,
        },
      }));

    return {
      data,
      scope: {
        officeWide,
        visibleOrgUnitIds,
      },
    };
  }

  async listEmployeeMemberships(
    user: AuthenticatedUser,
    officeId: string,
    employeeId: string,
  ) {
    await this.authority.assertCanViewOffice(user, officeId);

    const officeWide = await this.authorization.can(
      user,
      CAPABILITIES.MEMBERSHIP_VIEW,
      officeId,
      null,
    );

    const visibleOrgUnitIds = officeWide
      ? []
      : await this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.MEMBERSHIP_VIEW,
          officeId,
        );

    if (!officeWide && visibleOrgUnitIds.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to view employee placements in this organizational area.',
      );
    }

    const employee = await this.getEligibleEmployee(employeeId);

    const memberships = await this.prisma.orgMembership.findMany({
      where: {
        employeeId,
        officeId,
        ...(officeWide
          ? {}
          : {
              orgUnitId: {
                in: visibleOrgUnitIds,
              },
            }),
      },
      orderBy: [
        {
          startsAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      select: {
        id: true,
        officeId: true,
        orgUnitId: true,
        membershipType: true,
        assignmentSource: true,
        startsAt: true,
        endsAt: true,
        assignmentReason: true,
        endReason: true,
        createdAt: true,
        updatedAt: true,
        orgUnit: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
            orgUnitType: {
              select: {
                id: true,
                name: true,
                isTeam: true,
              },
            },
          },
        },
        assignedBy: {
          select: {
            id: true,
            username: true,
          },
        },
        endedBy: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!officeWide && memberships.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to view this employee placement.',
      );
    }

    return {
      employee,
      data: memberships,
    };
  }

  async assignMembership(
    user: AuthenticatedUser,
    officeId: string,
    dto: AssignOrgMembershipDto,
  ) {
    await this.assertOfficeActive(officeId);

    const employee = await this.getEligibleEmployee(dto.employeeId);
    const orgUnitId = dto.orgUnitId ?? null;
    const capability =
      dto.membershipType === OrgMembershipType.PRIMARY
        ? CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL
        : CAPABILITIES.MEMBERSHIP_ASSIGN_SECONDARY;

    await this.authorization.assertCan(
      user,
      capability,
      officeId,
      orgUnitId,
    );

    await this.validateOrgUnit(officeId, orgUnitId);

    const startsAt = this.parseDate(
      dto.startsAt,
      'Start time',
      new Date(),
    );

    const endsAt = dto.endsAt
      ? this.parseDate(dto.endsAt, 'End time', startsAt)
      : null;

    this.validatePeriod(
      startsAt,
      endsAt,
      'start time',
      'end time',
    );

    if (
      dto.membershipType === OrgMembershipType.TEMPORARY &&
      !endsAt
    ) {
      throw new BadRequestException(
        'Temporary placement requires an end time.',
      );
    }

    if (dto.membershipType === OrgMembershipType.PRIMARY) {
      const existingPrimary =
        await this.prisma.orgMembership.findFirst({
          where: {
            employeeId: employee.id,
            membershipType: OrgMembershipType.PRIMARY,
            endsAt: null,
          },
          select: {
            id: true,
            officeId: true,
            orgUnitId: true,
          },
        });

      if (existingPrimary) {
        throw new ConflictException(
          'This employee already has an open primary placement. Use the transfer action instead.',
        );
      }
    } else {
      const overlapping =
        await this.prisma.orgMembership.findFirst({
          where: {
            employeeId: employee.id,
            officeId,
            orgUnitId,
            membershipType: dto.membershipType,
            ...(endsAt
              ? {
                  startsAt: {
                    lt: endsAt,
                  },
                }
              : {}),
            OR: [
              {
                endsAt: null,
              },
              {
                endsAt: {
                  gt: startsAt,
                },
              },
            ],
          },
          select: {
            id: true,
          },
        });

      if (overlapping) {
        throw new ConflictException(
          'An overlapping placement of this type already exists for this employee.',
        );
      }
    }

    const membership = await this.prisma.orgMembership.create({
      data: {
        employeeId: employee.id,
        officeId,
        orgUnitId,
        membershipType: dto.membershipType,
        assignmentSource:
          dto.membershipType === OrgMembershipType.TEMPORARY
            ? OrgAssignmentSource.TEMPORARY_ASSIGNMENT
            : OrgAssignmentSource.MANUAL,
        startsAt,
        endsAt,
        assignedByAccountId: user.accountId,
        assignmentReason: this.normalizeReason(dto.reason),
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
        assignmentReason: true,
        createdAt: true,
      },
    });

    if (dto.membershipType === OrgMembershipType.PRIMARY) {
      await this.synchronizeOfficialGroupsForAccount(
        employee.account?.id,
        user.accountId,
        'ORG_PRIMARY_MEMBERSHIP_ASSIGNED',
      );
    }

    return {
      message: 'Employee placement added successfully.',
      membership,
    };
  }

  async transferPrimaryMembership(
    user: AuthenticatedUser,
    officeId: string,
    dto: TransferPrimaryMembershipDto,
  ) {
    await this.assertOfficeActive(officeId);

    const employee = await this.getEligibleEmployee(dto.employeeId);
    const targetOrgUnitId = dto.orgUnitId ?? null;

    await this.validateOrgUnit(officeId, targetOrgUnitId);

    const currentScope = await this.prisma.orgMembership.findFirst({
      where: {
        employeeId: employee.id,
        membershipType: OrgMembershipType.PRIMARY,
        endsAt: null,
      },
      select: {
        officeId: true,
        orgUnitId: true,
      },
    });

    if (!currentScope) {
      throw new ConflictException(
        'This employee does not have an open primary placement.',
      );
    }

    if (currentScope.officeId !== officeId) {
      throw new ConflictException(
        'Cross-office transfer requires the dedicated office-transfer workflow.',
      );
    }

    await this.authorization.assertCan(
      user,
      CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
      officeId,
      currentScope.orgUnitId,
    );

    await this.authorization.assertCan(
      user,
      CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
      officeId,
      targetOrgUnitId,
    );

    const now = new Date();
    const effectiveAt = this.parseDate(
      dto.effectiveAt,
      'Transfer time',
      now,
    );

    if (effectiveAt.getTime() < now.getTime() - 60_000) {
      throw new BadRequestException(
        'Transfer time cannot be in the past.',
      );
    }

    const reason = this.normalizeReason(dto.reason);

    const result = await this.prisma.$transaction(
      async (transaction) => {
        const current =
          await transaction.orgMembership.findFirst({
            where: {
              employeeId: employee.id,
              membershipType: OrgMembershipType.PRIMARY,
              endsAt: null,
            },
            select: {
              id: true,
              officeId: true,
              orgUnitId: true,
              startsAt: true,
            },
          });

        if (!current) {
          throw new ConflictException(
            'This employee does not have an open primary placement.',
          );
        }

        if (current.officeId !== officeId) {
          throw new ConflictException(
            'Cross-office transfer requires the dedicated office-transfer workflow.',
          );
        }

        if (current.orgUnitId === targetOrgUnitId) {
          throw new ConflictException(
            'The employee is already assigned to this primary organizational location.',
          );
        }

        if (effectiveAt.getTime() <= current.startsAt.getTime()) {
          throw new BadRequestException(
            'Transfer time must be later than the current placement start time.',
          );
        }

        const endedMembership =
          await transaction.orgMembership.update({
            where: {
              id: current.id,
            },
            data: {
              endsAt: effectiveAt,
              endedByAccountId: user.accountId,
              endReason: reason,
            },
          });

        const membership =
          await transaction.orgMembership.create({
            data: {
              employeeId: employee.id,
              officeId,
              orgUnitId: targetOrgUnitId,
              membershipType: OrgMembershipType.PRIMARY,
              assignmentSource: OrgAssignmentSource.TRANSFER,
              startsAt: effectiveAt,
              assignedByAccountId: user.accountId,
              assignmentReason: reason,
            },
          });

        return {
          endedMembership,
          membership,
        };
      },
    );

    await this.synchronizeOfficialGroupsForAccount(
      employee.account?.id,
      user.accountId,
      'ORG_PRIMARY_MEMBERSHIP_TRANSFERRED',
    );

    return {
      message: 'Employee primary placement transferred successfully.',
      ...result,
    };
  }

  async endMembership(
    user: AuthenticatedUser,
    officeId: string,
    membershipId: string,
    dto: EndOrgMembershipDto,
  ) {
    const existing = await this.prisma.orgMembership.findFirst({
      where: {
        id: membershipId,
        officeId,
      },
      select: {
        id: true,
        orgUnitId: true,
        membershipType: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Employee placement was not found.');
    }

    await this.authorization.assertCan(
      user,
      CAPABILITIES.MEMBERSHIP_ASSIGN_SECONDARY,
      officeId,
      existing.orgUnitId,
    );

    if (existing.membershipType === OrgMembershipType.PRIMARY) {
      throw new ConflictException(
        'Primary placement must be changed through transfer or the employee lifecycle workflow.',
      );
    }

    if (existing.endsAt) {
      throw new ConflictException(
        'This employee placement has already ended.',
      );
    }

    const effectiveAt = this.parseDate(
      dto.effectiveAt,
      'End time',
      new Date(),
    );

    if (effectiveAt.getTime() <= existing.startsAt.getTime()) {
      throw new BadRequestException(
        'End time must be later than the placement start time.',
      );
    }

    const membership = await this.prisma.orgMembership.update({
      where: {
        id: membershipId,
      },
      data: {
        endsAt: effectiveAt,
        endedByAccountId: user.accountId,
        endReason: this.normalizeReason(dto.reason),
      },
    });

    return {
      message: 'Employee placement ended successfully.',
      membership,
    };
  }

  async listLeadership(
    user: AuthenticatedUser,
    officeId: string,
  ) {
    await this.authority.assertCanViewOffice(user, officeId);

    const officeWide = await this.authorization.can(
      user,
      CAPABILITIES.LEADERSHIP_VIEW,
      officeId,
      null,
    );

    const visibleOrgUnitIds = officeWide
      ? []
      : await this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.LEADERSHIP_VIEW,
          officeId,
        );

    if (!officeWide && visibleOrgUnitIds.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to view leadership in this organizational area.',
      );
    }

    const data =
      await this.prisma.orgLeadershipAssignment.findMany({
        where: {
          officeId,
          ...(officeWide
            ? {}
            : {
                orgUnitId: {
                  in: visibleOrgUnitIds,
                },
              }),
        },
        orderBy: [
          {
            effectiveFrom: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
        select: {
          id: true,
          officeId: true,
          orgUnitId: true,
          employeeId: true,
          leadershipType: true,
          assignmentSource: true,
          isActing: true,
          effectiveFrom: true,
          effectiveUntil: true,
          assignmentReason: true,
          endReason: true,
          createdAt: true,
          updatedAt: true,
          employee: {
            select: {
              id: true,
              empId: true,
              empName: true,
              designation: true,
            },
          },
          orgUnit: {
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
              orgUnitType: {
                select: {
                  name: true,
                  isTeam: true,
                },
              },
            },
          },
          assignedBy: {
            select: {
              id: true,
              username: true,
            },
          },
          endedBy: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

    return {
      data,
    };
  }

  async assignOfficeHead(
    user: AuthenticatedUser,
    officeId: string,
    dto: AssignOfficeHeadDto,
  ) {
    this.authority.assertPlatformAdmin(user);
    await this.assertOfficeActive(officeId);

    const employee = await this.getEligibleEmployee(dto.employeeId);

    const effectiveFrom = this.parseDate(
      dto.effectiveFrom,
      'Effective time',
      new Date(),
    );

    const reason = this.normalizeReason(dto.reason);

    const result = await this.prisma.$transaction(
      async (transaction) => {
        const currentPrimary =
          await transaction.orgMembership.findFirst({
            where: {
              employeeId: employee.id,
              membershipType: OrgMembershipType.PRIMARY,
              endsAt: null,
            },
            select: {
              id: true,
              officeId: true,
              orgUnitId: true,
              startsAt: true,
            },
          });

        if (
          currentPrimary &&
          currentPrimary.officeId !== officeId
        ) {
          throw new ConflictException(
            'This employee already belongs to another Office. Use the dedicated cross-office transfer workflow.',
          );
        }

        if (
          currentPrimary &&
          currentPrimary.startsAt.getTime() >
            effectiveFrom.getTime()
        ) {
          throw new BadRequestException(
            'Office Head start time cannot be earlier than the employee Office membership.',
          );
        }

        let bootstrapMembership = currentPrimary;

        /*
         * First-office bootstrap exception:
         * Super Admin may establish the initial Office membership only
         * when assigning the protected Office Head.
         */
        if (!bootstrapMembership) {
          bootstrapMembership =
            await transaction.orgMembership.create({
              data: {
                employeeId: employee.id,
                officeId,
                orgUnitId: null,
                membershipType: OrgMembershipType.PRIMARY,
                assignmentSource: OrgAssignmentSource.SYSTEM,
                startsAt: effectiveFrom,
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
        }

        const existing =
          await transaction.orgLeadershipAssignment.findFirst({
            where: {
              officeId,
              orgUnitId: null,
              leadershipType:
                OrgLeadershipType.OFFICE_HEAD,
              isActing: false,
              effectiveUntil: null,
            },
            select: {
              id: true,
              employeeId: true,
            },
          });

        if (existing) {
          throw new ConflictException(
            'This office already has a permanent Office Head. End that assignment before assigning another.',
          );
        }

        const assignment =
          await transaction.orgLeadershipAssignment.create({
            data: {
              employeeId: employee.id,
              officeId,
              orgUnitId: null,
              leadershipType:
                OrgLeadershipType.OFFICE_HEAD,
              assignmentSource: OrgAssignmentSource.SYSTEM,
              isActing: false,
              effectiveFrom,
              assignedByAccountId: user.accountId,
              assignmentReason: reason,
            },
          });

        return {
          bootstrapMembership,
          assignment,
        };
      },
    );

    await this.conversationsService?.synchronizeAllOfficialGroupsSafely(
      user.accountId,
      'OFFICE_HEAD_ASSIGNED',
    );

    return {
      message: 'Office Head assigned successfully.',
      ...result,
    };
  }

  async assignLeadership(
    user: AuthenticatedUser,
    officeId: string,
    dto: AssignOrgLeadershipDto,
  ) {
    await this.assertOfficeActive(officeId);

    const employee = await this.getEligibleEmployee(dto.employeeId);
    const orgUnitId = dto.orgUnitId ?? null;
    const isActing = dto.isActing ?? false;
    const leadershipCapability = isActing
      ? CAPABILITIES.LEADERSHIP_ASSIGN_ACTING
      : dto.leadershipType === OrgLeadershipType.DEPUTY
        ? CAPABILITIES.LEADERSHIP_ASSIGN_DEPUTY
        : CAPABILITIES.LEADERSHIP_ASSIGN;

    await this.authorization.assertCan(
      user,
      leadershipCapability,
      officeId,
      orgUnitId,
    );

    const effectiveFrom = this.parseDate(
      dto.effectiveFrom,
      'Effective start time',
      new Date(),
    );

    const effectiveUntil = dto.effectiveUntil
      ? this.parseDate(
          dto.effectiveUntil,
          'Effective end time',
          effectiveFrom,
        )
      : null;

    this.validatePeriod(
      effectiveFrom,
      effectiveUntil,
      'effective start time',
      'effective end time',
    );

    if (
      dto.leadershipType === OrgLeadershipType.OFFICE_HEAD &&
      !isActing
    ) {
      throw new ForbiddenException(
        'Permanent Office Head assignment is a protected system action.',
      );
    }

    if (
      isActing &&
      dto.leadershipType === OrgLeadershipType.DEPUTY
    ) {
      throw new BadRequestException(
        'Deputy and Acting Head are separate leadership assignments.',
      );
    }

    if (isActing && !effectiveUntil) {
      throw new BadRequestException(
        'Acting leadership requires an end time.',
      );
    }

    if (dto.leadershipType === OrgLeadershipType.OFFICE_HEAD) {
      if (orgUnitId) {
        throw new BadRequestException(
          'Office Head applies to the Office and cannot be linked to an organizational unit.',
        );
      }
    } else if (
      dto.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD
    ) {
      if (!orgUnitId) {
        throw new BadRequestException(
          'Org Unit Head requires an organizational unit.',
        );
      }

      await this.validateOrgUnit(officeId, orgUnitId);
    } else if (
      dto.leadershipType === OrgLeadershipType.TEAM_LEAD
    ) {
      throw new BadRequestException(
        'Team Lead is managed through Operational Team leadership, not formal OrgUnit leadership.',
      );
    } else {
      await this.validateOrgUnit(officeId, orgUnitId);
    }

    await this.assertPrimaryOfficeMembership(
      employee.id,
      officeId,
      effectiveFrom,
    );

    if (dto.leadershipType !== OrgLeadershipType.DEPUTY) {
      const overlapping =
        await this.prisma.orgLeadershipAssignment.findFirst({
          where: {
            officeId,
            orgUnitId,
            leadershipType: dto.leadershipType,
            isActing,
            ...(effectiveUntil
              ? {
                  effectiveFrom: {
                    lt: effectiveUntil,
                  },
                }
              : {}),
            OR: [
              {
                effectiveUntil: null,
              },
              {
                effectiveUntil: {
                  gt: effectiveFrom,
                },
              },
            ],
          },
          select: {
            id: true,
          },
        });

      if (overlapping) {
        throw new ConflictException(
          isActing
            ? 'An overlapping acting leadership assignment already exists for this scope.'
            : 'An overlapping permanent leadership assignment already exists for this scope.',
        );
      }
    }

    const assignment =
      await this.prisma.orgLeadershipAssignment.create({
        data: {
          employeeId: employee.id,
          officeId,
          orgUnitId,
          leadershipType: dto.leadershipType,
          assignmentSource: OrgAssignmentSource.MANUAL,
          isActing,
          effectiveFrom,
          effectiveUntil,
          assignedByAccountId: user.accountId,
          assignmentReason: this.normalizeReason(dto.reason),
        },
      });

    if (dto.leadershipType === OrgLeadershipType.OFFICE_HEAD) {
      await this.conversationsService?.synchronizeAllOfficialGroupsSafely(
        user.accountId,
        'OFFICE_HEAD_ACTING_ASSIGNMENT_CHANGED',
      );
    }

    return {
      message: isActing
        ? 'Acting leadership assigned successfully.'
        : 'Leadership assigned successfully.',
      assignment,
    };
  }

  async endLeadership(
    user: AuthenticatedUser,
    officeId: string,
    assignmentId: string,
    dto: EndOrgLeadershipDto,
  ) {
    const assignment =
      await this.prisma.orgLeadershipAssignment.findFirst({
        where: {
          id: assignmentId,
          officeId,
        },
        select: {
          id: true,
          employeeId: true,
          orgUnitId: true,
          leadershipType: true,
          isActing: true,
          effectiveFrom: true,
          effectiveUntil: true,
        },
      });

    if (!assignment) {
      throw new NotFoundException(
        'Leadership assignment was not found.',
      );
    }

    if (
      assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD &&
      !assignment.isActing
    ) {
      this.authority.assertPlatformAdmin(user);
    } else {
      const leadershipCapability = assignment.isActing
        ? CAPABILITIES.LEADERSHIP_ASSIGN_ACTING
        : assignment.leadershipType === OrgLeadershipType.DEPUTY
          ? CAPABILITIES.LEADERSHIP_ASSIGN_DEPUTY
          : CAPABILITIES.LEADERSHIP_ASSIGN;

      await this.authorization.assertCan(
        user,
        leadershipCapability,
        officeId,
        assignment.orgUnitId,
      );
    }

    if (assignment.effectiveUntil) {
      throw new ConflictException(
        'This leadership assignment already has an end time.',
      );
    }

    const effectiveAt = this.parseDate(
      dto.effectiveAt,
      'End time',
      new Date(),
    );

    if (
      effectiveAt.getTime() <= assignment.effectiveFrom.getTime()
    ) {
      throw new BadRequestException(
        'End time must be later than the leadership start time.',
      );
    }

    const updated =
      await this.prisma.orgLeadershipAssignment.update({
        where: {
          id: assignment.id,
        },
        data: {
          effectiveUntil: effectiveAt,
          endedByAccountId: user.accountId,
          endReason: this.normalizeReason(dto.reason),
        },
      });

    if (assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD) {
      await this.conversationsService?.synchronizeAllOfficialGroupsSafely(
        user.accountId,
        'OFFICE_HEAD_ASSIGNMENT_ENDED',
      );
    }

    return {
      message: 'Leadership assignment ended successfully.',
      assignment: updated,
    };
  }
}
