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
  AccountRole,
  DutyActivityAction,
  DutyAssignmentAuthority,
  DutyHolidayType,
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
  DutyExceptionType,
  DutyRecurrenceType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CancelDutyAssignmentDto } from './dto/cancel-duty-assignment.dto';
import { CreateBulkDutyScheduleDto } from './dto/create-bulk-duty-schedule.dto';
import { CreateDutyHolidayDto, DutyHolidayScope } from './dto/create-duty-holiday.dto';
import { CreateDutyLeaveDto } from './dto/create-duty-leave.dto';
import { CreateDutyScheduleDto } from './dto/create-duty-schedule.dto';
import { CreateDutyShiftTemplateDto, DutyShiftScope } from './dto/create-duty-shift-template.dto';
import { DutyRosterQueryDto } from './dto/duty-roster-query.dto';
import { DutyShiftTargetScope, DutyShiftTemplateQueryDto } from './dto/duty-shift-template-query.dto';
import { ListDutyHolidaysQueryDto } from './dto/list-duty-holidays-query.dto';
import {
  DutyAssignmentListView,
  ListDutyAssignmentsQueryDto,
} from './dto/list-duty-assignments-query.dto';
import { UpdateDutyAssignmentDto } from './dto/update-duty-assignment.dto';
import { UpdateDutyHolidayDto } from './dto/update-duty-holiday.dto';
import { UpdateDutyShiftTemplateDto } from './dto/update-duty-shift-template.dto';
import { UpdateDutyWeeklyOffDto } from './dto/update-duty-weekly-off.dto';
import { DutyNotificationsService } from './duty-notifications.service';
import { workAccountSummarySelect } from './work-items.service';
import { WorkScopeService } from './work-scope.service';
import type { WorkAccountRecord, WorkActorContext } from './work-scope.service';

const KATHMANDU_OFFSET_MINUTES = 5 * 60 + 45;
const MAX_SCHEDULE_DAYS = 93;
const MAX_ASSIGNMENTS_PER_REQUEST = 100;
// Limits bound database work while still supporting practical weekly and monthly planning.
const MAX_BULK_ASSIGNMENTS_PER_REQUEST = 1000;
const MAX_ROSTER_DAYS = 31;
const MIN_DUTY_REST_MINUTES = 8 * 60;

const shiftTemplateSelect = {
  id: true,
  name: true,
  startMinute: true,
  endMinute: true,
  spansNextDay: true,
  isActive: true,
  divisionId: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DutyShiftTemplateSelect;

const dutyAssignmentSelect = {
  id: true,
  seriesId: true,
  employeeAccountId: true,
  shiftTemplateId: true,
  shiftName: true,
  shiftStartMinute: true,
  shiftEndMinute: true,
  shiftSpansNextDay: true,
  supervisorAccountId: true,
  createdByAccountId: true,
  divisionId: true,
  departmentId: true,
  dutyDate: true,
  startsAt: true,
  endsAt: true,
  reportingLocation: true,
  notes: true,
  authority: true,
  overrideReason: true,
  hierarchyOverride: true,
  conflictOverride: true,
  cancelledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: workAccountSummarySelect },
  supervisor: { select: workAccountSummarySelect },
  createdBy: { select: workAccountSummarySelect },
  shift: { select: shiftTemplateSelect },
  division: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, code: true, name: true } },
} satisfies Prisma.DutyAssignmentSelect;

const dutyActivitySelect = {
  id: true,
  dutyAssignmentId: true,
  seriesId: true,
  employeeAccountId: true,
  actorAccountId: true,
  action: true,
  details: true,
  createdAt: true,
  actor: { select: workAccountSummarySelect },
} satisfies Prisma.DutyActivitySelect;

const dutyExceptionSelect = {
  id: true,
  employeeAccountId: true,
  divisionId: true,
  departmentId: true,
  exceptionDate: true,
  type: true,
  note: true,
  createdAt: true,
  employee: { select: workAccountSummarySelect },
} satisfies Prisma.DutyExceptionSelect;

const dutyHolidaySelect = {
  id: true,
  name: true,
  type: true,
  startDate: true,
  endDate: true,
  divisionId: true,
  departmentId: true,
  note: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  division: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, divisionId: true, code: true, name: true } },
  createdBy: { select: workAccountSummarySelect },
  updatedBy: { select: workAccountSummarySelect },
} satisfies Prisma.DutyHolidaySelect;

