import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  ActivityEventType,
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
  role: true,
  isEnabled: true,
  lastLoginAt: true,

  employee: {
    select: {
      empName: true,
      officialEmail: true,
      designation: true,

      division: {
        select: {
          name: true,
        },
      },

      departmentUnit: {
        select: {
          name: true,
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
      role: true,

      employee: {
        select: {
          empName: true,
          designation: true,

          division: {
            select: {
              name: true,
            },
          },

          departmentUnit: {
            select: {
              name: true,
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

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.cleanupOldMonitoringRecords();

    this.cleanupTimer = setInterval(() => {
      void this.cleanupOldMonitoringRecords();
    }, 60 * 60 * 1000);
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
    const safeLabel = this.toSafeElementLabel(dto.eventType, safePage, dto.elementLabel);

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

      const existingSummary = await transaction.dailyActivitySummary.findUnique({
        where: {
          accountId_activityDate: {
            accountId: user.accountId,
            activityDate,
          },
        },
      });

      if (!existingSummary) {
        await transaction.dailyActivitySummary.create({
          data: {
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
        });

        return;
      }

      await transaction.dailyActivitySummary.update({
        where: {
          id: existingSummary.id,
        },
        data: {
          firstLoginAt: existingSummary.firstLoginAt ?? counters.firstLoginAt,
          lastLogoutAt: counters.lastLogoutAt ?? existingSummary.lastLogoutAt,
          lastActiveAt: counters.lastActiveAt ?? existingSummary.lastActiveAt,
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
    });

    return {
      recorded: true,
    };
  }

  async getSuperAdminDashboard() {
    const today = this.getKathmanduDateOnly(new Date());
    const accounts = await this.prisma.account.findMany({
      where: {
        isEnabled: true,
      },
      orderBy: [
        {
          role: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
      select: accountMonitoringSelect,
    });

    const rows = accounts.map((account) =>
      this.toMonitoringRow(account, today, new Date()),
    );

    const totals = rows.reduce(
      (current, row) => ({
        active: current.active + (row.status === 'ACTIVE' ? 1 : 0),
        idle: current.idle + (row.status === 'IDLE' ? 1 : 0),
        offline: current.offline + (row.status === 'OFFLINE' ? 1 : 0),
        activeMinutes: current.activeMinutes + row.totalActiveMinutesToday,
        idleMinutes: current.idleMinutes + row.idleMinutesToday,
        actions: current.actions + row.actionsCount,
        emergencyAlerts:
          current.emergencyAlerts + row.emergencyAlertsSent,
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

    return {
      generatedAt: new Date().toISOString(),
      retention: {
        detailedActivityDays: ACTIVITY_EVENT_RETENTION_DAYS,
        dailySummaryDays: DAILY_SUMMARY_RETENTION_DAYS,
      },
      privacyNotice:
        'Monitoring stores activity metadata only. Message text, private recipients and private chat content are never recorded.',
      totals,
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
          occurredAt: 'asc',
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

    if (query.role) {
      and.push({
        account: {
          role: query.role,
        },
      });
    }

    if (query.department) {
      and.push({
        account: {
          employee: {
            is: {
              OR: [
                {
                  departmentUnit: {
                    name: {
                      contains: query.department,
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  division: {
                    name: {
                      contains: query.department,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
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
        record.account.employee?.empName ?? record.account.username ?? 'Unknown account',
      role: record.account.role,
      designation: record.account.employee?.designation ?? null,
      department:
        record.account.employee?.departmentUnit?.name ??
        record.account.employee?.division?.name ??
        null,
      pageName,
      eventType: record.eventType,
      actionLabel: this.toEventActionLabel(record.eventType),
      details: this.toSafeActivityDetails(record.eventType, pageName, record.elementLabel),
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
      role: account.role,
      designation: account.employee?.designation ?? null,
      division: account.employee?.division?.name ?? null,
      department: account.employee?.departmentUnit?.name ?? null,
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
      eventType === ActivityEventType.LOGIN && this.isAfterSixPmKathmandu(occurredAt)
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
        return {
          lastActiveAt: occurredAt,
          actionsCount: 1,
        };
      case ActivityEventType.ACTIVE_HEARTBEAT:
      case ActivityEventType.ACTIVE_RESUMED:
        return {
          lastActiveAt: occurredAt,
          activeMinutes: eventType === ActivityEventType.ACTIVE_HEARTBEAT ? 1 : 0,
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
      if (elementLabel === 'Send message' || elementLabel === 'Retry message upload') {
        return 'Private message activity recorded. Content, recipients and conversation hidden.';
      }

      if (elementLabel?.toLowerCase().includes('file') || elementLabel?.toLowerCase().includes('upload')) {
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

    if (eventType === ActivityEventType.SESSION_POLICY_LOGOUT) {
      return 'Session ended by daily 6 PM policy.';
    }

    if (eventType === ActivityEventType.LOGIN) {
      return 'User logged in successfully.';
    }

    if (eventType === ActivityEventType.LOGOUT) {
      return 'User logged out.';
    }

    if (eventType === ActivityEventType.IDLE_STARTED || eventType === ActivityEventType.IDLE_HEARTBEAT) {
      return 'User was idle during the monitoring interval.';
    }

    if (eventType === ActivityEventType.ACTIVE_RESUMED || eventType === ActivityEventType.ACTIVE_HEARTBEAT) {
      return 'User activity heartbeat recorded.';
    }

    return 'System activity recorded.';
  }

  private toSafePageName(value: string | null | undefined): string | null {
    const rawValue = value?.trim() ?? '';

    if (!rawValue) {
      return null;
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

    if (rawValue === 'Management Positions' || rawValue.startsWith('/management-positions')) {
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

    if (safePage === 'Messages') {
      if (cleaned?.toLowerCase().includes('send')) {
        return 'Send message';
      }

      if (cleaned?.toLowerCase().includes('upload') || cleaned?.toLowerCase().includes('attach')) {
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
    return sessionId ? `S-${sessionId.slice(0, 8).toUpperCase()}` : 'No session';
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
    const totalMinutes = kathmanduDate.getUTCHours() * 60 + kathmanduDate.getUTCMinutes();

    return totalMinutes >= 9 * 60 && totalMinutes <= 18 * 60;
  }

  private async cleanupOldMonitoringRecords(): Promise<void> {
    const eventCutoff = new Date(
      Date.now() - ACTIVITY_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const summaryCutoff = this.getKathmanduDateOnly(
      new Date(
        Date.now() - DAILY_SUMMARY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ),
    );

    const [events, summaries] = await this.prisma.$transaction([
      this.prisma.activityEvent.deleteMany({
        where: {
          occurredAt: {
            lt: eventCutoff,
          },
        },
      }),
      this.prisma.dailyActivitySummary.deleteMany({
        where: {
          activityDate: {
            lt: summaryCutoff,
          },
        },
      }),
    ]);

    if (events.count > 0 || summaries.count > 0) {
      this.logger.log(
        `Monitoring retention cleanup removed ${events.count} events and ${summaries.count} daily summaries.`,
      );
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

  private cleanText(value: string | undefined | null, maxLength: number): string | null {
    const cleaned = value?.trim().replace(/\s+/g, ' ') ?? '';

    return cleaned ? cleaned.slice(0, maxLength) : null;
  }
}
