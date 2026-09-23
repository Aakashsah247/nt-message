import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { WorkSlaBasis } from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type { ReplaceOfficeWorkingCalendarDto } from './dto/work-sla.dto';

const KATHMANDU_OFFSET_MINUTES = 5 * 60 + 45;
type CalendarSnapshot = {
  id: string;
  officeId: string;
  timeZone: string;
  isActive: boolean;
  version: number;
  intervals: Array<{
    weekday: number;
    startMinute: number;
    endMinute: number;
  }>;
  closures: Array<{
    closureDate: Date;
  }>;
};

@Injectable()
export class WorkSlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  async getOfficeWorkingCalendar(user: AuthenticatedUser, officeId: string) {
    const [canView, canManage] = await Promise.all([
      this.authorization.can(
        user,
        CAPABILITIES.WORK_SLA_CALENDAR_VIEW,
        officeId,
        null,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.WORK_SLA_CALENDAR_MANAGE,
        officeId,
        null,
      ),
    ]);
    if (!canView && !canManage) {
      throw new ForbiddenException(
        'You do not have access to the Office working calendar.',
      );
    }

    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { id: true, code: true, name: true, isActive: true },
    });
    if (!office) {
      throw new NotFoundException('Office was not found.');
    }

    const calendar = await this.prisma.officeWorkingCalendar.findUnique({
      where: { officeId },
      select: {
        id: true,
        officeId: true,
        timeZone: true,
        isActive: true,
        version: true,
        updatedByAccountId: true,
        createdAt: true,
        updatedAt: true,
        intervals: {
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
          select: {
            id: true,
            weekday: true,
            startMinute: true,
            endMinute: true,
          },
        },
        closures: {
          orderBy: { closureDate: 'asc' },
          select: {
            id: true,
            closureDate: true,
            label: true,
          },
        },
      },
    });

    return {
      office,
      calendar: calendar
        ? {
            id: calendar.id,
            officeId: calendar.officeId,
            timeZone: calendar.timeZone,
            isActive: calendar.isActive,
            version: calendar.version,
            updatedByAccountId: calendar.updatedByAccountId,
            createdAt: calendar.createdAt,
            updatedAt: calendar.updatedAt,
            intervals: calendar.intervals,
            closures: calendar.closures.map((closure) => ({
              id: closure.id,
              date: this.dateKey(closure.closureDate),
              label: closure.label,
            })),
          }
        : null,
      availableActions: {
        view: true,
        manage: canManage,
      },
    };
  }

  async replaceOfficeWorkingCalendar(
    user: AuthenticatedUser,
    officeId: string,
    dto: ReplaceOfficeWorkingCalendarDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_SLA_CALENDAR_MANAGE,
      officeId,
      null,
    );
    this.validateCalendarInput(dto);

    await this.prisma.$transaction(async (tx) => {
      const office = await tx.office.findUnique({
        where: { id: officeId },
        select: { id: true, isActive: true },
      });
      if (!office) {
        throw new NotFoundException('Office was not found.');
      }
      if (!office.isActive) {
        throw new ConflictException(
          'An inactive Office cannot configure an SLA calendar.',
        );
      }

      await tx.$queryRaw`SELECT id FROM "offices" WHERE id = ${officeId}::uuid FOR UPDATE`;
      const current = await tx.officeWorkingCalendar.findUnique({
        where: { officeId },
        select: { id: true, version: true },
      });

      let calendarId: string;
      if (!current) {
        if (dto.expectedVersion !== 0) {
          throw new ConflictException(
            'The Office working calendar does not exist yet. Refresh and create it from version 0.',
          );
        }
        const created = await tx.officeWorkingCalendar.create({
          data: {
            officeId,
            timeZone: dto.timeZone,
            isActive: dto.isActive,
            updatedByAccountId: user.accountId,
          },
          select: { id: true },
        });
        calendarId = created.id;
      } else {
        if (current.version !== dto.expectedVersion) {
          throw new ConflictException(
            `Office working calendar changed from version ${dto.expectedVersion} to ${current.version}. Refresh and try again.`,
          );
        }
        const claimed = await tx.officeWorkingCalendar.updateMany({
          where: {
            id: current.id,
            version: dto.expectedVersion,
          },
          data: {
            timeZone: dto.timeZone,
            isActive: dto.isActive,
            updatedByAccountId: user.accountId,
            version: { increment: 1 },
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'The Office working calendar changed while it was being saved. Refresh and try again.',
          );
        }
        calendarId = current.id;
        await tx.officeWorkingCalendarInterval.deleteMany({
          where: { calendarId },
        });
        await tx.officeWorkingCalendarClosure.deleteMany({
          where: { calendarId },
        });
      }

      if (dto.intervals.length > 0) {
        await tx.officeWorkingCalendarInterval.createMany({
          data: dto.intervals.map((interval, index) => ({
            calendarId,
            weekday: interval.weekday,
            startMinute: interval.startMinute,
            endMinute: interval.endMinute,
            sortOrder: index,
          })),
        });
      }

      if (dto.closures.length > 0) {
        await tx.officeWorkingCalendarClosure.createMany({
          data: dto.closures.map((closure) => ({
            calendarId,
            closureDate: new Date(`${closure.date}T00:00:00.000Z`),
            label: closure.label?.trim() || null,
          })),
        });
      }
    });

    return this.getOfficeWorkingCalendar(user, officeId);
  }

  async assertUsableOfficeCalendar(
    tx: Prisma.TransactionClient,
    officeId: string,
  ): Promise<void> {
    await this.requireCalendar(tx, officeId);
  }

  async resolveDueAt(
    tx: Prisma.TransactionClient,
    officeId: string,
    basis: WorkSlaBasis,
    startsAt: Date,
    slaMinutes: number,
  ): Promise<Date> {
    if (!Number.isInteger(slaMinutes) || slaMinutes <= 0) {
      throw new BadRequestException(
        'SLA minutes must be a positive whole number.',
      );
    }
    if (basis === WorkSlaBasis.CALENDAR_DURATION) {
      return new Date(startsAt.getTime() + slaMinutes * 60_000);
    }

    const calendar = await this.requireCalendar(tx, officeId);
    return this.addOfficeWorkingMinutes(calendar, startsAt, slaMinutes);
  }

  private validateCalendarInput(dto: ReplaceOfficeWorkingCalendarDto): void {
    if (dto.timeZone !== 'Asia/Kathmandu') {
      throw new BadRequestException(
        'NT Message V1 supports the Asia/Kathmandu Office time zone only.',
      );
    }
    if (dto.isActive && dto.intervals.length === 0) {
      throw new BadRequestException(
        'An active Office working calendar requires at least one working interval.',
      );
    }

    const byWeekday = new Map<
      number,
      Array<{ startMinute: number; endMinute: number }>
    >();
    for (const interval of dto.intervals) {
      if (interval.startMinute >= interval.endMinute) {
        throw new BadRequestException(
          'Working interval end time must be after its start time.',
        );
      }
      const values = byWeekday.get(interval.weekday) ?? [];
      values.push({
        startMinute: interval.startMinute,
        endMinute: interval.endMinute,
      });
      byWeekday.set(interval.weekday, values);
    }
    for (const intervals of byWeekday.values()) {
      intervals.sort((a, b) => a.startMinute - b.startMinute);
      for (let index = 1; index < intervals.length; index += 1) {
        if (intervals[index].startMinute < intervals[index - 1].endMinute) {
          throw new BadRequestException(
            'Office working intervals cannot overlap on the same day.',
          );
        }
      }
    }

    const closureDates = new Set<string>();
    for (const closure of dto.closures) {
      const parsed = new Date(`${closure.date}T00:00:00.000Z`);
      if (
        Number.isNaN(parsed.getTime()) ||
        this.dateKey(parsed) !== closure.date
      ) {
        throw new BadRequestException(
          `Invalid Office closure date ${closure.date}.`,
        );
      }
      if (closureDates.has(closure.date)) {
        throw new BadRequestException(
          `Office closure date ${closure.date} is duplicated.`,
        );
      }
      closureDates.add(closure.date);
    }
  }

  private async requireCalendar(
    tx: Prisma.TransactionClient,
    officeId: string,
  ): Promise<CalendarSnapshot> {
    const calendar = await tx.officeWorkingCalendar.findUnique({
      where: { officeId },
      select: {
        id: true,
        officeId: true,
        timeZone: true,
        isActive: true,
        version: true,
        intervals: {
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
          select: { weekday: true, startMinute: true, endMinute: true },
        },
        closures: {
          select: { closureDate: true },
        },
      },
    });
    if (!calendar || !calendar.isActive || calendar.intervals.length === 0) {
      throw new ConflictException(
        'Office-working-duration SLA requires an active Office working calendar.',
      );
    }
    if (calendar.timeZone !== 'Asia/Kathmandu') {
      throw new ConflictException(
        'The Office working calendar time zone is not supported by NT Message V1.',
      );
    }
    return calendar;
  }

  private addOfficeWorkingMinutes(
    calendar: CalendarSnapshot,
    startsAt: Date,
    slaMinutes: number,
  ): Date {
    const closures = new Set(
      calendar.closures.map((closure) => this.dateKey(closure.closureDate)),
    );
    const intervalsByWeekday = new Map<
      number,
      Array<{ startMinute: number; endMinute: number }>
    >();
    for (const interval of calendar.intervals) {
      const values = intervalsByWeekday.get(interval.weekday) ?? [];
      values.push(interval);
      intervalsByWeekday.set(interval.weekday, values);
    }
    for (const values of intervalsByWeekday.values()) {
      values.sort((a, b) => a.startMinute - b.startMinute);
    }

    let cursor = new Date(startsAt);
    let remainingMs = slaMinutes * 60_000;
    for (let scannedDays = 0; scannedDays < 3660; scannedDays += 1) {
      const local = this.toKathmanduLocal(cursor);
      const dateKey = this.localDateKey(local);
      const weekday = local.weekday;
      const intervals = closures.has(dateKey)
        ? []
        : (intervalsByWeekday.get(weekday) ?? []);

      for (const interval of intervals) {
        const intervalStart = this.kathmanduLocalToUtc(
          local.year,
          local.month,
          local.day,
          interval.startMinute,
        );
        const intervalEnd = this.kathmanduLocalToUtc(
          local.year,
          local.month,
          local.day,
          interval.endMinute,
        );
        const effectiveStart = new Date(
          Math.max(cursor.getTime(), intervalStart.getTime()),
        );
        if (effectiveStart.getTime() >= intervalEnd.getTime()) {
          continue;
        }
        const availableMs = intervalEnd.getTime() - effectiveStart.getTime();
        if (remainingMs <= availableMs) {
          return new Date(effectiveStart.getTime() + remainingMs);
        }
        remainingMs -= availableMs;
        cursor = intervalEnd;
      }

      const nextLocalMidnight = this.kathmanduLocalToUtc(
        local.year,
        local.month,
        local.day + 1,
        0,
      );
      cursor = nextLocalMidnight;
    }

    throw new ConflictException(
      'Office working calendar could not resolve the configured SLA within the supported planning horizon.',
    );
  }

  private dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toKathmanduLocal(value: Date) {
    const shifted = new Date(
      value.getTime() + KATHMANDU_OFFSET_MINUTES * 60_000,
    );
    const jsWeekday = shifted.getUTCDay();
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth(),
      day: shifted.getUTCDate(),
      weekday: jsWeekday === 0 ? 7 : jsWeekday,
    };
  }

  private localDateKey(local: {
    year: number;
    month: number;
    day: number;
  }): string {
    return `${String(local.year).padStart(4, '0')}-${String(local.month + 1).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
  }

  private kathmanduLocalToUtc(
    year: number,
    month: number,
    day: number,
    minuteOfDay: number,
  ): Date {
    return new Date(
      Date.UTC(year, month, day, 0, minuteOfDay, 0, 0) -
        KATHMANDU_OFFSET_MINUTES * 60_000,
    );
  }
}