const dutyRosterAccountSelect = {
  id: true,
  role: true,
  username: true,
  superAdminProfile: { select: { fullName: true } },
  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
      divisionId: true,
      departmentId: true,
      division: { select: { id: true, code: true, name: true } },
      departmentUnit: {
        select: { id: true, divisionId: true, code: true, name: true },
      },
      managementAssignments: {
        where: { endedAt: null },
        take: 1,
        orderBy: { startedAt: 'desc' },
        select: {
          position: {
            select: {
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
} satisfies Prisma.AccountSelect;

type DutyRosterAccount = Prisma.AccountGetPayload<{
  select: typeof dutyRosterAccountSelect;
}>;

type DutyWindow = { date: string; startsAt: Date; endsAt: Date };
type DutyConflictKind = 'DUTY_CONFLICT' | 'REST_PERIOD' | 'LEAVE';
type DutyWarningKind = 'HOLIDAY' | 'WEEKLY_OFF';

interface DutyWindowConflict {
  window: DutyWindow;
  type: DutyConflictKind;
  message: string;
  existingAssignmentId: string | null;
}

interface DutyWindowWarning {
  window: DutyWindow;
  type: DutyWarningKind;
  message: string;
  holidayId: string | null;
}

type BulkScheduleLike = Pick<
  CreateBulkDutyScheduleDto,
  | 'recurrenceType'
  | 'startDate'
  | 'endDate'
  | 'weekdays'
  | 'reportingLocation'
  | 'notes'
>;

@Injectable()
export class DutyScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
    private readonly dutyNotifications: DutyNotificationsService,
  ) {}

  async createShiftTemplate(
    user: AuthenticatedUser,
    dto: CreateDutyShiftTemplateDto,
  ) {
    const actor = await this.resolveManager(user);
    const startMinute = this.parseTime(dto.startTime, 'Start time');
    const endMinute = this.parseTime(dto.endTime, 'End time');

    if (startMinute === endMinute) {
      throw new BadRequestException(
        'A duty shift must have different start and end times.',
      );
    }

    const scope = await this.resolveTemplateScope(
      actor,
      dto.scope,
      dto.divisionId,
      dto.departmentId,
    );
    const existing = await this.prisma.dutyShiftTemplate.findFirst({
      where: {
        name: { equals: dto.name.trim(), mode: 'insensitive' },
        divisionId: scope.divisionId,
        departmentId: scope.departmentId,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'A shift template with this name already exists in your scope.',
      );
    }

    const template = await this.prisma.dutyShiftTemplate.create({
      data: {
        name: dto.name.trim(),
        startMinute,
        endMinute,
        spansNextDay: endMinute <= startMinute,
        divisionId: scope.divisionId,
        departmentId: scope.departmentId,
        createdByAccountId: actor.accountId,
      },
      select: shiftTemplateSelect,
    });

    return {
      message: 'Duty shift template created successfully.',
      template: this.serializeTemplate(template),
    };
  }

  async updateShiftTemplate(
    user: AuthenticatedUser,
    templateId: string,
    dto: UpdateDutyShiftTemplateDto,
  ) {
    const actor = await this.resolveManager(user);
    const current = await this.findManageableTemplate(actor, templateId);
    const startMinute =
      dto.startTime === undefined
        ? current.startMinute
        : this.parseTime(dto.startTime, 'Start time');
    const endMinute =
      dto.endTime === undefined
        ? current.endMinute
        : this.parseTime(dto.endTime, 'End time');

    if (startMinute === endMinute) {
      throw new BadRequestException(
        'A duty shift must have different start and end times.',
      );
    }

    if (dto.name?.trim()) {
      const duplicate = await this.prisma.dutyShiftTemplate.findFirst({
        where: {
          id: { not: current.id },
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          divisionId: current.divisionId,
          departmentId: current.departmentId,
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException(
          'A shift template with this name already exists in your scope.',
        );
      }
    }

    const template = await this.prisma.dutyShiftTemplate.update({
      where: { id: current.id },
      data: {
        name: dto.name?.trim(),
        startMinute,
        endMinute,
        spansNextDay: endMinute <= startMinute,
        isActive: dto.isActive,
      },
      select: shiftTemplateSelect,
    });

    return {
      message: 'Shift updated successfully.',
      template: this.serializeTemplate(template),
    };
  }

  async listShiftTemplates(
    user: AuthenticatedUser,
    query: DutyShiftTemplateQueryDto = {},
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const targetWhere = await this.assignmentTemplateWhere(actor, query);
    const templates = await this.prisma.dutyShiftTemplate.findMany({
      where: targetWhere
        ? { AND: [this.visibleTemplateWhere(actor), targetWhere] }
        : this.visibleTemplateWhere(actor),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: shiftTemplateSelect,
    });

    return {
      data: templates.map((template) => ({
        ...this.serializeTemplate(template),
        canManage: this.canManageTemplate(actor, template),
      })),
    };
  }

  async deleteShiftTemplate(user: AuthenticatedUser, templateId: string) {
    const actor = await this.resolveManager(user);
    const template = await this.findManageableTemplate(actor, templateId);
    const now = new Date();

    const [currentOrUpcoming, requirementCount] = await Promise.all([
      this.prisma.dutyAssignment.count({
        where: {
          shiftTemplateId: template.id,
          cancelledAt: null,
          endsAt: { gte: now },
        },
      }),
      this.prisma.dutyCoverageRequirement.count({
        where: { shiftTemplateId: template.id },
      }),
    ]);

    if (currentOrUpcoming > 0) {
      throw new ConflictException(
        'This shift is used in a current or upcoming duty. Change or cancel those duties first.',
      );
    }

    if (requirementCount > 0) {
      throw new ConflictException(
        'This shift is used in duty coverage settings. Remove those settings first.',
      );
    }

    // Save the shift name and time on older duty rows before permanent deletion.
    await this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const snapshot = {
        shiftName: template.name,
        shiftStartMinute: template.startMinute,
        shiftEndMinute: template.endMinute,
        shiftSpansNextDay: template.spansNextDay,
      };
      await transaction.dutyScheduleSeries.updateMany({
        where: { shiftTemplateId: template.id },
        data: snapshot,
      });
      await transaction.dutyAssignment.updateMany({
        where: { shiftTemplateId: template.id },
        data: snapshot,
      });
      await transaction.dutyShiftTemplate.delete({
        where: { id: template.id },
      });
    });

    return { message: `Shift “${template.name}” deleted successfully.` };
  }

  async createSchedule(user: AuthenticatedUser, dto: CreateDutyScheduleDto) {
    const actor = await this.resolveManager(user);
    const [employee] = await this.workScopeService.resolveAssignableAccounts(
      actor,
      [dto.employeeAccountId],
    );
    const employeeDivisionId = employee.employee?.divisionId;
    // Normalize the optional employee relation so downstream scope checks receive an explicit nullable department.
    const employeeDepartmentId = employee.employee?.departmentId ?? null;

    if (!employeeDivisionId) {
      throw new ForbiddenException(
        'The selected staff member does not have an active division assignment.',
      );
    }
    if (
      employee.role !== AccountRole.SENIOR_MANAGEMENT &&
      !employeeDepartmentId
    ) {
      throw new ForbiddenException(
        'The selected staff member does not have a complete department assignment.',
      );
    }

    const shift = await this.findVisibleTemplate(actor, dto.shiftTemplateId);
    if (!shift.isActive) {
      throw new ConflictException('This shift is no longer available. Choose another shift.');
    }
    this.assertTemplateMatchesEmployeeScope(
      shift,
      employeeDivisionId,
      employeeDepartmentId,
    );
    const supervisor = await this.workScopeService.resolveResponsibleManager(
      actor,
      dto.supervisorAccountId,
      employeeDivisionId,
      employeeDepartmentId,
    );
    // Expand recurring rules into concrete rows so conflicts can be reviewed before any write.
    const dates = this.expandScheduleDates(dto);

    if (dates.length > MAX_ASSIGNMENTS_PER_REQUEST) {
      throw new BadRequestException(
        `A single duty schedule can create at most ${MAX_ASSIGNMENTS_PER_REQUEST} assignments.`,
      );
    }

    const windows: DutyWindow[] = dates.map((date) => ({
      date,
      ...this.assignmentWindow(date, shift.startMinute, shift.endMinute),
    }));
    const conflicts = await this.inspectScheduleConflicts(employee.id, windows);
    if (conflicts.length > 0) {
      throw new ConflictException(conflicts[0].message);
    }

    const startDate = this.parseDateOnly(dto.startDate, 'Start date');
    const endDate = this.parseDateOnly(
      dto.recurrenceType === DutyRecurrenceType.ONE_TIME
        ? dto.startDate
        : dto.endDate ?? dto.startDate,
      'End date',
    );
    const reportingLocation = dto.reportingLocation.trim();
    const notes = this.optionalText(dto.notes);

    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const series = await transaction.dutyScheduleSeries.create({
          data: {
            employeeAccountId: employee.id,
            shiftTemplateId: shift.id,
            shiftName: shift.name,
            shiftStartMinute: shift.startMinute,
            shiftEndMinute: shift.endMinute,
            shiftSpansNextDay: shift.spansNextDay,
            supervisorAccountId: supervisor.id,
            createdByAccountId: actor.accountId,
            divisionId: employeeDivisionId,
            departmentId: employeeDepartmentId,
            recurrenceType: dto.recurrenceType,
            startDate,
            endDate,
            weekdays: dto.weekdays ?? [],
            reportingLocation,
            notes,
            authority: DutyAssignmentAuthority.STANDARD_HIERARCHY,
            overrideReason: null,
            hierarchyOverride: false,
            conflictOverride: false,
          },
          select: { id: true },
        });

        // Store one assignment per duty date; the series preserves the original recurrence intent.
        const assignments: Prisma.DutyAssignmentGetPayload<{
          select: typeof dutyAssignmentSelect;
        }>[] = [];

        for (const window of windows) {
          const authority = DutyAssignmentAuthority.STANDARD_HIERARCHY;
          const assignment = await transaction.dutyAssignment.create({
            data: {
              seriesId: series.id,
              employeeAccountId: employee.id,
              shiftTemplateId: shift.id,
              shiftName: shift.name,
              shiftStartMinute: shift.startMinute,
              shiftEndMinute: shift.endMinute,
              shiftSpansNextDay: shift.spansNextDay,
              supervisorAccountId: supervisor.id,
              createdByAccountId: actor.accountId,
              divisionId: employeeDivisionId,
              departmentId: employeeDepartmentId,
              dutyDate: this.parseDateOnly(window.date, 'Duty date'),
              startsAt: window.startsAt,
              endsAt: window.endsAt,
              reportingLocation,
              notes,
              authority,
              overrideReason: null,
              hierarchyOverride: false,
              conflictOverride: false,
            },
            select: dutyAssignmentSelect,
          });
          assignments.push(assignment);
        }

        await transaction.dutyActivity.createMany({
          data: assignments.map((assignment) => {
            return {
              dutyAssignmentId: assignment.id,
              seriesId: series.id,
              employeeAccountId: employee.id,
              actorAccountId: actor.accountId,
              action: DutyActivityAction.ASSIGNED,
              details: {
                source: 'SINGLE_SCHEDULE',
                startsAt: assignment.startsAt.toISOString(),
                endsAt: assignment.endsAt.toISOString(),
                reportingLocation,
                shiftTemplateId: shift.id,
                shiftName: shift.name,
                divisionId: employeeDivisionId,
                departmentId: employeeDepartmentId,
                supervisorAccountId: supervisor.id,
                assigneeName:
                  employee.employee?.empName ??
                  employee.username ??
                  employee.role,
                authority: assignment.authority,
                hierarchyOverride: false,
                conflictOverride: false,
                assignerRole: actor.role,
                assigneeRole: employee.role,
              },
            };
          }),
        });

        return { seriesId: series.id, assignments };
      },
    );

    const recipientAccountIds = await this.resolveDutyNotificationRecipients({
      actor,
      assignee: employee,
      supervisorAccountId: supervisor.id,
    });
    for (const assignment of result.assignments) {
      await this.dutyNotifications.publishDutyUpdate({
        assignmentId: assignment.id,
        employeeAccountId: employee.id,
        action: 'ASSIGNED',
        actorAccountId: actor.accountId,
        recipientAccountIds,
        title: 'Duty assigned',
        body: this.dutyNotificationBody(
          assignment.dutyDate,
          shift.name,
          null,
        ),
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
        metadata: {
          seriesId: result.seriesId,
          authority: assignment.authority,
          hierarchyOverride: assignment.hierarchyOverride,
          conflictOverride: assignment.conflictOverride,
          overrideReason: assignment.overrideReason,
        },
      });
    }

    return {
      message: `${result.assignments.length} duty assignment${result.assignments.length === 1 ? '' : 's'} created successfully.`,
      seriesId: result.seriesId,
      assignments: result.assignments.map((assignment) =>
        this.serializeAssignment(assignment),
      ),
    };
  }

  async previewBulkSchedule(
    user: AuthenticatedUser,
    dto: CreateBulkDutyScheduleDto,
  ) {
    const actor = await this.resolveManager(user);
    const prepared = await this.prepareBulkSchedule(actor, dto);
    return this.serializeBulkPreview(prepared);
  }

  async createBulkSchedule(
    user: AuthenticatedUser,
    dto: CreateBulkDutyScheduleDto,
  ) {
    const actor = await this.resolveManager(user);
    // Creation reruns the authoritative preview checks instead of trusting browser state.
    const prepared = await this.prepareBulkSchedule(actor, dto);
    const conflictCount = prepared.people.reduce(
      (total, person) => total + person.conflicts.length,
      0,
    );
    const warningCount = prepared.people.reduce(
      (total, person) => total + person.warnings.length,
      0,
    );

    if (conflictCount > 0 && !dto.createValidAssignmentsOnly) {
      throw new ConflictException(
        'Blocked duty dates were found. Review the conflicts or choose Assign ready duties only.',
      );
    }

    const assignmentCount = prepared.people.reduce(
      (total, person) => total + person.validWindows.length,
      0,
    );
    if (assignmentCount === 0) {
      throw new ConflictException(
        'No ready duty assignments remain after overlap, rest and leave checks.',
      );
    }

    const reportingLocation = dto.reportingLocation.trim();
    const notes = this.optionalText(dto.notes);
    const created = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const assignments: Prisma.DutyAssignmentGetPayload<{
          select: typeof dutyAssignmentSelect;
        }>[] = [];

        for (const person of prepared.people) {
          const windowsToCreate = [...person.validWindows].sort(
            (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
          );
          if (windowsToCreate.length === 0) continue;

          const series = await transaction.dutyScheduleSeries.create({
            data: {
              employeeAccountId: person.account.id,
              shiftTemplateId: prepared.shift.id,
              shiftName: prepared.shift.name,
              shiftStartMinute: prepared.shift.startMinute,
              shiftEndMinute: prepared.shift.endMinute,
              shiftSpansNextDay: prepared.shift.spansNextDay,
              supervisorAccountId: person.supervisor.id,
              createdByAccountId: actor.accountId,
              divisionId: person.divisionId,
              departmentId: person.departmentId,
              recurrenceType: dto.recurrenceType,
              startDate: this.parseDateOnly(dto.startDate, 'Start date'),
              endDate: this.parseDateOnly(
                dto.recurrenceType === DutyRecurrenceType.ONE_TIME
                  ? dto.startDate
                  : dto.endDate ?? dto.startDate,
                'End date',
              ),
              weekdays: dto.weekdays ?? [],
              reportingLocation,
              notes,
              authority: DutyAssignmentAuthority.STANDARD_HIERARCHY,
              overrideReason: null,
              hierarchyOverride: false,
              conflictOverride: false,
            },
            select: { id: true },
          });

          for (const window of windowsToCreate) {
            const assignment = await transaction.dutyAssignment.create({
              data: {
                seriesId: series.id,
                employeeAccountId: person.account.id,
                shiftTemplateId: prepared.shift.id,
                shiftName: prepared.shift.name,
                shiftStartMinute: prepared.shift.startMinute,
                shiftEndMinute: prepared.shift.endMinute,
                shiftSpansNextDay: prepared.shift.spansNextDay,
                supervisorAccountId: person.supervisor.id,
                createdByAccountId: actor.accountId,
                divisionId: person.divisionId,
                departmentId: person.departmentId,
                dutyDate: this.parseDateOnly(window.date, 'Duty date'),
                startsAt: window.startsAt,
                endsAt: window.endsAt,
                reportingLocation,
                notes,
                authority: DutyAssignmentAuthority.STANDARD_HIERARCHY,
                overrideReason: null,
                hierarchyOverride: false,
                conflictOverride: false,
              },
              select: dutyAssignmentSelect,
            });
            assignments.push(assignment);
            await transaction.dutyActivity.create({
              data: {
                dutyAssignmentId: assignment.id,
                seriesId: series.id,
                employeeAccountId: person.account.id,
                actorAccountId: actor.accountId,
                action: DutyActivityAction.ASSIGNED,
                details: {
                  source: 'BULK_ROSTER',
                  startsAt: assignment.startsAt.toISOString(),
                  endsAt: assignment.endsAt.toISOString(),
                  reportingLocation,
                  shiftTemplateId: prepared.shift.id,
                  shiftName: prepared.shift.name,
                  divisionId: person.divisionId,
                  departmentId: person.departmentId,
                  supervisorAccountId: person.supervisor.id,
                  assigneeName:
                    person.account.employee?.empName ??
                    person.account.superAdminProfile?.fullName ??
                    person.account.username ??
                    person.account.role,
                  authority: DutyAssignmentAuthority.STANDARD_HIERARCHY,
                  assignerRole: actor.role,
                  assigneeRole: person.account.role,
                },
              },
            });
          }
        }

        return assignments;
      },
    );

    const notificationCache = new Map<string, string[]>();
    for (const assignment of created) {
      const recipientAccountIds = await this.resolveDutyNotificationRecipients(
        {
          actor,
          assignee: assignment.employee,
          supervisorAccountId: assignment.supervisorAccountId,
        },
        notificationCache,
      );
      await this.dutyNotifications.publishDutyUpdate({
        assignmentId: assignment.id,
        employeeAccountId: assignment.employeeAccountId,
        action: 'ASSIGNED',
        actorAccountId: actor.accountId,
        recipientAccountIds,
        title: 'Duty assigned',
        body: this.dutyNotificationBody(
          assignment.dutyDate,
          assignment.shiftName,
          null,
        ),
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
        metadata: {
          source: 'BULK_ROSTER',
          authority: DutyAssignmentAuthority.STANDARD_HIERARCHY,
          holidayOrWeeklyOffWarning: warningCount > 0,
        },
      });
    }

    return {
      message: `${created.length} duty assignments created successfully.`,
      createdCount: created.length,
      skippedConflictCount: dto.createValidAssignmentsOnly ? conflictCount : 0,
      warningCount,
      assignments: created.map((assignment) =>
        this.serializeAssignment(assignment),
      ),
    };
  }

  async getRoster(user: AuthenticatedUser, query: DutyRosterQueryDto) {
    // A roster row represents one person; concrete assignment rows stay nested under that person.
    const actor = await this.resolveManager(user);
    const defaultFrom = this.startOfWeek(this.localDateString(new Date()));
    const fromText = query.from ?? defaultFrom;
    const toText = query.to ?? this.addDays(fromText, 6);
    const from = this.parseDateOnly(fromText, 'From date');
    const to = this.parseDateOnly(toText, 'To date');
    const dayCount = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;

    if (dayCount < 1 || dayCount > MAX_ROSTER_DAYS) {
      throw new BadRequestException(
        `Roster views can cover between 1 and ${MAX_ROSTER_DAYS} calendar days.`,
      );
    }
    if (query.divisionId) {
      await this.assertDivisionInsideScope(actor, query.divisionId);
    }
    if (query.departmentId) {
      await this.assertDepartmentInsideScope(actor, query.departmentId);
    }

    const accountWhere = this.buildDutyRosterAccountWhere(actor, query);
    // Staff visibility follows the same role hierarchy used for duty assignment authority.
    const people = await this.prisma.account.findMany({
      where: accountWhere,
      orderBy: { employee: { empName: 'asc' } },
      take: query.limit ?? 250,
      select: dutyRosterAccountSelect,
    });
    const accountIds = people.map((person) => person.id);
    const assignmentWhere: Prisma.DutyAssignmentWhereInput = {
      ...this.visibleAssignmentWhere(actor),
      employeeAccountId: { in: accountIds },
      dutyDate: { gte: from, lte: to },
      cancelledAt: null,
      ...(query.divisionId ? { divisionId: query.divisionId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };
    const exceptionWhere: Prisma.DutyExceptionWhereInput = {
      ...this.visibleExceptionWhere(actor),
      employeeAccountId: { in: accountIds },
      exceptionDate: { gte: from, lte: to },
      ...(query.divisionId ? { divisionId: query.divisionId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      type: DutyExceptionType.LEAVE,
    };
    const [assignments, exceptions, departments] = await Promise.all([
      this.prisma.dutyAssignment.findMany({
        where: assignmentWhere,
        orderBy: [{ startsAt: 'asc' }],
        select: dutyAssignmentSelect,
      }),
      this.prisma.dutyException.findMany({
        where: exceptionWhere,
        orderBy: [{ exceptionDate: 'asc' }],
        select: dutyExceptionSelect,
      }),
      this.listRosterDepartments(actor),
    ]);

    const days = Array.from({ length: dayCount }, (_, index) =>
      this.addDays(fromText, index),
    );
    // Group once in memory so rendering a roster does not issue one query per person.
    const assignmentsByAccount = new Map<string, typeof assignments>();
    const exceptionsByAccount = new Map<string, typeof exceptions>();
    for (const assignment of assignments) {
      const list = assignmentsByAccount.get(assignment.employeeAccountId) ?? [];
      list.push(assignment);
      assignmentsByAccount.set(assignment.employeeAccountId, list);
    }
    for (const exception of exceptions) {
      const list = exceptionsByAccount.get(exception.employeeAccountId) ?? [];
      list.push(exception);
      exceptionsByAccount.set(exception.employeeAccountId, list);
    }

    const now = new Date();
    const today = this.localDateString(now);
    const rosterPeople = people.map((person) => {
      const personAssignments = assignmentsByAccount.get(person.id) ?? [];
      const personExceptions = exceptionsByAccount.get(person.id) ?? [];
      const totalMinutes = personAssignments.reduce(
        (total, assignment) =>
          total +
          Math.max(
            0,
            assignment.endsAt.getTime() - assignment.startsAt.getTime(),
          ) /
            60_000,
        0,
      );
      const current = personAssignments.find(
        (assignment) => assignment.startsAt <= now && assignment.endsAt > now,
      );
      const next = personAssignments.find(
        (assignment) => assignment.startsAt > now,
      );

      return {
        account: this.serializeRosterAccount(person),
        totalScheduledMinutes: Math.round(totalMinutes),
        current: current ? this.serializeAssignment(current) : null,
        next: next ? this.serializeAssignment(next) : null,
        overrideAssignments: personAssignments.filter(
          (assignment) =>
            assignment.authority ===
            DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
        ).length,
        hierarchyOverrides: personAssignments.filter(
          (assignment) => assignment.hierarchyOverride,
        ).length,
        conflictOverrides: personAssignments.filter(
          (assignment) => assignment.conflictOverride,
        ).length,
        assignments: personAssignments.map((assignment) =>
          this.serializeAssignment(assignment),
        ),
        exceptions: personExceptions.map((exception) =>
          this.serializeException(exception),
        ),
        todayStatus: current
          ? 'ON_DUTY'
          : personExceptions.some(
                (exception) => this.dateOnlyString(exception.exceptionDate) === today,
              )
            ? 'EXCEPTION'
            : personAssignments.some(
                  (assignment) => this.dateOnlyString(assignment.dutyDate) === today,
                )
              ? 'SCHEDULED_LATER'
              : 'OFF_DUTY',
      };
    });

    const daily = days.map((date) => {
      const dateAssignments = assignments.filter(
        (assignment) => this.dateOnlyString(assignment.dutyDate) === date,
      );
      const dateExceptions = exceptions.filter(
        (exception) => this.dateOnlyString(exception.exceptionDate) === date,
      );
      return {
        date,
        scheduledPeople: new Set(
          dateAssignments.map((assignment) => assignment.employeeAccountId),
        ).size,
        assignmentCount: dateAssignments.length,
        leaveCount: dateExceptions.filter(
          (exception) => exception.type === DutyExceptionType.LEAVE,
        ).length,
        holidayCount: 0,
        overrideAssignments: dateAssignments.filter(
          (assignment) =>
            assignment.authority ===
            DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
        ).length,
        hierarchyOverrides: dateAssignments.filter(
          (assignment) => assignment.hierarchyOverride,
        ).length,
        conflictOverrides: dateAssignments.filter(
          (assignment) => assignment.conflictOverride,
        ).length,
      };
    });

    const departmentRows = departments.map((department) => {
      const departmentPeople = rosterPeople.filter(
        (person) => person.account.employee?.department?.id === department.id,
      );
      const departmentAssignments = assignments.filter(
        (assignment) => assignment.departmentId === department.id,
      );
      return {
        ...department,
        people: departmentPeople.length,
        scheduledPeople: new Set(
          departmentAssignments.map((assignment) => assignment.employeeAccountId),
        ).size,
        assignmentCount: departmentAssignments.length,
        leaveCount: exceptions.filter(
          (exception) =>
            exception.departmentId === department.id &&
            exception.type === DutyExceptionType.LEAVE,
        ).length,
        holidayCount: 0,
        overrideAssignments: departmentAssignments.filter(
          (assignment) =>
            assignment.authority ===
            DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
        ).length,
        hierarchyOverrides: departmentAssignments.filter(
          (assignment) => assignment.hierarchyOverride,
        ).length,
        conflictOverrides: departmentAssignments.filter(
          (assignment) => assignment.conflictOverride,
        ).length,
      };
    });

    return {
      timezone: 'Asia/Kathmandu' as const,
      generatedAt: now.toISOString(),
      scope: actor,
      period: { from: fromText, to: toText, days },
      totals: {
        people: rosterPeople.length,
        scheduledPeople: new Set(
          assignments.map((assignment) => assignment.employeeAccountId),
        ).size,
        assignments: assignments.length,
        leave: exceptions.filter(
          (exception) => exception.type === DutyExceptionType.LEAVE,
        ).length,
        holiday: 0,
        overrideAssignments: assignments.filter(
          (assignment) =>
            assignment.authority ===
            DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
        ).length,
        hierarchyOverrides: assignments.filter(
          (assignment) => assignment.hierarchyOverride,
        ).length,
        conflictOverrides: assignments.filter(
          (assignment) => assignment.conflictOverride,
        ).length,
      },
      people: rosterPeople,
      daily,
      departments: departmentRows,
    };
  }

  async listAssignments(
    user: AuthenticatedUser,
    query: ListDutyAssignmentsQueryDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const from = this.parseDateOnly(
      query.from ?? this.localDateString(new Date()),
      'From date',
    );
    const to = this.parseDateOnly(
      query.to ?? this.addDays(this.localDateString(new Date()), 30),
      'To date',
    );

    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('To date must be on or after From date.');
    }

    const where: Prisma.DutyAssignmentWhereInput = {
      ...this.visibleAssignmentWhere(actor),
      dutyDate: { gte: from, lte: to },
      cancelledAt: query.includeCancelled ? undefined : null,
    };

    if (query.employeeAccountId) {
      if (
        actor.role === AccountRole.EMPLOYEE &&
        query.employeeAccountId !== actor.accountId
      ) {
        throw new ForbiddenException(
          "Employees cannot view another employee's duty schedule.",
        );
      }
      where.employeeAccountId = query.employeeAccountId;
    }

    if (query.departmentId) {
      await this.assertDepartmentInsideScope(actor, query.departmentId);
      where.departmentId = query.departmentId;
    }

    const view = query.view ?? DutyAssignmentListView.ALL;
    if (view === DutyAssignmentListView.ASSIGNED_BY_ME) {
      where.createdByAccountId = actor.accountId;
    }
    if (view === DutyAssignmentListView.MANAGEMENT_DUTIES) {
      if (actor.role === AccountRole.TEAM_MANAGER) {
        throw new ForbiddenException(
          'Team Managers do not have access to division management-duty oversight.',
        );
      }
      // Senior Management reviews Team Manager duty; Super Admin reviews both management tiers.
      where.employee = {
        is: {
          role:
            actor.role === AccountRole.SUPER_ADMIN
              ? {
                  in: [
                    AccountRole.SENIOR_MANAGEMENT,
                    AccountRole.TEAM_MANAGER,
                  ],
                }
              : AccountRole.TEAM_MANAGER,
        },
      };
    }
    if (view === DutyAssignmentListView.OVERRIDES) {
      where.authority = DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE;
    }

    const skip = (query.page - 1) * query.limit;
    const [records, total] = await Promise.all([
      this.prisma.dutyAssignment.findMany({
        where,
        orderBy: [{ startsAt: 'asc' }],
        skip,
        take: query.limit,
        select: dutyAssignmentSelect,
      }),
      this.prisma.dutyAssignment.count({ where }),
    ]);

    return {
      data: records.map((record) => this.serializeAssignment(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      filters: {
        from: this.dateOnlyString(from),
        to: this.dateOnlyString(to),
        employeeAccountId: query.employeeAccountId ?? null,
        departmentId: query.departmentId ?? null,
        includeCancelled: query.includeCancelled ?? false,
        view,
      },
    };
  }

  async getAssignmentAudit(
    user: AuthenticatedUser,
    assignmentId: string,
  ) {
    const actor = await this.resolveManager(user);
    const assignment = await this.findVisibleAssignment(actor, assignmentId);
    // Audit details stay inside the same role and organization scope as the assignment itself.
    const activities = await this.prisma.dutyActivity.findMany({
      where: { dutyAssignmentId: assignment.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: dutyActivitySelect,
    });

    return {
      assignment: this.serializeAssignment(assignment),
      activities: activities.map((activity) => ({
        ...activity,
        createdAt: activity.createdAt.toISOString(),
      })),
    };
  }

  // Duty counters describe planned schedules only and must never be presented as attendance totals.
  async getManagementSummary(user: AuthenticatedUser) {
    const actor = await this.resolveManager(user);
    const now = new Date();
    const todayText = this.localDateString(now);
    const today = this.parseDateOnly(todayText, 'Today');
    const oversightEnd = this.parseDateOnly(
      this.addDays(todayText, 30),
      'Oversight end date',
    );
    const scope = this.visibleAssignmentWhere(actor);
    const exceptionScope = this.visibleExceptionWhere(actor);
    const managementWhere = this.managementDutyWhere(actor);
    const holidayScope = await this.visibleHolidayWhere(actor);
    const weekday = today.getUTCDay();
    const [
      scheduledToday,
      onDutyNow,
      cancelledToday,
      leaveToday,
      assignedByMeUpcoming,
      managementDutiesUpcoming,
      holidaysToday,
      weeklyOffToday,
    ] = await Promise.all([
      this.prisma.dutyAssignment.count({
        where: { ...scope, dutyDate: today, cancelledAt: null },
      }),
      this.prisma.dutyAssignment.count({
        where: {
          ...scope,
          startsAt: { lte: now },
          endsAt: { gt: now },
          cancelledAt: null,
        },
      }),
      this.prisma.dutyAssignment.count({
        where: { ...scope, dutyDate: today, cancelledAt: { not: null } },
      }),
      this.prisma.dutyException.count({
        where: {
          ...exceptionScope,
          exceptionDate: today,
          type: DutyExceptionType.LEAVE,
        },
      }),
      this.prisma.dutyAssignment.count({
        where: {
          ...scope,
          createdByAccountId: actor.accountId,
          startsAt: { gte: now, lt: oversightEnd },
          cancelledAt: null,
        },
      }),
      managementWhere
        ? this.prisma.dutyAssignment.count({
            where: {
              ...scope,
              ...managementWhere,
              startsAt: { gte: now, lt: oversightEnd },
              cancelledAt: null,
            },
          })
        : Promise.resolve(0),
      this.prisma.dutyHoliday.findMany({
        where: {
          AND: [
            holidayScope,
            { startDate: { lte: today }, endDate: { gte: today } },
            { cancelledAt: null },
          ],
        },
        orderBy: { name: 'asc' },
        select: dutyHolidaySelect,
      }),
      this.prisma.dutyWeeklyOffSetting.findUnique({
        where: { dayOfWeek: weekday },
        select: { dayOfWeek: true },
      }),
    ]);

    return {
      timezone: 'Asia/Kathmandu' as const,
      generatedAt: now.toISOString(),
      scope: actor,
      totals: {
        scheduledToday,
        onDutyNow,
        leaveToday,
        cancelledToday,
        assignedByMeUpcoming,
        managementDutiesUpcoming,
      },
      calendarToday: {
        date: todayText,
        weeklyOff: Boolean(weeklyOffToday),
        holidays: holidaysToday.map((holiday) => this.serializeHoliday(holiday)),
      },
    };
  }

  async updateAssignment(
    user: AuthenticatedUser,
    assignmentId: string,
    dto: UpdateDutyAssignmentDto,
  ) {
    const actor = await this.resolveManager(user);
    const current = await this.findVisibleAssignment(actor, assignmentId);

    if (current.cancelledAt) {
      throw new ConflictException('A cancelled duty assignment cannot be changed.');
    }
    // Lower management may inspect branch overrides but cannot silently rewrite Super Admin authority.
    if (
      current.authority === DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE &&
      actor.role !== AccountRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only Super Admin can change a Super Admin duty override.',
      );
    }

    if (
      dto.shiftTemplateId === undefined &&
      dto.supervisorAccountId === undefined &&
      dto.reportingLocation === undefined &&
      dto.notes === undefined
    ) {
      throw new BadRequestException('At least one duty change is required.');
    }

    const selectedShift = dto.shiftTemplateId
      ? await this.findVisibleTemplate(actor, dto.shiftTemplateId)
      : null;
    if (selectedShift && !selectedShift.isActive) {
      throw new ConflictException('This shift is no longer available. Choose another shift.');
    }
    if (selectedShift) {
      this.assertTemplateMatchesEmployeeScope(
        selectedShift,
        current.divisionId,
        current.departmentId,
      );
    }
    const shift = selectedShift ?? {
      id: current.shiftTemplateId,
      name: current.shiftName ?? current.shift?.name,
      startMinute: current.shiftStartMinute ?? current.shift?.startMinute,
      endMinute: current.shiftEndMinute ?? current.shift?.endMinute,
      spansNextDay:
        current.shiftSpansNextDay ?? current.shift?.spansNextDay ?? false,
    };
    if (
      !shift.name ||
      shift.startMinute === undefined ||
      shift.endMinute === undefined
    ) {
      throw new ConflictException(
        'The shift details are missing. Choose a shift again.',
      );
    }
    const resolvedShift = {
      id: shift.id,
      name: shift.name,
      startMinute: shift.startMinute,
      endMinute: shift.endMinute,
      spansNextDay: shift.spansNextDay,
    };
    const supervisor = dto.supervisorAccountId
      ? await this.workScopeService.resolveResponsibleManager(
          actor,
          dto.supervisorAccountId,
          current.divisionId,
          current.departmentId,
        )
      : current.supervisor;
    const date = this.dateOnlyString(current.dutyDate);
    const window = this.assignmentWindow(
      date,
      resolvedShift.startMinute,
      resolvedShift.endMinute,
    );
    await this.assertNoDutyConflicts(
      current.employeeAccountId,
      [window],
      current.id,
    );
    await this.assertNoDutyLeave(current.employeeAccountId, [date]);

    const reportingLocation =
      dto.reportingLocation?.trim() ?? current.reportingLocation;
    const notes =
      dto.notes === undefined ? current.notes : this.optionalText(dto.notes);
    const updated = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const assignment = await transaction.dutyAssignment.update({
          where: { id: current.id },
          data: {
            ...(selectedShift ? { shiftTemplateId: selectedShift.id } : {}),
            shiftName: resolvedShift.name,
            shiftStartMinute: resolvedShift.startMinute,
            shiftEndMinute: resolvedShift.endMinute,
            shiftSpansNextDay: resolvedShift.spansNextDay,
            supervisorAccountId: supervisor.id,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            reportingLocation,
            notes,
          },
          select: dutyAssignmentSelect,
        });
        await transaction.dutyActivity.create({
          data: {
            dutyAssignmentId: current.id,
            seriesId: current.seriesId,
            employeeAccountId: current.employeeAccountId,
            actorAccountId: actor.accountId,
            action: DutyActivityAction.RESCHEDULED,
            details: {
              previousStartsAt: current.startsAt.toISOString(),
              previousEndsAt: current.endsAt.toISOString(),
              startsAt: window.startsAt.toISOString(),
              endsAt: window.endsAt.toISOString(),
              reportingLocation,
              previousShiftName: current.shiftName ?? current.shift?.name ?? 'Shift',
              shiftName: resolvedShift.name,
              divisionId: current.divisionId,
              departmentId: current.departmentId,
              supervisorAccountId: supervisor.id,
              authority: current.authority,
              hierarchyOverride: current.hierarchyOverride,
              conflictOverride: current.conflictOverride,
              overrideReason: current.overrideReason,
              actorRole: actor.role,
            },
          },
        });
        return assignment;
      },
    );

    const recipientAccountIds = await this.resolveDutyNotificationRecipients({
      actor,
      assignee: updated.employee,
      supervisorAccountId: updated.supervisorAccountId,
    });
    await this.dutyNotifications.publishDutyUpdate({
      assignmentId: updated.id,
      employeeAccountId: updated.employeeAccountId,
      action: 'CHANGED',
      actorAccountId: actor.accountId,
      recipientAccountIds,
      title: 'Duty schedule changed',
      body: this.dutyNotificationBody(
        updated.dutyDate,
        updated.shiftName ?? resolvedShift.name,
        updated.overrideReason,
      ),
      startsAt: updated.startsAt,
      endsAt: updated.endsAt,
      metadata: {
        authority: updated.authority,
        hierarchyOverride: updated.hierarchyOverride,
        conflictOverride: updated.conflictOverride,
        overrideReason: updated.overrideReason,
      },
    });

    return {
      message: 'Duty assignment updated successfully.',
      assignment: this.serializeAssignment(updated),
    };
  }

  async cancelAssignment(
    user: AuthenticatedUser,
    assignmentId: string,
    dto: CancelDutyAssignmentDto,
  ) {
    const actor = await this.resolveManager(user);
    const current = await this.findVisibleAssignment(actor, assignmentId);

    if (current.cancelledAt) {
      throw new ConflictException('This duty assignment is already cancelled.');
    }
    // Override cancellation remains with the same branch authority that created the exception.
    if (
      current.authority === DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE &&
      actor.role !== AccountRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only Super Admin can cancel a Super Admin duty override.',
      );
    }

    const cancelledAt = new Date();
    const updated = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const assignment = await transaction.dutyAssignment.update({
          where: { id: current.id },
          data: {
            cancelledAt,
            cancelledByAccountId: actor.accountId,
            cancellationReason: dto.reason.trim(),
          },
          select: dutyAssignmentSelect,
        });
        await transaction.dutyActivity.create({
          data: {
            dutyAssignmentId: current.id,
            seriesId: current.seriesId,
            employeeAccountId: current.employeeAccountId,
            actorAccountId: actor.accountId,
            action: DutyActivityAction.CANCELLED,
            details: {
              reason: dto.reason.trim(),
              shiftName: current.shiftName ?? current.shift?.name ?? 'Shift',
              divisionId: current.divisionId,
              departmentId: current.departmentId,
              supervisorAccountId: current.supervisorAccountId,
              authority: current.authority,
              hierarchyOverride: current.hierarchyOverride,
              conflictOverride: current.conflictOverride,
              overrideReason: current.overrideReason,
              actorRole: actor.role,
            },
          },
        });
        return assignment;
      },
    );

    const recipientAccountIds = await this.resolveDutyNotificationRecipients({
      actor,
      assignee: updated.employee,
      supervisorAccountId: updated.supervisorAccountId,
    });
    await this.dutyNotifications.publishDutyUpdate({
      assignmentId: updated.id,
      employeeAccountId: updated.employeeAccountId,
      action: 'CANCELLED',
      actorAccountId: actor.accountId,
      recipientAccountIds,
      title: 'Duty assignment cancelled',
      body: `${this.dutyNotificationBody(
        updated.dutyDate,
        updated.shiftName ?? updated.shift?.name ?? 'Shift',
        updated.overrideReason,
      )} • ${dto.reason.trim()}`,
      startsAt: updated.startsAt,
      endsAt: updated.endsAt,
      metadata: {
        cancellationReason: dto.reason.trim(),
        authority: updated.authority,
        conflictOverride: updated.conflictOverride,
        overrideReason: updated.overrideReason,
      },
    });

    return {
      message: 'Duty assignment cancelled successfully.',
      assignment: this.serializeAssignment(updated),
    };
  }

  async createLeave(user: AuthenticatedUser, dto: CreateDutyLeaveDto) {
    const actor = await this.resolveManager(user);
    const [employee] = await this.workScopeService.resolveAssignableAccounts(
      actor,
      [dto.employeeAccountId],
    );
    const divisionId = employee.employee?.divisionId;
    const departmentId = employee.employee?.departmentId ?? null;

    if (!divisionId) {
      throw new ForbiddenException(
        'The selected staff member does not have an active division assignment.',
      );
    }
    if (employee.role !== AccountRole.SENIOR_MANAGEMENT && !departmentId) {
      throw new ForbiddenException(
        'The selected staff member does not have a complete department assignment.',
      );
    }

    const startDate = this.parseDateOnly(dto.startDate, 'Leave start date');
    const endDate = this.parseDateOnly(dto.endDate, 'Leave end date');
    if (endDate < startDate) {
      throw new BadRequestException(
        'Leave end date must be on or after the start date.',
      );
    }
    const totalDays =
      Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
    if (totalDays > MAX_SCHEDULE_DAYS) {
      throw new BadRequestException(
        `A leave record can cover at most ${MAX_SCHEDULE_DAYS} calendar days at once.`,
      );
    }

    const dates = Array.from({ length: totalDays }, (_, index) =>
      this.parseDateOnly(this.addDays(dto.startDate, index), 'Leave date'),
    );
    const [conflictingDuty, existingException] = await Promise.all([
      this.prisma.dutyAssignment.findFirst({
        where: {
          employeeAccountId: employee.id,
          dutyDate: { in: dates },
          cancelledAt: null,
        },
        orderBy: { dutyDate: 'asc' },
        select: { id: true, dutyDate: true, shiftName: true },
      }),
      this.prisma.dutyException.findFirst({
        where: {
          employeeAccountId: employee.id,
          exceptionDate: { in: dates },
        },
        orderBy: { exceptionDate: 'asc' },
        select: { id: true, exceptionDate: true, type: true },
      }),
    ]);

    if (conflictingDuty) {
      throw new ConflictException(
        `Cancel or reschedule the existing duty on ${this.dateOnlyString(conflictingDuty.dutyDate)} before recording leave.`,
      );
    }
    if (existingException) {
      throw new ConflictException(
        `${existingException.type === DutyExceptionType.LEAVE ? 'Leave' : 'A legacy holiday exception'} is already recorded on ${this.dateOnlyString(existingException.exceptionDate)}.`,
      );
    }

    const note = this.optionalText(dto.note);
    const created = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const rows = [] as Prisma.DutyExceptionGetPayload<{
          select: typeof dutyExceptionSelect;
        }>[];
        for (const date of dates) {
          const row = await transaction.dutyException.create({
            data: {
              employeeAccountId: employee.id,
              createdByAccountId: actor.accountId,
              divisionId,
              departmentId,
              exceptionDate: date,
              type: DutyExceptionType.LEAVE,
              note,
            },
            select: dutyExceptionSelect,
          });
          rows.push(row);
        }
        await transaction.dutyActivity.createMany({
          data: rows.map((row) => ({
            employeeAccountId: employee.id,
            actorAccountId: actor.accountId,
            action: DutyActivityAction.EXCEPTION_RECORDED,
            details: {
              exceptionId: row.id,
              type: DutyExceptionType.LEAVE,
              date: this.dateOnlyString(row.exceptionDate),
              note: row.note,
            },
          })),
        });
        return rows;
      },
    );

    await this.dutyNotifications.publishDutyUpdate({
      assignmentId: null,
      employeeAccountId: employee.id,
      action: 'LEAVE_RECORDED',
      actorAccountId: actor.accountId,
      recipientAccountIds: [employee.id, actor.accountId],
      title: 'Leave recorded',
      body: `${dto.startDate}${dto.endDate !== dto.startDate ? ` – ${dto.endDate}` : ''}${note ? ` • ${note}` : ''}`,
      metadata: {
        exceptionIds: created.map((row) => row.id),
        type: DutyExceptionType.LEAVE,
      },
    });

    return {
      message: `${created.length} leave day${created.length === 1 ? '' : 's'} recorded successfully.`,
      exceptions: created.map((row) => this.serializeException(row)),
    };
  }

  async getDutyCalendar(
    user: AuthenticatedUser,
    query: ListDutyHolidaysQueryDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const fromText = query.from ?? this.localDateString(new Date());
    const toText = query.to ?? this.addDays(fromText, 365);
    const from = this.parseDateOnly(fromText, 'From date');
    const to = this.parseDateOnly(toText, 'To date');
    if (to < from) {
      throw new BadRequestException('To date must be on or after From date.');
    }
    if (query.divisionId) await this.assertDivisionInsideScope(actor, query.divisionId);
    if (query.departmentId) await this.assertDepartmentInsideScope(actor, query.departmentId);

    const holidayScopeWhere = await this.visibleHolidayWhere(
      actor,
      query.divisionId,
      query.departmentId,
    );
    const holidays = await this.prisma.dutyHoliday.findMany({
      where: {
        AND: [
          holidayScopeWhere,
          { startDate: { lte: to }, endDate: { gte: from } },
          ...(query.includeCancelled ? [] : [{ cancelledAt: null }]),
        ],
      },
      orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
      take: 500,
      select: dutyHolidaySelect,
    });
    const weeklyOff = await this.prisma.dutyWeeklyOffSetting.findMany({
      orderBy: { dayOfWeek: 'asc' },
      select: { dayOfWeek: true, updatedAt: true },
    });

    return {
      timezone: 'Asia/Kathmandu' as const,
      period: { from: fromText, to: toText },
      weeklyOffDays: weeklyOff.map((row) => row.dayOfWeek),
      holidays: holidays.map((holiday) => this.serializeHoliday(holiday)),
      canManage: actor.role === AccountRole.SUPER_ADMIN,
    };
  }

  async createHoliday(user: AuthenticatedUser, dto: CreateDutyHolidayDto) {
    const actor = await this.resolveManager(user);
    this.assertSuperAdminHolidayManager(actor);
    const startDate = this.parseDateOnly(dto.startDate, 'Holiday start date');
    const endDate = this.parseDateOnly(dto.endDate, 'Holiday end date');
    if (endDate < startDate) {
      throw new BadRequestException(
        'Holiday end date must be on or after the start date.',
      );
    }
    const scope = await this.resolveHolidayScope(
      actor,
      dto.scope,
      dto.divisionId,
      dto.departmentId,
    );
    const duplicate = await this.prisma.dutyHoliday.findFirst({
      where: {
        name: { equals: dto.name.trim(), mode: 'insensitive' },
        divisionId: scope.divisionId,
        departmentId: scope.departmentId,
        cancelledAt: null,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'A holiday with this name already overlaps the selected dates in this scope.',
      );
    }

    const holiday = await this.prisma.dutyHoliday.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        startDate,
        endDate,
        divisionId: scope.divisionId,
        departmentId: scope.departmentId,
        note: this.optionalText(dto.note),
        createdByAccountId: actor.accountId,
        updatedByAccountId: actor.accountId,
      },
      select: dutyHolidaySelect,
    });
    return {
      message: 'Holiday added to the Duty calendar.',
      holiday: this.serializeHoliday(holiday),
    };
  }

  async updateHoliday(
    user: AuthenticatedUser,
    holidayId: string,
    dto: UpdateDutyHolidayDto,
  ) {
    const actor = await this.resolveManager(user);
    this.assertSuperAdminHolidayManager(actor);
    const current = await this.prisma.dutyHoliday.findUnique({
      where: { id: holidayId },
      select: dutyHolidaySelect,
    });
    if (!current) throw new NotFoundException('Holiday was not found.');
    if (current.cancelledAt) {
      throw new ConflictException('A cancelled holiday cannot be edited.');
    }

    const scopeName =
      current.departmentId !== null
        ? DutyHolidayScope.DEPARTMENT
        : current.divisionId !== null
          ? DutyHolidayScope.DIVISION
          : DutyHolidayScope.BRANCH;
    const nextScope = dto.scope ?? scopeName;
    const scope = await this.resolveHolidayScope(
      actor,
      nextScope,
      dto.scope ? dto.divisionId : current.divisionId ?? undefined,
      dto.scope ? dto.departmentId : current.departmentId ?? undefined,
    );
    const startDate = dto.startDate
      ? this.parseDateOnly(dto.startDate, 'Holiday start date')
      : current.startDate;
    const endDate = dto.endDate
      ? this.parseDateOnly(dto.endDate, 'Holiday end date')
      : current.endDate;
    if (endDate < startDate) {
      throw new BadRequestException(
        'Holiday end date must be on or after the start date.',
      );
    }

    const holiday = await this.prisma.dutyHoliday.update({
      where: { id: current.id },
      data: {
        name: dto.name?.trim(),
        type: dto.type,
        startDate,
        endDate,
        divisionId: scope.divisionId,
        departmentId: scope.departmentId,
        note: dto.note === undefined ? current.note : this.optionalText(dto.note),
        updatedByAccountId: actor.accountId,
      },
      select: dutyHolidaySelect,
    });
    return {
      message: 'Holiday updated successfully.',
      holiday: this.serializeHoliday(holiday),
    };
  }

  async cancelHoliday(user: AuthenticatedUser, holidayId: string) {
    const actor = await this.resolveManager(user);
    this.assertSuperAdminHolidayManager(actor);
    const current = await this.prisma.dutyHoliday.findUnique({
      where: { id: holidayId },
      select: { id: true, cancelledAt: true },
    });
    if (!current) throw new NotFoundException('Holiday was not found.');
    if (current.cancelledAt) {
      throw new ConflictException('This holiday is already cancelled.');
    }
    const holiday = await this.prisma.dutyHoliday.update({
      where: { id: current.id },
      data: {
        cancelledAt: new Date(),
        cancelledByAccountId: actor.accountId,
        updatedByAccountId: actor.accountId,
      },
      select: dutyHolidaySelect,
    });
    return {
      message: 'Holiday cancelled successfully.',
      holiday: this.serializeHoliday(holiday),
    };
  }

  async getWeeklyOff(user: AuthenticatedUser) {
    const actor = await this.resolveManager(user);
    const rows = await this.prisma.dutyWeeklyOffSetting.findMany({
      orderBy: { dayOfWeek: 'asc' },
      select: { dayOfWeek: true, updatedAt: true },
    });
    return {
      days: rows.map((row) => row.dayOfWeek),
      canManage: actor.role === AccountRole.SUPER_ADMIN,
      updatedAt:
        rows.reduce<Date | null>(
          (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
          null,
        )?.toISOString() ?? null,
    };
  }

  async updateWeeklyOff(
    user: AuthenticatedUser,
    dto: UpdateDutyWeeklyOffDto,
  ) {
    const actor = await this.resolveManager(user);
    this.assertSuperAdminHolidayManager(actor);
    const days = [...new Set(dto.days)].sort((left, right) => left - right);
    await this.prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      await transaction.dutyWeeklyOffSetting.deleteMany({});
      if (days.length > 0) {
        await transaction.dutyWeeklyOffSetting.createMany({
          data: days.map((dayOfWeek) => ({
            dayOfWeek,
            updatedByAccountId: actor.accountId,
          })),
        });
      }
    });
    return { message: 'Weekly off settings updated.', days };
  }

  private assertSuperAdminHolidayManager(actor: WorkActorContext): void {
    if (actor.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only Super Admin can change the Holiday Calendar or weekly off settings.',
      );
    }
  }

  private async resolveHolidayScope(
    actor: WorkActorContext,
    scope: DutyHolidayScope,
    divisionId?: string,
    departmentId?: string,
  ): Promise<{ divisionId: string | null; departmentId: string | null }> {
    this.assertSuperAdminHolidayManager(actor);
    if (scope === DutyHolidayScope.BRANCH) {
      return { divisionId: null, departmentId: null };
    }
    if (!divisionId) {
      throw new BadRequestException('Select a division for this holiday.');
    }
    await this.assertDivisionInsideScope(actor, divisionId);
    if (scope === DutyHolidayScope.DIVISION) {
      return { divisionId, departmentId: null };
    }
    if (!departmentId) {
      throw new BadRequestException('Select a department for this holiday.');
    }
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, divisionId, isActive: true },
      select: { id: true },
    });
    if (!department) {
      throw new ForbiddenException(
        'The selected holiday department is outside the selected division.',
      );
    }
    return { divisionId, departmentId };
  }

  private async visibleHolidayWhere(
    actor: WorkActorContext,
    requestedDivisionId?: string,
    requestedDepartmentId?: string,
  ): Promise<Prisma.DutyHolidayWhereInput> {
    let divisionId = requestedDivisionId ?? actor.divisionId ?? undefined;
    const departmentId = requestedDepartmentId ?? actor.departmentId ?? undefined;

    if (departmentId && !divisionId) {
      const department = await this.prisma.department.findFirst({
        where: { id: departmentId, isActive: true },
        select: { divisionId: true },
      });
      divisionId = department?.divisionId;
    }

    if (actor.role === AccountRole.SUPER_ADMIN && !requestedDivisionId && !requestedDepartmentId) {
      return {};
    }

    if (departmentId && divisionId) {
      return {
        OR: [
          { divisionId: null, departmentId: null },
          { divisionId, departmentId: null },
          { departmentId },
        ],
      };
    }
    if (divisionId) {
      return {
        OR: [
          { divisionId: null, departmentId: null },
          { divisionId, departmentId: null },
          ...(actor.role === AccountRole.SENIOR_MANAGEMENT
            ? [{ department: { is: { divisionId } } }]
            : []),
        ],
      };
    }
    return { divisionId: null, departmentId: null };
  }

  private async resolveManager(user: AuthenticatedUser) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);
    return actor;
  }

  private async resolveTemplateScope(
    actor: WorkActorContext,
    scope: DutyShiftScope,
    divisionId?: string,
    departmentId?: string,
  ): Promise<{ divisionId: string | null; departmentId: string | null }> {
    if (actor.role === AccountRole.TEAM_MANAGER) {
      if (scope !== DutyShiftScope.DEPARTMENT) {
        throw new ForbiddenException(
          'Team Managers can create shifts only for their own department.',
        );
      }
      return {
        divisionId: actor.divisionId,
        departmentId: actor.departmentId,
      };
    }

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      if (scope === DutyShiftScope.BRANCH) {
        throw new ForbiddenException(
          'Senior Management can create Division or Department shifts only.',
        );
      }
      const resolvedDivisionId = actor.divisionId;
      if (!resolvedDivisionId) {
        throw new ForbiddenException('Your management division could not be resolved.');
      }
      if (scope === DutyShiftScope.DIVISION) {
        return { divisionId: resolvedDivisionId, departmentId: null };
      }
      if (!departmentId) {
        throw new BadRequestException('Select a department for this shift.');
      }
      await this.assertDepartmentInsideScope(actor, departmentId);
      return { divisionId: resolvedDivisionId, departmentId };
    }

    if (scope === DutyShiftScope.BRANCH) {
      return { divisionId: null, departmentId: null };
    }
    if (!divisionId) {
      throw new BadRequestException('Select a division for this shift.');
    }
    await this.assertDivisionInsideScope(actor, divisionId);
    if (scope === DutyShiftScope.DIVISION) {
      return { divisionId, departmentId: null };
    }
    if (!departmentId) {
      throw new BadRequestException('Select a department for this shift.');
    }
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, divisionId, isActive: true },
      select: { id: true },
    });
    if (!department) {
      throw new ForbiddenException(
        'The selected department is outside the selected division.',
      );
    }
    return { divisionId, departmentId };
  }

  private async assignmentTemplateWhere(
    actor: WorkActorContext,
    query: DutyShiftTemplateQueryDto,
  ): Promise<Prisma.DutyShiftTemplateWhereInput | null> {
    if (!query.targetScope) return null;

    if (query.targetScope === DutyShiftTargetScope.BRANCH) {
      return { divisionId: null, departmentId: null };
    }

    if (!query.divisionId) {
      throw new BadRequestException('A target division is required for shift filtering.');
    }
    await this.assertDivisionInsideScope(actor, query.divisionId);

    if (query.targetScope === DutyShiftTargetScope.DIVISION) {
      return {
        OR: [
          { divisionId: null, departmentId: null },
          { divisionId: query.divisionId, departmentId: null },
        ],
      };
    }

    if (!query.departmentId) {
      throw new BadRequestException('A target department is required for shift filtering.');
    }
    await this.assertDepartmentInsideScope(actor, query.departmentId);
    const department = await this.prisma.department.findFirst({
      where: { id: query.departmentId, divisionId: query.divisionId, isActive: true },
      select: { id: true },
    });
    if (!department) {
      throw new ForbiddenException(
        'The target department does not belong to the selected division.',
      );
    }
    return {
      OR: [
        { divisionId: null, departmentId: null },
        { divisionId: query.divisionId, departmentId: null },
        { departmentId: query.departmentId },
      ],
    };
  }

  private visibleTemplateWhere(
    actor: WorkActorContext,
  ): Prisma.DutyShiftTemplateWhereInput {
    const organizationTemplate = { divisionId: null, departmentId: null };

    if (actor.role === AccountRole.SUPER_ADMIN) {
      return {};
    }

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      return {
        OR: [organizationTemplate, { divisionId: actor.divisionId }],
      };
    }

    return {
      OR: [
        organizationTemplate,
        { divisionId: actor.divisionId, departmentId: null },
        { departmentId: actor.departmentId },
      ],
    };
  }

  private visibleAssignmentWhere(
    actor: WorkActorContext,
  ): Prisma.DutyAssignmentWhereInput {
    if (actor.role === AccountRole.SUPER_ADMIN) return {};
    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      return { divisionId: actor.divisionId ?? '__missing_division__' };
    }
    if (actor.role === AccountRole.TEAM_MANAGER) {
      return { departmentId: actor.departmentId ?? '__missing_department__' };
    }
    return { employeeAccountId: actor.accountId };
  }

  private visibleExceptionWhere(
    actor: WorkActorContext,
  ): Prisma.DutyExceptionWhereInput {
    if (actor.role === AccountRole.SUPER_ADMIN) return {};
    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      return { divisionId: actor.divisionId ?? '__missing_division__' };
    }
    if (actor.role === AccountRole.TEAM_MANAGER) {
      return { departmentId: actor.departmentId ?? '__missing_department__' };
    }
    return { employeeAccountId: actor.accountId };
  }

  private canManageTemplate(
    actor: WorkActorContext,
    template: { divisionId: string | null; departmentId: string | null },
  ): boolean {
    if (actor.role === AccountRole.SUPER_ADMIN) return true;
    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      return (
        template.divisionId === actor.divisionId &&
        template.departmentId === null
      );
    }
    return template.departmentId === actor.departmentId;
  }

  private async findManageableTemplate(
    actor: WorkActorContext,
    templateId: string,
  ) {
    const template = await this.findVisibleTemplate(actor, templateId);
    if (!this.canManageTemplate(actor, template)) {
      throw new ForbiddenException(
        'You can use this shift, but only the manager who owns its area can change or delete it.',
      );
    }
    return template;
  }

  private async findVisibleTemplate(
    actor: WorkActorContext,
    templateId: string,
  ) {
    const template = await this.prisma.dutyShiftTemplate.findFirst({
      where: {
        AND: [{ id: templateId }, this.visibleTemplateWhere(actor)],
      },
      select: shiftTemplateSelect,
    });

    if (!template) {
      throw new NotFoundException('Shift was not found.');
    }

    return template;
  }

  private async findVisibleAssignment(
    actor: WorkActorContext,
    assignmentId: string,
  ) {
    const assignment = await this.prisma.dutyAssignment.findFirst({
      where: {
        AND: [{ id: assignmentId }, this.visibleAssignmentWhere(actor)],
      },
      select: dutyAssignmentSelect,
    });

    if (!assignment) {
      throw new NotFoundException('Duty assignment was not found.');
    }

    return assignment;
  }

  private assertTemplateMatchesEmployeeScope(
    template: {
      divisionId: string | null;
      departmentId: string | null;
    },
    divisionId: string,
    departmentId: string | null,
  ): void {
    if (template.divisionId && template.divisionId !== divisionId) {
      throw new ForbiddenException(
        'The selected shift template belongs to another division.',
      );
    }
    if (template.departmentId && template.departmentId !== departmentId) {
      throw new ForbiddenException(
        'The selected shift template belongs to another department.',
      );
    }
  }

  private async assertDepartmentInsideScope(
    actor: WorkActorContext,
    departmentId: string,
  ): Promise<void> {
    if (
      actor.role === AccountRole.TEAM_MANAGER &&
      actor.departmentId !== departmentId
    ) {
      throw new ForbiddenException(
        'The selected department is outside your management scope.',
      );
    }

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      const department = await this.prisma.department.findFirst({
        where: {
          id: departmentId,
          divisionId: actor.divisionId ?? '__missing_division__',
          isActive: true,
        },
        select: { id: true },
      });

      if (!department) {
        throw new ForbiddenException(
          'The selected department is outside your management scope.',
        );
      }
    }
  }

  // Preview and creation share this method so permission and conflict logic cannot drift.
  private async prepareBulkSchedule(
    actor: WorkActorContext,
    dto: CreateBulkDutyScheduleDto,
  ) {
    const accounts = await this.workScopeService.resolveAssignableAccounts(
      actor,
      dto.employeeAccountIds,
    );
    const shift = await this.findVisibleTemplate(actor, dto.shiftTemplateId);
    if (!shift.isActive) {
      throw new ConflictException('This shift is no longer available. Choose another shift.');
    }
    const dates = this.expandScheduleDates(dto);
    const totalRequested = dates.length * accounts.length;
    if (totalRequested > MAX_BULK_ASSIGNMENTS_PER_REQUEST) {
      throw new BadRequestException(
        `A bulk duty request can create at most ${MAX_BULK_ASSIGNMENTS_PER_REQUEST} assignments. Narrow the staff selection or date range.`,
      );
    }

    const windows = dates.map((date) => ({
      date,
      ...this.assignmentWindow(date, shift.startMinute, shift.endMinute),
    }));
    const employeeIds = accounts.map((account) => account.id);
    const dateValues = dates.map((date) =>
      this.parseDateOnly(date, 'Duty date'),
    );
    const earliestStart = windows.reduce(
      (minimum, window) =>
        window.startsAt < minimum ? window.startsAt : minimum,
      windows[0].startsAt,
    );
    const latestEnd = windows.reduce(
      (maximum, window) => (window.endsAt > maximum ? window.endsAt : maximum),
      windows[0].endsAt,
    );
    const restMs = MIN_DUTY_REST_MINUTES * 60_000;
    const firstDate = this.parseDateOnly(dates[0], 'Duty date');
    const lastDate = this.parseDateOnly(dates[dates.length - 1], 'Duty date');

    const [existingAssignments, leaves, holidays, weeklyOffRows] =
      await Promise.all([
        this.prisma.dutyAssignment.findMany({
          where: {
            employeeAccountId: { in: employeeIds },
            cancelledAt: null,
            startsAt: { lt: new Date(latestEnd.getTime() + restMs) },
            endsAt: { gt: new Date(earliestStart.getTime() - restMs) },
          },
          select: {
            id: true,
            employeeAccountId: true,
            shiftName: true,
            startsAt: true,
            endsAt: true,
          },
        }),
        this.prisma.dutyException.findMany({
          where: {
            employeeAccountId: { in: employeeIds },
            exceptionDate: { in: dateValues },
            type: DutyExceptionType.LEAVE,
          },
          select: {
            employeeAccountId: true,
            exceptionDate: true,
            type: true,
          },
        }),
        this.prisma.dutyHoliday.findMany({
          where: {
            cancelledAt: null,
            startDate: { lte: lastDate },
            endDate: { gte: firstDate },
          },
          select: dutyHolidaySelect,
        }),
        this.prisma.dutyWeeklyOffSetting.findMany({
          select: { dayOfWeek: true },
        }),
      ]);
    const weeklyOffDays = new Set(
      weeklyOffRows.map((row) => row.dayOfWeek),
    );

    const people = [] as Array<{
      account: WorkAccountRecord;
      divisionId: string;
      departmentId: string | null;
      supervisor: WorkAccountRecord;
      validWindows: DutyWindow[];
      conflicts: DutyWindowConflict[];
      warnings: DutyWindowWarning[];
    }>;

    for (const account of accounts) {
      const divisionId = account.employee?.divisionId;
      const departmentId = account.employee?.departmentId ?? null;
      if (!divisionId) {
        throw new ForbiddenException(
          'Every selected staff member must have an active division assignment.',
        );
      }
      if (account.role !== AccountRole.SENIOR_MANAGEMENT && !departmentId) {
        throw new ForbiddenException(
          'Every selected employee or Team Manager must have an active department assignment.',
        );
      }
      this.assertTemplateMatchesEmployeeScope(shift, divisionId, departmentId);
      const supervisor = await this.workScopeService.resolveResponsibleManager(
        actor,
        dto.supervisorAccountId,
        divisionId,
        departmentId,
      );
      const conflicts: DutyWindowConflict[] = [];
      const warnings: DutyWindowWarning[] = [];
      const validWindows: DutyWindow[] = [];
      const personAssignments = existingAssignments.filter(
        (assignment) => assignment.employeeAccountId === account.id,
      );

      for (const window of windows) {
        const overlap = personAssignments.find(
          (assignment) =>
            assignment.startsAt < window.endsAt &&
            assignment.endsAt > window.startsAt,
        );
        const restConflict = overlap
          ? null
          : personAssignments.find((assignment) => {
              if (assignment.endsAt <= window.startsAt) {
                return (
                  window.startsAt.getTime() - assignment.endsAt.getTime() < restMs
                );
              }
              if (assignment.startsAt >= window.endsAt) {
                return (
                  assignment.startsAt.getTime() - window.endsAt.getTime() < restMs
                );
              }
              return false;
            });
        const leave = leaves.find(
          (record) =>
            record.employeeAccountId === account.id &&
            this.dateOnlyString(record.exceptionDate) === window.date,
        );

        if (overlap) {
          conflicts.push({
            window,
            type: 'DUTY_CONFLICT',
            message: `${overlap.shiftName} is already assigned from ${overlap.startsAt.toISOString()} to ${overlap.endsAt.toISOString()}.`,
            existingAssignmentId: overlap.id,
          });
          continue;
        }
        if (restConflict) {
          conflicts.push({
            window,
            type: 'REST_PERIOD',
            message: `This duty does not leave the required ${Math.round(MIN_DUTY_REST_MINUTES / 60)} hours of rest around ${restConflict.shiftName}.`,
            existingAssignmentId: restConflict.id,
          });
          continue;
        }
        if (leave) {
          conflicts.push({
            window,
            type: 'LEAVE',
            message: 'Approved leave is recorded for this date.',
            existingAssignmentId: null,
          });
          continue;
        }

        const date = this.parseDateOnly(window.date, 'Duty date');
        const applicableHolidays = holidays.filter(
          (holiday) =>
            holiday.startDate <= date &&
            holiday.endDate >= date &&
            this.holidayAppliesToScope(holiday, divisionId, departmentId),
        );
        for (const holiday of applicableHolidays) {
          warnings.push({
            window,
            type: 'HOLIDAY',
            message: `${holiday.name} is on the Holiday Calendar. Operational duty can still be assigned.`,
            holidayId: holiday.id,
          });
        }
        if (weeklyOffDays.has(date.getUTCDay())) {
          warnings.push({
            window,
            type: 'WEEKLY_OFF',
            message: `${this.weekdayName(date.getUTCDay())} is configured as a weekly off. Operational duty can still be assigned.`,
            holidayId: null,
          });
        }
        validWindows.push(window);
      }

      people.push({
        account,
        divisionId,
        departmentId,
        supervisor,
        validWindows,
        conflicts,
        warnings,
      });
    }

    return {
      actor,
      shift,
      dates,
      people,
      totalRequested,
      reportingLocation: dto.reportingLocation.trim(),
    };
  }

  private serializeBulkPreview(
    prepared: Awaited<ReturnType<DutyScheduleService['prepareBulkSchedule']>>,
  ) {
    const conflictCount = prepared.people.reduce(
      (total, person) => total + person.conflicts.length,
      0,
    );
    const warningCount = prepared.people.reduce(
      (total, person) => total + person.warnings.length,
      0,
    );
    const validCount = prepared.people.reduce(
      (total, person) => total + person.validWindows.length,
      0,
    );

    return {
      shift: this.serializeTemplate(prepared.shift),
      reportingLocation: prepared.reportingLocation,
      dates: prepared.dates,
      requestedAssignments: prepared.totalRequested,
      validAssignments: validCount,
      conflictAssignments: conflictCount,
      warningAssignments: warningCount,
      people: prepared.people.map((person) => ({
        account: {
          id: person.account.id,
          role: person.account.role,
          username: person.account.username,
          superAdminProfile: person.account.superAdminProfile,
          employee: person.account.employee
            ? {
                id: person.account.employee.id,
                empId: person.account.employee.empId,
                empName: person.account.employee.empName,
                designation: person.account.employee.designation,
                divisionId: person.account.employee.divisionId,
                departmentId: person.account.employee.departmentId,
              }
            : null,
        },
        supervisor: {
          id: person.supervisor.id,
          role: person.supervisor.role,
          username: person.supervisor.username,
          superAdminProfile: person.supervisor.superAdminProfile,
          employee: person.supervisor.employee
            ? {
                id: person.supervisor.employee.id,
                empId: person.supervisor.employee.empId,
                empName: person.supervisor.employee.empName,
                designation: person.supervisor.employee.designation,
                divisionId: person.supervisor.employee.divisionId,
                departmentId: person.supervisor.employee.departmentId,
              }
            : null,
        },
        validDates: person.validWindows.map((window) => window.date),
        result:
          person.conflicts.length === 0
            ? 'READY'
            : person.validWindows.length > 0
              ? 'PARTLY_READY'
              : 'BLOCKED',
        conflicts: person.conflicts.map((conflict) => ({
          date: conflict.window.date,
          startsAt: conflict.window.startsAt.toISOString(),
          endsAt: conflict.window.endsAt.toISOString(),
          type: conflict.type,
          message: conflict.message,
          existingAssignmentId: conflict.existingAssignmentId,
        })),
        warnings: person.warnings.map((warning) => ({
          date: warning.window.date,
          startsAt: warning.window.startsAt.toISOString(),
          endsAt: warning.window.endsAt.toISOString(),
          type: warning.type,
          message: warning.message,
          holidayId: warning.holidayId,
        })),
      })),
    };
  }

  private async inspectScheduleConflicts(
    employeeAccountId: string,
    windows: DutyWindow[],
  ): Promise<DutyWindowConflict[]> {
    const earliestStart = windows.reduce(
      (minimum, window) =>
        window.startsAt < minimum ? window.startsAt : minimum,
      windows[0].startsAt,
    );
    const latestEnd = windows.reduce(
      (maximum, window) =>
        window.endsAt > maximum ? window.endsAt : maximum,
      windows[0].endsAt,
    );
    const restMs = MIN_DUTY_REST_MINUTES * 60_000;
    const [existingAssignments, leaves] = await Promise.all([
      this.prisma.dutyAssignment.findMany({
        where: {
          employeeAccountId,
          cancelledAt: null,
          startsAt: { lt: new Date(latestEnd.getTime() + restMs) },
          endsAt: { gt: new Date(earliestStart.getTime() - restMs) },
        },
        select: { id: true, shiftName: true, startsAt: true, endsAt: true },
      }),
      this.prisma.dutyException.findMany({
        where: {
          employeeAccountId,
          type: DutyExceptionType.LEAVE,
          exceptionDate: {
            in: windows.map((window) =>
              this.parseDateOnly(window.date, 'Duty date'),
            ),
          },
        },
        select: { exceptionDate: true },
      }),
    ]);

    const conflicts: DutyWindowConflict[] = [];
    for (const window of windows) {
      const overlap = existingAssignments.find(
        (assignment) =>
          assignment.startsAt < window.endsAt &&
          assignment.endsAt > window.startsAt,
      );
      const restConflict = overlap
        ? null
        : existingAssignments.find((assignment) => {
            if (assignment.endsAt <= window.startsAt) {
              return window.startsAt.getTime() - assignment.endsAt.getTime() < restMs;
            }
            if (assignment.startsAt >= window.endsAt) {
              return assignment.startsAt.getTime() - window.endsAt.getTime() < restMs;
            }
            return false;
          });
      const leave = leaves.find(
        (record) => this.dateOnlyString(record.exceptionDate) === window.date,
      );
      if (overlap) {
        conflicts.push({
          window,
          type: 'DUTY_CONFLICT',
          message: `${overlap.shiftName} already overlaps this duty window.`,
          existingAssignmentId: overlap.id,
        });
      } else if (restConflict) {
        conflicts.push({
          window,
          type: 'REST_PERIOD',
          message: `This duty does not leave the required ${Math.round(MIN_DUTY_REST_MINUTES / 60)} hours of rest around ${restConflict.shiftName}.`,
          existingAssignmentId: restConflict.id,
        });
      } else if (leave) {
        conflicts.push({
          window,
          type: 'LEAVE',
          message: 'Approved leave is recorded for this date.',
          existingAssignmentId: null,
        });
      }
    }
    return conflicts;
  }

  private holidayAppliesToScope(
    holiday: { divisionId: string | null; departmentId: string | null },
    divisionId: string,
    departmentId: string | null,
  ): boolean {
    if (holiday.departmentId) return holiday.departmentId === departmentId;
    if (holiday.divisionId) return holiday.divisionId === divisionId;
    return true;
  }

  private weekdayName(dayOfWeek: number): string {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek] ?? 'This day';
  }

  private managementDutyWhere(
    actor: WorkActorContext,
  ): Prisma.DutyAssignmentWhereInput | null {
    if (actor.role === AccountRole.SUPER_ADMIN) {
      return {
        employee: {
          is: {
            role: {
              in: [
                AccountRole.SENIOR_MANAGEMENT,
                AccountRole.TEAM_MANAGER,
              ],
            },
          },
        },
      };
    }
    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      return { employee: { is: { role: AccountRole.TEAM_MANAGER } } };
    }
    return null;
  }

  private async resolveDutyNotificationRecipients(
    input: {
      actor: WorkActorContext;
      assignee: {
        id: string;
        role: AccountRole;
        employee: {
          divisionId: string | null;
          departmentId: string | null;
        } | null;
      };
      supervisorAccountId: string;
    },
    cache: Map<string, string[]> = new Map<string, string[]>(),
  ): Promise<string[]> {
    const recipients = new Set([
      input.assignee.id,
      input.supervisorAccountId,
    ]);
    if (input.actor.role !== AccountRole.SUPER_ADMIN) {
      return [...recipients];
    }

    const divisionId = input.assignee.employee?.divisionId;
    const departmentId = input.assignee.employee?.departmentId ?? null;
    if (!divisionId || input.assignee.role === AccountRole.SENIOR_MANAGEMENT) {
      return [...recipients];
    }

    const cacheKey = `${divisionId}:${departmentId ?? 'division'}:${input.assignee.role}`;
    const cachedManagerIds = cache.get(cacheKey);
    let managerIds: string[];
    if (cachedManagerIds) {
      managerIds = cachedManagerIds;
    } else {
      const positionFilters: Prisma.ManagementPositionWhereInput[] = [
        {
          positionType: ManagementPositionType.SENIOR_MANAGEMENT,
          divisionId,
          isActive: true,
        },
      ];
      if (
        input.assignee.role === AccountRole.EMPLOYEE &&
        departmentId
      ) {
        positionFilters.push({
          positionType: ManagementPositionType.TEAM_MANAGER,
          divisionId,
          departmentId,
          isActive: true,
        });
      }

      // Super Admin overrides notify the operational chain without exposing unrelated branch accounts.
      const assignments = await this.prisma.managementAssignment.findMany({
        where: {
          endedAt: null,
          position: { is: { OR: positionFilters } },
          employee: {
            is: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              account: { is: { isEnabled: true } },
            },
          },
        },
        select: {
          employee: {
            select: { account: { select: { id: true } } },
          },
        },
      });
      managerIds = assignments
        .map((assignment) => assignment.employee.account?.id)
        .filter((accountId): accountId is string => Boolean(accountId));
      cache.set(cacheKey, managerIds);
    }

    for (const managerId of managerIds) recipients.add(managerId);
    return [...recipients];
  }

  private dutyNotificationBody(
    dutyDate: Date,
    shiftName: string,
    overrideReason: string | null,
  ): string {
    const base = `${this.formatDate(dutyDate)} • ${shiftName}`;
    return overrideReason ? `${base} • Reason: ${overrideReason}` : base;
  }

  private buildDutyRosterAccountWhere(
    actor: WorkActorContext,
    query: DutyRosterQueryDto,
  ): Prisma.AccountWhereInput {
    // Team, division and branch rosters expose only roles each manager is authorized to schedule.
    const allowedRoles: AccountRole[] =
      actor.role === AccountRole.SUPER_ADMIN
        ? [
            AccountRole.SENIOR_MANAGEMENT,
            AccountRole.TEAM_MANAGER,
            AccountRole.EMPLOYEE,
          ]
        : actor.role === AccountRole.SENIOR_MANAGEMENT
          ? [AccountRole.TEAM_MANAGER, AccountRole.EMPLOYEE]
          : [AccountRole.EMPLOYEE];
    if (query.role && !allowedRoles.includes(query.role)) {
      throw new ForbiddenException(
        'The selected staff level is outside your duty assignment scope.',
      );
    }
    const organizationFilters: Prisma.EmployeeWhereInput[] = [
      {
        OR: [
          { departmentUnit: { is: { isActive: true } } },
          {
            departmentId: null,
            managementAssignments: {
              some: {
                endedAt: null,
                position: {
                  is: {
                    isActive: true,
                    positionType: ManagementPositionType.SENIOR_MANAGEMENT,
                  },
                },
              },
            },
          },
        ],
      },
    ];
    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      organizationFilters.push({
        divisionId: actor.divisionId ?? '__missing_division__',
      });
    }
    if (actor.role === AccountRole.TEAM_MANAGER) {
      organizationFilters.push({
        departmentId: actor.departmentId ?? '__missing_department__',
      });
    }
    if (query.divisionId) {
      organizationFilters.push({ divisionId: query.divisionId });
    }
    if (query.departmentId) {
      organizationFilters.push({ departmentId: query.departmentId });
    }
    const search = query.search?.trim();
    if (search) {
      organizationFilters.push({
        OR: [
          { empName: { contains: search, mode: 'insensitive' } },
          { empId: { contains: search, mode: 'insensitive' } },
          { designation: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return {
      id: query.employeeAccountId,
      isEnabled: true,
      role: query.role ?? { in: allowedRoles },
      employee: {
        is: {
          status: EmployeeStatus.ACTIVE,
          employmentStatus: EmploymentStatus.ACTIVE,
          archivedAt: null,
          isActivated: true,
          division: { is: { isActive: true } },
          AND: organizationFilters,
        },
      },
    };
  }

  private async assertDivisionInsideScope(
    actor: WorkActorContext,
    divisionId: string,
  ): Promise<void> {
    if (actor.role !== AccountRole.SUPER_ADMIN && actor.divisionId !== divisionId) {
      throw new ForbiddenException(
        'The selected division is outside your management scope.',
      );
    }

    const division = await this.prisma.division.findFirst({
      where: { id: divisionId, isActive: true },
      select: { id: true },
    });

    if (!division) {
      throw new ForbiddenException(
        'The selected division is outside your management scope.',
      );
    }
  }

  private async listRosterDepartments(actor: WorkActorContext) {
    return this.prisma.department.findMany({
      where:
        actor.role === AccountRole.TEAM_MANAGER
          ? { id: actor.departmentId ?? '__missing_department__', isActive: true }
          : actor.role === AccountRole.SENIOR_MANAGEMENT
            ? {
                divisionId: actor.divisionId ?? '__missing_division__',
                isActive: true,
              }
            : { isActive: true },
      orderBy: [{ division: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        divisionId: true,
        code: true,
        name: true,
        division: { select: { id: true, code: true, name: true } },
      },
    });
  }

  private serializeRosterAccount(account: DutyRosterAccount) {
    return {
      id: account.id,
      role: account.role,
      username: account.username,
      employee: account.employee
        ? {
            id: account.employee.id,
            empId: account.employee.empId,
            empName: account.employee.empName,
            designation: account.employee.designation,
            division: account.employee.division,
            department: account.employee.departmentUnit,
            managementPosition:
              account.employee.managementAssignments[0]?.position ?? null,
          }
        : null,
    };
  }

  // Nepal Telecom weekly planning uses Sunday as the first roster day.
  private startOfWeek(value: string): string {
    const date = this.parseDateOnly(value, 'Date');
    return this.addDays(value, -date.getUTCDay());
  }

  private expandScheduleDates(dto: CreateDutyScheduleDto | BulkScheduleLike): string[] {
    const start = this.parseDateOnly(dto.startDate, 'Start date');
    const endText =
      dto.recurrenceType === DutyRecurrenceType.ONE_TIME
        ? dto.startDate
        : dto.endDate;

    if (!endText) {
      throw new BadRequestException(
        'An end date is required for a recurring duty schedule.',
      );
    }

    const end = this.parseDateOnly(endText, 'End date');

    if (end.getTime() < start.getTime()) {
      throw new BadRequestException(
        'Duty schedule end date must be on or after the start date.',
      );
    }

    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

    if (days > MAX_SCHEDULE_DAYS) {
      throw new BadRequestException(
        `Duty schedules can cover at most ${MAX_SCHEDULE_DAYS} calendar days at once.`,
      );
    }

    const weekdays = new Set(dto.weekdays ?? []);

    if (
      dto.recurrenceType === DutyRecurrenceType.WEEKLY &&
      weekdays.size === 0
    ) {
      throw new BadRequestException(
        'Select at least one weekday for a weekly duty schedule.',
      );
    }

    const dates: string[] = [];

    for (let current = new Date(start); current <= end; current = new Date(current.getTime() + 86_400_000)) {
      if (
        dto.recurrenceType !== DutyRecurrenceType.WEEKLY ||
        weekdays.has(current.getUTCDay())
      ) {
        dates.push(this.dateOnlyString(current));
      }
    }

    if (dates.length === 0) {
      throw new BadRequestException(
        'The selected recurrence does not produce any duty dates.',
      );
    }

    return dates;
  }

  private async assertNoDutyConflicts(
    employeeAccountId: string,
    windows: Array<{ startsAt: Date; endsAt: Date }>,
    excludedAssignmentId?: string,
  ): Promise<void> {
    const restMs = MIN_DUTY_REST_MINUTES * 60_000;
    for (const window of windows) {
      const nearby = await this.prisma.dutyAssignment.findMany({
        where: {
          employeeAccountId,
          id: excludedAssignmentId ? { not: excludedAssignmentId } : undefined,
          cancelledAt: null,
          startsAt: { lt: new Date(window.endsAt.getTime() + restMs) },
          endsAt: { gt: new Date(window.startsAt.getTime() - restMs) },
        },
        select: { id: true, shiftName: true, startsAt: true, endsAt: true },
      });
      const overlap = nearby.find(
        (assignment) =>
          assignment.startsAt < window.endsAt &&
          assignment.endsAt > window.startsAt,
      );
      if (overlap) {
        throw new ConflictException(
          `${overlap.shiftName} already overlaps the selected duty time.`,
        );
      }
      const restConflict = nearby.find((assignment) => {
        if (assignment.endsAt <= window.startsAt) {
          return window.startsAt.getTime() - assignment.endsAt.getTime() < restMs;
        }
        if (assignment.startsAt >= window.endsAt) {
          return assignment.startsAt.getTime() - window.endsAt.getTime() < restMs;
        }
        return false;
      });
      if (restConflict) {
        throw new ConflictException(
          `Keep at least ${Math.round(MIN_DUTY_REST_MINUTES / 60)} hours of rest between ${restConflict.shiftName} and the new duty.`,
        );
      }
    }
  }

  private async assertNoDutyLeave(
    employeeAccountId: string,
    dates: string[],
  ): Promise<void> {
    const leave = await this.prisma.dutyException.findFirst({
      where: {
        employeeAccountId,
        type: DutyExceptionType.LEAVE,
        exceptionDate: {
          in: dates.map((date) => this.parseDateOnly(date, 'Duty date')),
        },
      },
      orderBy: { exceptionDate: 'asc' },
      select: { exceptionDate: true },
    });

    if (leave) {
      throw new ConflictException(
        `Duty cannot be assigned on ${this.dateOnlyString(leave.exceptionDate)} because leave is recorded.`,
      );
    }
  }

  private assignmentWindow(
    date: string,
    startMinute: number,
    endMinute: number,
  ) {
    const startsAt = this.kathmanduDateTime(date, startMinute);
    const endDate = endMinute <= startMinute ? this.addDays(date, 1) : date;
    const endsAt = this.kathmanduDateTime(endDate, endMinute);
    return { startsAt, endsAt };
  }

  private kathmanduDateTime(date: string, minuteOfDay: number): Date {
    const [year, month, day] = date.split('-').map(Number);
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    return new Date(
      Date.UTC(year, month - 1, day, hour, minute) -
        KATHMANDU_OFFSET_MINUTES * 60_000,
    );
  }

  private parseTime(value: string, label: string): number {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) throw new BadRequestException(`${label} is invalid.`);
    return Number(match[1]) * 60 + Number(match[2]);
  }

  private parseDateOnly(value: string, label: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${label} must use YYYY-MM-DD format.`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || this.dateOnlyString(date) !== value) {
      throw new BadRequestException(`${label} is invalid.`);
    }
    return date;
  }

  private localDateString(date: Date): string {
    const local = new Date(date.getTime() + KATHMANDU_OFFSET_MINUTES * 60_000);
    return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
  }

  private dateOnlyString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private addDays(value: string, days: number): string {
    const date = this.parseDateOnly(value, 'Date');
    return this.dateOnlyString(new Date(date.getTime() + days * 86_400_000));
  }

  private serializeHoliday(holiday: Prisma.DutyHolidayGetPayload<{
    select: typeof dutyHolidaySelect;
  }>) {
    const scope = holiday.departmentId
      ? DutyHolidayScope.DEPARTMENT
      : holiday.divisionId
        ? DutyHolidayScope.DIVISION
        : DutyHolidayScope.BRANCH;
    return {
      ...holiday,
      scope,
      startDate: this.dateOnlyString(holiday.startDate),
      endDate: this.dateOnlyString(holiday.endDate),
      cancelledAt: holiday.cancelledAt?.toISOString() ?? null,
      createdAt: holiday.createdAt.toISOString(),
      updatedAt: holiday.updatedAt.toISOString(),
    };
  }

  private serializeTemplate(template: {
    id: string;
    name: string;
    startMinute: number;
    endMinute: number;
    spansNextDay: boolean;
    isActive: boolean;
    divisionId: string | null;
    departmentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...template,
      scope: template.departmentId
        ? DutyShiftScope.DEPARTMENT
        : template.divisionId
          ? DutyShiftScope.DIVISION
          : DutyShiftScope.BRANCH,
      startTime: this.minuteLabel(template.startMinute),
      endTime: this.minuteLabel(template.endMinute),
    };
  }

  private serializeAssignment(assignment: Prisma.DutyAssignmentGetPayload<{
    select: typeof dutyAssignmentSelect;
  }>) {
    return {
      ...assignment,
      dutyDate: this.dateOnlyString(assignment.dutyDate),
      startsAt: assignment.startsAt.toISOString(),
      endsAt: assignment.endsAt.toISOString(),
      cancelledAt: assignment.cancelledAt?.toISOString() ?? null,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
      shift: this.serializeAssignmentShift(assignment),
    };
  }

  private serializeAssignmentShift(assignment: Prisma.DutyAssignmentGetPayload<{
    select: typeof dutyAssignmentSelect;
  }>) {
    const startMinute =
      assignment.shiftStartMinute ?? assignment.shift?.startMinute ?? 0;
    const endMinute = assignment.shiftEndMinute ?? assignment.shift?.endMinute ?? 0;

    return {
      id: assignment.shift?.id ?? null,
      name: assignment.shiftName ?? assignment.shift?.name ?? 'Deleted shift',
      startMinute,
      endMinute,
      startTime: this.minuteLabel(startMinute),
      endTime: this.minuteLabel(endMinute),
      spansNextDay:
        assignment.shiftSpansNextDay ?? assignment.shift?.spansNextDay ?? false,
      isActive: assignment.shift?.isActive ?? false,
      divisionId: assignment.shift?.divisionId ?? assignment.divisionId,
      departmentId: assignment.shift?.departmentId ?? assignment.departmentId,
      deleted: assignment.shift === null,
    };
  }

  private serializeException(exception: Prisma.DutyExceptionGetPayload<{
    select: typeof dutyExceptionSelect;
  }>) {
    return {
      ...exception,
      exceptionDate: this.dateOnlyString(exception.exceptionDate),
      createdAt: exception.createdAt.toISOString(),
    };
  }

  private minuteLabel(value: number): string {
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  private optionalText(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }
}
