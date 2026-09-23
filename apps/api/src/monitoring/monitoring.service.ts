import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  ActivityEventType,
  EmergencyAlertRecipientStatus,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { RecordActivityEventDto } from './dto/record-activity-event.dto';
import { SuperAdminActivityLogQueryDto } from './dto/super-admin-activity-log-query.dto';

const KATHMANDU_OFFSET_MINUTES = 5 * 60 + 45;
const OFFLINE_AFTER_MILLISECONDS = 2 * 60 * 1000;
const ACTIVITY_EVENT_RETENTION_DAYS = 30;
const DAILY_SUMMARY_RETENTION_DAYS = 365;
const DEFAULT_OFFICE_START_TIME = '09:00';
const DEFAULT_OFFICE_END_TIME = '18:00';

interface SummaryCounters {
  firstLoginAt?: Date;
  lastLogoutAt?: Date;
  lastActiveAt?: Date;
  activeMinutes?: number;
  idleMinutes?: number;
  pagesVisitedCount?: number;
  actionsCount?: number;
  emergencyAlertsCount?: number;
  afterHoursLoginCount?: number;
}

const accountMonitoringSelect = {
  id: true,
  username: true,
  accountClass: true,
  isEnabled: true,
  lastLoginAt: true,
  profilePhotoKey: true,

  employee: {
    select: {
      empName: true,
      officialEmail: true,
      designation: true,
      profilePhotoKey: true,

      orgMemberships: {
        where: {
          membershipType: OrgMembershipType.PRIMARY,
          endsAt: null,
        },
        orderBy: {
          startsAt: 'desc' as const,
        },
        take: 1,
        select: {
          office: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          orgUnit: {
            select: {
              id: true,
              name: true,
              orgUnitType: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  },

  dailyActivitySummaries: {
    take: 1,
    orderBy: {
      activityDate: 'desc' as const,
    },
  },

  activityEvents: {
    take: 12,
    orderBy: {
      occurredAt: 'desc' as const,
    },
  },
} satisfies Prisma.AccountSelect;

const activityLogSelect = {
  id: true,
  sessionId: true,
  eventType: true,
  pagePath: true,
  elementLabel: true,
  occurredAt: true,

  account: {
    select: {
      id: true,
      username: true,
      accountClass: true,

      employee: {
        select: {
          empName: true,
          designation: true,

          orgMemberships: {
            where: {
              membershipType: OrgMembershipType.PRIMARY,
              endsAt: null,
            },
            orderBy: {
              startsAt: 'desc' as const,
            },
            take: 1,
            select: {
              office: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
              orgUnit: {
                select: {
                  id: true,
                  name: true,
                  orgUnitType: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ActivityEventSelect;

type AccountWithMonitoring = Prisma.AccountGetPayload<{
  select: typeof accountMonitoringSelect;
}>;

type ActivityLogRecord = Prisma.ActivityEventGetPayload<{
  select: typeof activityLogSelect;
}>;

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupInProgress = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.cleanupOldMonitoringRecords();

    this.cleanupTimer = setInterval(
      () => {
        void this.cleanupOldMonitoringRecords();
      },
      60 * 60 * 1000,
    );
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  async recordActivity(
    user: AuthenticatedUser,
    dto: RecordActivityEventDto,
  ): Promise<{ recorded: true }> {
    const occurredAt = new Date();
    const activityDate = this.getKathmanduDateOnly(occurredAt);
    const counters = this.getSummaryCounters(dto.eventType, occurredAt);
    const safePage = this.toSafePageName(dto.pagePath);
    const safeLabel = this.toSafeElementLabel(
      dto.eventType,
      safePage,
      dto.elementLabel,
    );

    // Monitoring records only safe metadata, never message content or private recipients.
    await this.prisma.$transaction(async (transaction) => {
      await transaction.activityEvent.create({
        data: {
          accountId: user.accountId,
          sessionId: user.sessionId,
          eventType: dto.eventType,
          pagePath: safePage,
          elementLabel: safeLabel,
          occurredAt,
        },
      });

      // Use one atomic upsert so simultaneous browser activity events cannot both
      // attempt to create the same account-and-date summary row.
      await transaction.dailyActivitySummary.upsert({
        where: {
          accountId_activityDate: {
            accountId: user.accountId,
            activityDate,
          },
        },
        create: {
          accountId: user.accountId,
          activityDate,
          firstLoginAt: counters.firstLoginAt,
          lastLogoutAt: counters.lastLogoutAt,
          lastActiveAt: counters.lastActiveAt,
          activeMinutes: counters.activeMinutes ?? 0,
          idleMinutes: counters.idleMinutes ?? 0,
          pagesVisitedCount: counters.pagesVisitedCount ?? 0,
          actionsCount: counters.actionsCount ?? 0,
          emergencyAlertsCount: counters.emergencyAlertsCount ?? 0,
          afterHoursLoginCount: counters.afterHoursLoginCount ?? 0,
        },
        update: {
          ...(counters.lastLogoutAt
            ? { lastLogoutAt: counters.lastLogoutAt }
            : {}),
          ...(counters.lastActiveAt
            ? { lastActiveAt: counters.lastActiveAt }
            : {}),
          activeMinutes: {
            increment: counters.activeMinutes ?? 0,
          },
          idleMinutes: {
            increment: counters.idleMinutes ?? 0,
          },
          pagesVisitedCount: {
            increment: counters.pagesVisitedCount ?? 0,
          },
          actionsCount: {
            increment: counters.actionsCount ?? 0,
          },
          emergencyAlertsCount: {
            increment: counters.emergencyAlertsCount ?? 0,
          },
          afterHoursLoginCount: {
            increment: counters.afterHoursLoginCount ?? 0,
          },
        },
      });

      if (counters.firstLoginAt) {
        // Preserve the first login of the Kathmandu calendar day. The null guard
        // also makes concurrent LOGIN events safe without overwriting the winner.
        await transaction.dailyActivitySummary.updateMany({
          where: {
            accountId: user.accountId,
            activityDate,
            firstLoginAt: null,
          },
          data: {
            firstLoginAt: counters.firstLoginAt,
          },
        });
      }
    });

    return {
      recorded: true,
    };
  }

  async getSuperAdminDashboard(days = 1) {
    const rangeDays = [1, 7, 30].includes(days) ? days : 1;
    const now = new Date();
    const today = this.getKathmanduDateOnly(now);
    const periodStartDate = new Date(
      today.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000,
    );
    const periodStart = this.getKathmanduDateTime(
      periodStartDate.toISOString().slice(0, 10),
      '00:00',
    );

    const activeEmployeeWhere: Prisma.EmployeeWhereInput = {
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
    };

    const [
      accounts,
      totalAccounts,
      enabledAccountCount,
      disabledAccountCount,
      activeEmployeeCount,
      inactiveEmployeeCount,
      unactivatedEmployeeCount,
      offices,
      dailySummaries,
      requestsInPeriod,
      emergencyRows,
    ] = await this.prisma.$transaction([
      this.prisma.account.findMany({
        where: { isEnabled: true },
        orderBy: [{ accountClass: 'asc' }, { createdAt: 'asc' }],
        select: accountMonitoringSelect,
      }),
      this.prisma.account.count(),
      this.prisma.account.count({ where: { isEnabled: true } }),
      this.prisma.account.count({ where: { isEnabled: false } }),
      this.prisma.employee.count({ where: activeEmployeeWhere }),
      this.prisma.employee.count({
        where: {
          OR: [
            { status: EmployeeStatus.INACTIVE },
            { employmentStatus: { not: EmploymentStatus.ACTIVE } },
            { archivedAt: { not: null } },
          ],
        },
      }),
      this.prisma.employee.count({
        where: { ...activeEmployeeWhere, isActivated: false },
      }),
      this.prisma.office.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          isActive: true,
          memberships: {
            where: {
              membershipType: OrgMembershipType.PRIMARY,
              endsAt: null,
              employee: { is: activeEmployeeWhere },
            },
            select: {
              id: true,
              employeeId: true,
              orgUnitId: true,
              orgUnit: { select: { id: true, code: true, isActive: true } },
            },
          },
          orgUnits: {
            select: {
              id: true,
              code: true,
              isActive: true,
              orgUnitType: {
                select: { code: true, isTeam: true },
              },
              memberships: {
                where: {
                  membershipType: OrgMembershipType.PRIMARY,
                  endsAt: null,
                  employee: { is: activeEmployeeWhere },
                },
                select: { id: true },
              },
              leadershipAssignments: {
                where: {
                  leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
                  effectiveUntil: null,
                  employee: { is: activeEmployeeWhere },
                },
                select: { id: true },
              },
            },
          },
          leadershipAssignments: {
            where: {
              leadershipType: OrgLeadershipType.OFFICE_HEAD,
              effectiveUntil: null,
              employee: { is: activeEmployeeWhere },
            },
            select: { id: true },
          },
          _count: { select: { memberships: true, orgUnits: true } },
        },
      }),
      this.prisma.dailyActivitySummary.findMany({
        where: {
          activityDate: { gte: periodStartDate, lte: today },
        },
        select: {
          accountId: true,
          activityDate: true,
          activeMinutes: true,
          idleMinutes: true,
          actionsCount: true,
          emergencyAlertsCount: true,
        },
      }),
      this.prisma.accountRequest.findMany({
        where: { createdAt: { gte: periodStart, lte: now } },
        select: { createdAt: true },
      }),
      this.prisma.emergencyAlertRecipient.findMany({
        where: { createdAt: { gte: periodStart, lte: now } },
        select: { status: true, createdAt: true },
      }),
    ]);

    const rows = accounts.map((account) =>
      this.toMonitoringRow(account, today, now),
    );

    const liveTotals = rows.reduce(
      (current, row) => ({
        active: current.active + (row.status === 'ACTIVE' ? 1 : 0),
        idle: current.idle + (row.status === 'IDLE' ? 1 : 0),
        offline: current.offline + (row.status === 'OFFLINE' ? 1 : 0),
        activeMinutes: current.activeMinutes + row.totalActiveMinutesToday,
        idleMinutes: current.idleMinutes + row.idleMinutesToday,
        actions: current.actions + row.actionsCount,
        emergencyAlerts: current.emergencyAlerts + row.emergencyAlertsSent,
      }),
      {
        active: 0,
        idle: 0,
        offline: 0,
        activeMinutes: 0,
        idleMinutes: 0,
        actions: 0,
        emergencyAlerts: 0,
      },
    );

    const periodTotals = dailySummaries.reduce(
      (current, summary) => ({
        activeMinutes: current.activeMinutes + summary.activeMinutes,
        idleMinutes: current.idleMinutes + summary.idleMinutes,
        actions: current.actions + summary.actionsCount,
        emergencyAlerts: current.emergencyAlerts + summary.emergencyAlertsCount,
      }),
      { activeMinutes: 0, idleMinutes: 0, actions: 0, emergencyAlerts: 0 },
    );

    const trendByDate = new Map<
      string,
      {
        activeAccounts: Set<string>;
        actions: number;
        activeMinutes: number;
        emergencyAlerts: number;
        accountRequests: number;
      }
    >();

    for (let index = 0; index < rangeDays; index += 1) {
      const date = new Date(
        periodStartDate.getTime() + index * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .slice(0, 10);
      trendByDate.set(date, {
        activeAccounts: new Set<string>(),
        actions: 0,
        activeMinutes: 0,
        emergencyAlerts: 0,
        accountRequests: 0,
      });
    }

    dailySummaries.forEach((summary) => {
      const date = summary.activityDate.toISOString().slice(0, 10);
      const bucket = trendByDate.get(date);
      if (!bucket) return;
      if (summary.activeMinutes > 0 || summary.actionsCount > 0) {
        bucket.activeAccounts.add(summary.accountId);
      }
      bucket.actions += summary.actionsCount;
      bucket.activeMinutes += summary.activeMinutes;
      bucket.emergencyAlerts += summary.emergencyAlertsCount;
    });

    requestsInPeriod.forEach((request) => {
      const date = this.getKathmanduDateString(request.createdAt);
      const bucket = trendByDate.get(date);
      if (bucket) bucket.accountRequests += 1;
    });

    const emergencyDelivery = {
      total: emergencyRows.length,
      sent: 0,
      failed: 0,
      pending: 0,
      skippedNoPhone: 0,
      deliveryRate: null as number | null,
    };

    emergencyRows.forEach((row) => {
      if (row.status === EmergencyAlertRecipientStatus.SENT)
        emergencyDelivery.sent += 1;
      else if (row.status === EmergencyAlertRecipientStatus.FAILED)
        emergencyDelivery.failed += 1;
      else if (row.status === EmergencyAlertRecipientStatus.PENDING)
        emergencyDelivery.pending += 1;
      else if (row.status === EmergencyAlertRecipientStatus.SKIPPED_NO_PHONE)
        emergencyDelivery.skippedNoPhone += 1;
    });
    if (emergencyDelivery.total > 0) {
      emergencyDelivery.deliveryRate = Math.round(
        (emergencyDelivery.sent / emergencyDelivery.total) * 100,
      );
    }

    const officeHealth = offices.map((office) => {
      const activeUnits = office.orgUnits.filter((unit) => unit.isActive);
      const inactiveUnits = office.orgUnits.length - activeUnits.length;
      const formalUnits = activeUnits.filter(
        (unit) =>
          !unit.orgUnitType.isTeam &&
          unit.orgUnitType.code !== 'PLACEMENT_PENDING',
      );
      const headedFormalUnits = formalUnits.filter(
        (unit) => unit.leadershipAssignments.length > 0,
      ).length;
      const validActivePlacements = office.memberships.filter(
        (membership) =>
          membership.orgUnit === null || membership.orgUnit.isActive,
      );
      const placementPending = office.memberships.filter(
        (membership) => membership.orgUnit?.code === 'UNASSIGNED',
      ).length;
      const activeUnitsWithoutPeople = formalUnits.filter(
        (unit) => unit.memberships.length === 0,
      ).length;
      const officeHeadAssigned = office.leadershipAssignments.length > 0;
      const setupComplete = formalUnits.length > 0 && officeHeadAssigned;

      return {
        officeId: office.id,
        name: office.name,
        isActive: office.isActive,
        activePeople: validActivePlacements.length,
        historicalPlacementRecords: office._count.memberships,
        activeUnits: activeUnits.length,
        inactiveUnits,
        formalUnits: formalUnits.length,
        headedFormalUnits,
        officeHeadAssigned,
        placementPending,
        activeUnitsWithoutPeople,
        setupStatus: !office.isActive
          ? 'INACTIVE'
          : setupComplete
            ? 'HEALTHY'
            : 'SETUP_INCOMPLETE',
      } as const;
    });

    const activeOffices = officeHealth.filter((office) => office.isActive);
    const activeFormalUnits = activeOffices.reduce(
      (sum, office) => sum + office.formalUnits,
      0,
    );
    const headedFormalUnits = activeOffices.reduce(
      (sum, office) => sum + office.headedFormalUnits,
      0,
    );
    const activeUnits = activeOffices.reduce(
      (sum, office) => sum + office.activeUnits,
      0,
    );
    const inactiveUnits = officeHealth.reduce(
      (sum, office) => sum + office.inactiveUnits,
      0,
    );
    const activePrimaryPlacements = activeOffices.reduce(
      (sum, office) => sum + office.activePeople,
      0,
    );
    const historicalPlacementRecords = officeHealth.reduce(
      (sum, office) => sum + office.historicalPlacementRecords,
      0,
    );
    const placementPending = activeOffices.reduce(
      (sum, office) => sum + office.placementPending,
      0,
    );
    const activeUnitsWithoutPeople = activeOffices.reduce(
      (sum, office) => sum + office.activeUnitsWithoutPeople,
      0,
    );
    const officesWithoutStructure = activeOffices.filter(
      (office) => office.formalUnits === 0,
    ).length;
    const officesWithoutHead = activeOffices.filter(
      (office) => !office.officeHeadAssigned,
    ).length;

    const activeEmployeeIds = new Set(
      offices
        .filter((office) => office.isActive)
        .flatMap((office) =>
          office.memberships
            .filter(
              (membership) =>
                membership.orgUnit === null || membership.orgUnit.isActive,
            )
            .map((membership) => membership.employeeId),
        ),
    );
    const employeesWithoutPlacement = Math.max(
      activeEmployeeCount - activeEmployeeIds.size,
      0,
    );

    return {
      generatedAt: now.toISOString(),
      retention: {
        detailedActivityDays: ACTIVITY_EVENT_RETENTION_DAYS,
        dailySummaryDays: DAILY_SUMMARY_RETENTION_DAYS,
      },
      privacyNotice:
        'Monitoring stores activity metadata only. Message text, private recipients and private chat content are never recorded.',
      period: {
        days: rangeDays,
        startDate: periodStartDate.toISOString().slice(0, 10),
        endDate: today.toISOString().slice(0, 10),
        timezone: 'Asia/Kathmandu' as const,
      },
      totals: {
        ...liveTotals,
        periodActions: periodTotals.actions,
        periodActiveMinutes: periodTotals.activeMinutes,
        periodIdleMinutes: periodTotals.idleMinutes,
        periodEmergencyAlerts: periodTotals.emergencyAlerts,
        periodAccountRequests: requestsInPeriod.length,
      },
      accountHealth: {
        totalAccounts,
        enabledAccounts: enabledAccountCount,
        disabledAccounts: disabledAccountCount,
        activeEmployees: activeEmployeeCount,
        inactiveEmployees: inactiveEmployeeCount,
        unactivatedEmployees: unactivatedEmployeeCount,
      },
      organizationHealth: {
        activeOffices: activeOffices.length,
        inactiveOffices: officeHealth.length - activeOffices.length,
        activeUnits,
        inactiveUnits,
        activeFormalUnits,
        officeHeadsAssigned: activeOffices.length - officesWithoutHead,
        officesWithoutHead,
        orgUnitHeadsAssigned: headedFormalUnits,
        orgUnitsWithoutHead: Math.max(activeFormalUnits - headedFormalUnits, 0),
        activePrimaryPlacements,
        historicalPlacementRecords,
        employeesWithoutPlacement,
        placementPending,
        activeUnitsWithoutPeople,
        officesWithoutStructure,
      },
      emergencyDelivery,
      officeHealth,
      trend: [...trendByDate.entries()].map(([date, value]) => ({
        date,
        activeAccounts: value.activeAccounts.size,
        actions: value.actions,
        activeMinutes: value.activeMinutes,
        emergencyAlerts: value.emergencyAlerts,
        accountRequests: value.accountRequests,
      })),
      employees: rows,
    };
  }

  async getSuperAdminActivityLogs(query: SuperAdminActivityLogQueryDto) {
    const { start, end, date, fromTime, toTime } =
      this.getKathmanduOfficeRange(query);
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 25, 10), 100);
    const where = this.buildActivityLogWhere(query, start, end);

    const [records, total] = await this.prisma.$transaction([
      this.prisma.activityEvent.findMany({
        where,
        orderBy: {
          occurredAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
        select: activityLogSelect,
      }),
      this.prisma.activityEvent.count({
        where,
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        date,
        fromTime,
        toTime,
        timezone: 'Asia/Kathmandu',
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
      records: records.map((record) => this.toActivityLogRow(record)),
      privacyNotice:
        'Audit logs show action metadata only. Message content, recipients, private chat names and file names are hidden.',
    };
  }

  private buildActivityLogWhere(
    query: SuperAdminActivityLogQueryDto,
    start: Date,
    end: Date,
  ): Prisma.ActivityEventWhereInput {
    const and: Prisma.ActivityEventWhereInput[] = [
      {
        occurredAt: {
          gte: start,
          lte: end,
        },
      },
    ];

    if (query.accountId) {
      and.push({
        accountId: query.accountId,
      });
    }

    if (query.eventType) {
      and.push({
        eventType: query.eventType,
      });
    }

    if (query.accountClass) {
      and.push({
        account: {
          accountClass: query.accountClass,
        },
      });
    }

    if (query.officeId) {
      and.push({
        account: {
          employee: {
            is: {
              orgMemberships: {
                some: {
                  membershipType: OrgMembershipType.PRIMARY,
                  endsAt: null,
                  officeId: query.officeId,
                },
              },
            },
          },
        },
      });
    }

    if (query.orgUnitId) {
      and.push({
        account: {
          employee: {
            is: {
              orgMemberships: {
                some: {
                  membershipType: OrgMembershipType.PRIMARY,
                  endsAt: null,
                  orgUnitId: query.orgUnitId,
                },
              },
            },
          },
        },
      });
    }

    if (query.search) {
      const search = query.search.trim();

      if (search) {
        and.push({
          OR: [
            {
              pagePath: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              elementLabel: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              account: {
                username: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              account: {
                employee: {
                  is: {
                    empName: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            },
          ],
        });
      }
    }

    return {
      AND: and,
    };
  }

  private toActivityLogRow(record: ActivityLogRecord) {
    const pageName = this.toSafePageName(record.pagePath);

    return {
      id: record.id,
      occurredAt: record.occurredAt.toISOString(),
      accountId: record.account.id,
      employeeName:
        record.account.employee?.empName ??
        record.account.username ??
        'Unknown account',
      accountClass: record.account.accountClass,
      designation: record.account.employee?.designation ?? null,
      officeId: record.account.employee?.orgMemberships[0]?.office?.id ?? null,
      officeCode:
        record.account.employee?.orgMemberships[0]?.office?.code ?? null,
      officeName:
        record.account.employee?.orgMemberships[0]?.office?.name ?? null,
      orgUnitId:
        record.account.employee?.orgMemberships[0]?.orgUnit?.id ?? null,
      orgUnitName:
        record.account.employee?.orgMemberships[0]?.orgUnit?.name ?? null,
      orgUnitType:
        record.account.employee?.orgMemberships[0]?.orgUnit?.orgUnitType
          ?.name ?? null,
      pageName,
      eventType: record.eventType,
      actionLabel: this.toEventActionLabel(record.eventType),
      details: this.toSafeActivityDetails(
        record.eventType,
        pageName,
        record.elementLabel,
      ),
      status: 'SUCCESS',
      sessionLabel: this.toSessionLabel(record.sessionId),
      isOfficeHours: this.isOfficeHoursKathmandu(record.occurredAt),
    };
  }

  private toMonitoringRow(
    account: AccountWithMonitoring,
    today: Date,
    now: Date,
  ) {
    const todaySummary = account.dailyActivitySummaries.find(
      (summary) => summary.activityDate.getTime() === today.getTime(),
    );

    const latestEvent = account.activityEvents[0] ?? null;
    const latestPageEvent = account.activityEvents.find(
      (event) => event.eventType === ActivityEventType.PAGE_VIEW,
    );

    const status = this.getCurrentStatus(latestEvent, now);

    return {
      accountId: account.id,
      employeeName:
        account.employee?.empName ?? account.username ?? 'Unknown account',
      accountClass: account.accountClass,
      designation: account.employee?.designation ?? null,
      profilePhotoKey:
        account.profilePhotoKey ?? account.employee?.profilePhotoKey ?? null,
      officeId: account.employee?.orgMemberships[0]?.office?.id ?? null,
      officeCode: account.employee?.orgMemberships[0]?.office?.code ?? null,
      officeName: account.employee?.orgMemberships[0]?.office?.name ?? null,
      orgUnitId: account.employee?.orgMemberships[0]?.orgUnit?.id ?? null,
      orgUnitName: account.employee?.orgMemberships[0]?.orgUnit?.name ?? null,
      orgUnitType:
        account.employee?.orgMemberships[0]?.orgUnit?.orgUnitType?.name ?? null,
      status,
      currentPage: latestPageEvent?.pagePath ?? null,
      lastActiveAt:
        todaySummary?.lastActiveAt?.toISOString() ??
        latestEvent?.occurredAt.toISOString() ??
        account.lastLoginAt?.toISOString() ??
        null,
      firstLoginAt: todaySummary?.firstLoginAt?.toISOString() ?? null,
      lastLogoutAt: todaySummary?.lastLogoutAt?.toISOString() ?? null,
      totalActiveMinutesToday: todaySummary?.activeMinutes ?? 0,
      idleMinutesToday: todaySummary?.idleMinutes ?? 0,
      pagesVisited: todaySummary?.pagesVisitedCount ?? 0,
      actionsCount: todaySummary?.actionsCount ?? 0,
      emergencyAlertsSent: todaySummary?.emergencyAlertsCount ?? 0,
      lastEventType: latestEvent?.eventType ?? null,
      lastEventLabel: latestEvent?.elementLabel ?? null,
    };
  }

  private getCurrentStatus(
    latestEvent: AccountWithMonitoring['activityEvents'][number] | null,
    now: Date,
  ): 'ACTIVE' | 'IDLE' | 'OFFLINE' {
    if (!latestEvent) {
      return 'OFFLINE';
    }

    const millisecondsSinceLastEvent =
      now.getTime() - latestEvent.occurredAt.getTime();

    if (millisecondsSinceLastEvent > OFFLINE_AFTER_MILLISECONDS) {
      return 'OFFLINE';
    }

    if (
      latestEvent.eventType === ActivityEventType.IDLE_STARTED ||
      latestEvent.eventType === ActivityEventType.IDLE_HEARTBEAT
    ) {
      return 'IDLE';
    }

    return 'ACTIVE';
  }

  private getSummaryCounters(
    eventType: ActivityEventType,
    occurredAt: Date,
  ): SummaryCounters {
    const afterHoursLoginCount =
      eventType === ActivityEventType.LOGIN &&
      this.isAfterSixPmKathmandu(occurredAt)
        ? 1
        : 0;

    switch (eventType) {
      case ActivityEventType.LOGIN:
        return {
          firstLoginAt: occurredAt,
          lastActiveAt: occurredAt,
          afterHoursLoginCount,
        };
      case ActivityEventType.LOGOUT:
      case ActivityEventType.SESSION_POLICY_LOGOUT:
        return {
          lastLogoutAt: occurredAt,
        };
      case ActivityEventType.PAGE_VIEW:
        return {
          lastActiveAt: occurredAt,
          pagesVisitedCount: 1,
        };
      case ActivityEventType.BUTTON_CLICK:
      case ActivityEventType.PASSWORD_CHANGED:
      case ActivityEventType.PASSWORD_RESET_COMPLETED:
      case ActivityEventType.CHAT_CLEARED:
      case ActivityEventType.CHAT_DELETED:
      case ActivityEventType.ANNOUNCEMENT_DRAFT_CREATED:
      case ActivityEventType.ANNOUNCEMENT_PUBLISHED:
      case ActivityEventType.ANNOUNCEMENT_EDITED:
      case ActivityEventType.ANNOUNCEMENT_WITHDRAWN:
      case ActivityEventType.ANNOUNCEMENT_ACKNOWLEDGED:
        return {
          lastActiveAt: occurredAt,
          actionsCount: 1,
        };
      case ActivityEventType.ACTIVE_HEARTBEAT:
      case ActivityEventType.ACTIVE_RESUMED:
        return {
          lastActiveAt: occurredAt,
          activeMinutes:
            eventType === ActivityEventType.ACTIVE_HEARTBEAT ? 1 : 0,
        };
      case ActivityEventType.IDLE_STARTED:
      case ActivityEventType.IDLE_HEARTBEAT:
        return {
          idleMinutes: eventType === ActivityEventType.IDLE_HEARTBEAT ? 1 : 0,
        };
      case ActivityEventType.EMERGENCY_ALERT_SENT:
        return {
          lastActiveAt: occurredAt,
          emergencyAlertsCount: 1,
          actionsCount: 1,
        };
      default:
        return {};
    }
  }

  private toEventActionLabel(eventType: ActivityEventType): string {
    return eventType
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private toSafeActivityDetails(
    eventType: ActivityEventType,
    pageName: string | null,
    elementLabel: string | null,
  ): string {
    if (pageName === 'Messages') {
      if (
        elementLabel === 'Send message' ||
        elementLabel === 'Retry message upload'
      ) {
        return 'Private message activity recorded. Content, recipients and conversation hidden.';
      }

      if (
        elementLabel?.toLowerCase().includes('file') ||
        elementLabel?.toLowerCase().includes('upload')
      ) {
        return 'Private file activity recorded. File name, content and recipients hidden.';
      }

      return 'Messages module activity recorded. Private content hidden.';
    }

    if (eventType === ActivityEventType.PAGE_VIEW) {
      return `Viewed ${pageName ?? 'application'} page.`;
    }

    if (eventType === ActivityEventType.BUTTON_CLICK) {
      return `Clicked ${elementLabel ?? 'safe interface control'}.`;
    }

    if (eventType === ActivityEventType.EMERGENCY_ALERT_SENT) {
      return 'Emergency alert activity recorded.';
    }

    if (eventType === ActivityEventType.PASSWORD_CHANGED) {
      return 'Account password changed. Password values and hashes are not recorded.';
    }

    if (eventType === ActivityEventType.PASSWORD_RESET_COMPLETED) {
      return 'Account password recovered through email OTP. Password, OTP and token values are not recorded.';
    }

    if (
      eventType === ActivityEventType.CHAT_CLEARED ||
      eventType === ActivityEventType.CHAT_DELETED
    ) {
      return 'Personal chat-history action recorded. Message content, participant identity and attachment metadata are not recorded.';
    }

    if (
      eventType === ActivityEventType.ANNOUNCEMENT_DRAFT_CREATED ||
      eventType === ActivityEventType.ANNOUNCEMENT_PUBLISHED ||
      eventType === ActivityEventType.ANNOUNCEMENT_EDITED ||
      eventType === ActivityEventType.ANNOUNCEMENT_WITHDRAWN ||
      eventType === ActivityEventType.ANNOUNCEMENT_ACKNOWLEDGED
    ) {
      return 'Official announcement lifecycle action recorded. Announcement content, file names and recipient identities are not copied into monitoring logs.';
    }

    if (eventType === ActivityEventType.SESSION_POLICY_LOGOUT) {
      return 'Session ended by daily 6 PM policy.';
    }

    if (eventType === ActivityEventType.LOGIN) {
      return 'User logged in successfully.';
    }

    if (eventType === ActivityEventType.LOGOUT) {
      return 'User logged out.';
    }

    if (
      eventType === ActivityEventType.IDLE_STARTED ||
      eventType === ActivityEventType.IDLE_HEARTBEAT
    ) {
      return 'User was idle during the monitoring interval.';
    }

    if (
      eventType === ActivityEventType.ACTIVE_RESUMED ||
      eventType === ActivityEventType.ACTIVE_HEARTBEAT
    ) {
      return 'User activity heartbeat recorded.';
    }

    return 'System activity recorded.';
  }

  private toSafePageName(value: string | null | undefined): string | null {
    const rawValue = value?.trim() ?? '';

    if (!rawValue) {
      return null;
    }

    if (
      rawValue === 'Announcements' ||
      rawValue.startsWith('/messages/announcements')
    ) {
      return 'Announcements';
    }

    if (rawValue === 'Messages' || rawValue.startsWith('/messages')) {
      return 'Messages';
    }

    if (rawValue === 'Super Admin' || rawValue.startsWith('/super-admin')) {
      return 'Super Admin';
    }

    if (rawValue === 'Directory' || rawValue.startsWith('/directory')) {
      return 'Directory';
    }

    if (
      rawValue === 'Management Positions' ||
      rawValue.startsWith('/management-positions')
    ) {
      return 'Management Positions';
    }

    if (rawValue === 'Profile' || rawValue.startsWith('/profile')) {
      return 'Profile';
    }

    if (rawValue === 'Settings' || rawValue.startsWith('/settings')) {
      return 'Settings';
    }

    if (rawValue === 'Dashboard' || rawValue === '/') {
      return 'Dashboard';
    }

    return 'Application';
  }

  private toSafeElementLabel(
    eventType: ActivityEventType,
    safePage: string | null,
    value: string | undefined,
  ): string | null {
    const cleaned = this.cleanText(value, 120);

    if (safePage === 'Announcements') {
      return cleaned ? 'Announcement lifecycle action' : null;
    }

    if (safePage === 'Messages') {
      if (cleaned?.toLowerCase().includes('send')) {
        return 'Send message';
      }

      if (
        cleaned?.toLowerCase().includes('upload') ||
        cleaned?.toLowerCase().includes('attach')
      ) {
        return 'Attachment action';
      }

      return cleaned ? 'Message module action' : null;
    }

    if (!cleaned) {
      return null;
    }

    if (eventType === ActivityEventType.BUTTON_CLICK) {
      return cleaned;
    }

    return cleaned;
  }

  private toSessionLabel(sessionId: string | null): string {
    return sessionId
      ? `S-${sessionId.slice(0, 8).toUpperCase()}`
      : 'No session';
  }

  private getKathmanduOfficeRange(query: SuperAdminActivityLogQueryDto) {
    const now = new Date();
    const today = this.getKathmanduDateString(now);
    const date = query.date?.slice(0, 10) ?? today;
    const fromTime = query.fromTime ?? DEFAULT_OFFICE_START_TIME;
    const toTime = query.toTime ?? DEFAULT_OFFICE_END_TIME;
    const start = this.getKathmanduDateTime(date, fromTime);
    const end = this.getKathmanduDateTime(date, toTime);

    return {
      date,
      fromTime,
      toTime,
      start,
      end: end.getTime() >= start.getTime() ? end : start,
    };
  }

  private getKathmanduDateTime(date: string, time: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);

    return new Date(
      Date.UTC(year, month - 1, day, hours, minutes) -
        KATHMANDU_OFFSET_MINUTES * 60 * 1000,
    );
  }

  private getKathmanduDateString(value: Date): string {
    const kathmanduDate = new Date(
      value.getTime() + KATHMANDU_OFFSET_MINUTES * 60 * 1000,
    );

    return [
      kathmanduDate.getUTCFullYear(),
      String(kathmanduDate.getUTCMonth() + 1).padStart(2, '0'),
      String(kathmanduDate.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  private isOfficeHoursKathmandu(value: Date): boolean {
    const kathmanduDate = new Date(
      value.getTime() + KATHMANDU_OFFSET_MINUTES * 60 * 1000,
    );
    const totalMinutes =
      kathmanduDate.getUTCHours() * 60 + kathmanduDate.getUTCMinutes();

    return totalMinutes >= 9 * 60 && totalMinutes <= 18 * 60;
  }

  private async cleanupOldMonitoringRecords(): Promise<void> {
    if (this.cleanupInProgress) {
      return;
    }

    this.cleanupInProgress = true;

    try {
      const eventCutoff = new Date(
        Date.now() - ACTIVITY_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      const summaryCutoff = this.getKathmanduDateOnly(
        new Date(
          Date.now() - DAILY_SUMMARY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        ),
      );

      // Retention deletes are independent maintenance operations. Running them
      // sequentially avoids reserving a transaction during API startup, while a
      // later cleanup cycle safely retries either operation after a DB failure.
      const events = await this.prisma.activityEvent.deleteMany({
        where: {
          occurredAt: {
            lt: eventCutoff,
          },
        },
      });
      const summaries = await this.prisma.dailyActivitySummary.deleteMany({
        where: {
          activityDate: {
            lt: summaryCutoff,
          },
        },
      });

      if (events.count > 0 || summaries.count > 0) {
        this.logger.log(
          `Monitoring retention cleanup removed ${events.count} events and ${summaries.count} daily summaries.`,
        );
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown database error';

      // Monitoring retention is background maintenance and must not terminate
      // the API when the database is temporarily busy. The next hourly run retries.
      this.logger.warn(`Monitoring retention cleanup was skipped: ${reason}`);
    } finally {
      this.cleanupInProgress = false;
    }
  }

  private getKathmanduDateOnly(value: Date): Date {
    const kathmanduDate = new Date(
      value.getTime() + KATHMANDU_OFFSET_MINUTES * 60 * 1000,
    );

    return new Date(
      Date.UTC(
        kathmanduDate.getUTCFullYear(),
        kathmanduDate.getUTCMonth(),
        kathmanduDate.getUTCDate(),
      ),
    );
  }

  private isAfterSixPmKathmandu(value: Date): boolean {
    const kathmanduDate = new Date(
      value.getTime() + KATHMANDU_OFFSET_MINUTES * 60 * 1000,
    );

    return kathmanduDate.getUTCHours() >= 18;
  }

  private cleanText(
    value: string | undefined | null,
    maxLength: number,
  ): string | null {
    const cleaned = value?.trim().replace(/\s+/g, ' ') ?? '';

    return cleaned ? cleaned.slice(0, maxLength) : null;
  }
}
