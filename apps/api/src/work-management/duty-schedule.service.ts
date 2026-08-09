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
  EmployeeStatus,
  EmploymentStatus,
  ManagementPositionType,
  DutyExceptionType,
  DutyRecurrenceType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CancelDutyAssignmentDto } from './dto/cancel-duty-assignment.dto';
import { CreateBulkDutyScheduleDto } from './dto/create-bulk-duty-schedule.dto';
import { CreateDutyExceptionDto } from './dto/create-duty-exception.dto';
import { CreateDutyScheduleDto } from './dto/create-duty-schedule.dto';
import { CreateDutyShiftTemplateDto } from './dto/create-duty-shift-template.dto';
import { DutyRosterQueryDto } from './dto/duty-roster-query.dto';
import {
  DutyAssignmentListView,
  ListDutyAssignmentsQueryDto,
} from './dto/list-duty-assignments-query.dto';
import { UpdateDutyAssignmentDto } from './dto/update-duty-assignment.dto';
import { UpdateDutyShiftTemplateDto } from './dto/update-duty-shift-template.dto';
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

const dutyRosterAccountSelect = {
  id: true,
  role: true,
  username: true,
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
type DutyConflictKind = 'DUTY_CONFLICT' | 'LEAVE' | 'HOLIDAY';

interface DutyWindowConflict {
  window: DutyWindow;
  type: DutyConflictKind;
  message: string;
  existingAssignmentId: string | null;
}

interface DutyOverrideGovernance {
  authority: DutyAssignmentAuthority;
  hierarchyOverride: boolean;
  conflictOverride: boolean;
  overrideReason: string | null;
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

    const scope = this.templateScope(actor);
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

  async listShiftTemplates(user: AuthenticatedUser) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const templates = await this.prisma.dutyShiftTemplate.findMany({
      where: this.visibleTemplateWhere(actor),
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
    const governance = this.resolveOverrideGovernance({
      actor,
      assigneeRole: employee.role,
      conflictCount: conflicts.length,
      overrideConflicts: dto.overrideConflicts === true,
      overrideReason: dto.overrideReason,
    });
    const conflictsByDate = new Map(
      conflicts.map((conflict) => [conflict.window.date, conflict]),
    );

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
            authority: governance.authority,
            overrideReason: governance.overrideReason,
            hierarchyOverride: governance.hierarchyOverride,
            conflictOverride: governance.conflictOverride,
          },
          select: { id: true },
        });

        // Store one assignment per duty date; the series preserves the original recurrence intent.
        const assignments: Prisma.DutyAssignmentGetPayload<{
          select: typeof dutyAssignmentSelect;
        }>[] = [];

        for (const window of windows) {
          const conflict = conflictsByDate.get(window.date) ?? null;
          const assignmentOverride = governance.hierarchyOverride || Boolean(conflict);
          const authority = assignmentOverride
            ? DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE
            : DutyAssignmentAuthority.STANDARD_HIERARCHY;
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
              overrideReason: assignmentOverride
                ? governance.overrideReason
                : null,
              hierarchyOverride: governance.hierarchyOverride,
              conflictOverride: Boolean(conflict),
            },
            select: dutyAssignmentSelect,
          });
          assignments.push(assignment);
        }

        await transaction.dutyActivity.createMany({
          data: assignments.map((assignment) => {
            const conflict = conflictsByDate.get(
              this.dateOnlyString(assignment.dutyDate),
            );
            const isOverride =
              assignment.authority ===
              DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE;
            return {
              dutyAssignmentId: assignment.id,
              seriesId: series.id,
              employeeAccountId: employee.id,
              actorAccountId: actor.accountId,
              action: isOverride
                ? DutyActivityAction.OVERRIDE_ASSIGNED
                : DutyActivityAction.ASSIGNED,
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
                hierarchyOverride: governance.hierarchyOverride,
                conflictOverride: assignment.conflictOverride,
                conflictType: conflict?.type ?? null,
                existingAssignmentId:
                  conflict?.existingAssignmentId ?? null,
                overrideReason: assignment.overrideReason,
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
      const isOverride =
        assignment.authority === DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE;
      await this.dutyNotifications.publishDutyUpdate({
        assignmentId: assignment.id,
        employeeAccountId: employee.id,
        action: 'ASSIGNED',
        actorAccountId: actor.accountId,
        recipientAccountIds,
        title: isOverride
          ? 'Duty assigned by Super Admin'
          : 'Duty assigned',
        body: this.dutyNotificationBody(
          assignment.dutyDate,
          shift.name,
          assignment.overrideReason,
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
      governance: {
        authority: governance.authority,
        hierarchyOverride: governance.hierarchyOverride,
        conflictOverride: governance.conflictOverride,
        overrideReason: governance.overrideReason,
      },
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
    if (dto.createValidAssignmentsOnly && dto.overrideConflicts) {
      throw new BadRequestException(
        'Choose either create valid assignments only or override conflicts, not both.',
      );
    }
    if (dto.overrideConflicts && actor.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only Super Admin can preview a conflict override.',
      );
    }
    const prepared = await this.prepareBulkSchedule(actor, dto);

    return this.serializeBulkPreview(prepared);
  }

  async createBulkSchedule(
    user: AuthenticatedUser,
    dto: CreateBulkDutyScheduleDto,
  ) {
    const actor = await this.resolveManager(user);
    if (dto.createValidAssignmentsOnly && dto.overrideConflicts) {
      throw new BadRequestException(
        'Choose either create valid assignments only or override conflicts, not both.',
      );
    }
    if (dto.overrideConflicts && actor.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only Super Admin can override reviewed duty conflicts.',
      );
    }

    // Creation reruns the same authoritative preview checks instead of trusting browser state.
    const prepared = await this.prepareBulkSchedule(actor, dto);
    const conflictCount = prepared.people.reduce(
      (total, person) => total + person.conflicts.length,
      0,
    );

    // Conflicted dates are never skipped or overridden without one explicit request mode.
    if (
      conflictCount > 0 &&
      !dto.createValidAssignmentsOnly &&
      !dto.overrideConflicts
    ) {
      throw new ConflictException(
        'Duty conflicts were found. Review the preview, then choose valid-only creation or a Super Admin override with a reason.',
      );
    }
    if (dto.overrideConflicts && conflictCount === 0) {
      throw new BadRequestException(
        'No duty conflicts are available to override.',
      );
    }

    const governanceByAccount = new Map<string, DutyOverrideGovernance>();
    for (const person of prepared.people) {
      const conflictOverride =
        dto.overrideConflicts === true && person.conflicts.length > 0;
      const hierarchyOverride = this.isHierarchyOverride(
        actor,
        person.account.role,
      );
      // A mixed bulk request applies override governance only to people who actually need it.
      governanceByAccount.set(
        person.account.id,
        this.resolveOverrideGovernance({
          actor,
          assigneeRole: person.account.role,
          conflictCount: conflictOverride ? person.conflicts.length : 0,
          overrideConflicts: conflictOverride,
          overrideReason:
            conflictOverride || hierarchyOverride ? dto.overrideReason : undefined,
        }),
      );
    }

    const assignmentCount = prepared.people.reduce(
      (total, person) =>
        total +
        person.validWindows.length +
        (dto.overrideConflicts ? person.conflicts.length : 0),
      0,
    );
    if (assignmentCount === 0) {
      throw new ConflictException(
        'No valid duty assignments remain after conflict and leave checks.',
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
          const governance = governanceByAccount.get(person.account.id);
          if (!governance) continue;
          const windowsToCreate = [
            ...person.validWindows.map((window) => ({ window, conflict: null })),
            ...(dto.overrideConflicts
              ? person.conflicts.map((conflict) => ({
                  window: conflict.window,
                  conflict,
                }))
              : []),
          ].sort(
            (left, right) =>
              left.window.startsAt.getTime() - right.window.startsAt.getTime(),
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
              authority: governance.authority,
              overrideReason: governance.overrideReason,
              hierarchyOverride: governance.hierarchyOverride,
              conflictOverride: governance.conflictOverride,
            },
            select: { id: true },
          });

          for (const item of windowsToCreate) {
            const assignmentOverride =
              governance.hierarchyOverride || Boolean(item.conflict);
            const authority = assignmentOverride
              ? DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE
              : DutyAssignmentAuthority.STANDARD_HIERARCHY;
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
                dutyDate: this.parseDateOnly(item.window.date, 'Duty date'),
                startsAt: item.window.startsAt,
                endsAt: item.window.endsAt,
                reportingLocation,
                notes,
                authority,
                overrideReason: assignmentOverride
                  ? governance.overrideReason
                  : null,
                hierarchyOverride: governance.hierarchyOverride,
                conflictOverride: Boolean(item.conflict),
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
                action: assignmentOverride
                  ? DutyActivityAction.OVERRIDE_ASSIGNED
                  : DutyActivityAction.ASSIGNED,
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
                    person.account.username ??
                    person.account.role,
                  authority,
                  hierarchyOverride: governance.hierarchyOverride,
                  conflictOverride: Boolean(item.conflict),
                  conflictType: item.conflict?.type ?? null,
                  existingAssignmentId:
                    item.conflict?.existingAssignmentId ?? null,
                  overrideReason: assignment.overrideReason,
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
      const isOverride =
        assignment.authority === DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE;
      await this.dutyNotifications.publishDutyUpdate({
        assignmentId: assignment.id,
        employeeAccountId: assignment.employeeAccountId,
        action: 'ASSIGNED',
        actorAccountId: actor.accountId,
        recipientAccountIds,
        title: isOverride
          ? 'Duty assigned by Super Admin'
          : 'Duty assigned',
        body: this.dutyNotificationBody(
          assignment.dutyDate,
          assignment.shiftName,
          assignment.overrideReason,
        ),
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
        metadata: {
          source: 'BULK_ROSTER',
          authority: assignment.authority,
          hierarchyOverride: assignment.hierarchyOverride,
          conflictOverride: assignment.conflictOverride,
          overrideReason: assignment.overrideReason,
        },
      });
    }

    return {
      message: `${created.length} duty assignments created successfully.`,
      createdCount: created.length,
      skippedConflictCount: dto.createValidAssignmentsOnly ? conflictCount : 0,
      overriddenConflictCount: dto.overrideConflicts ? conflictCount : 0,
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
    if (query.departmentId) {
      await this.assertDepartmentInsideScope(actor, query.departmentId);
    }

    const accountWhere = this.buildDutyRosterAccountWhere(actor, query);
    // Staff visibility follows the same role hierarchy used for duty assignment authority.
    const people = await this.prisma.account.findMany({
      where: accountWhere,
      orderBy: { employee: { empName: 'asc' } },
      take: 250,
      select: dutyRosterAccountSelect,
    });
    const accountIds = people.map((person) => person.id);
    const assignmentWhere: Prisma.DutyAssignmentWhereInput = {
      ...this.visibleAssignmentWhere(actor),
      employeeAccountId: { in: accountIds },
      dutyDate: { gte: from, lte: to },
      cancelledAt: null,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    };
    const exceptionWhere: Prisma.DutyExceptionWhereInput = {
      ...this.visibleExceptionWhere(actor),
      employeeAccountId: { in: accountIds },
      exceptionDate: { gte: from, lte: to },
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
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
        holidayCount: dateExceptions.filter(
          (exception) => exception.type === DutyExceptionType.HOLIDAY,
        ).length,
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
        holidayCount: exceptions.filter(
          (exception) =>
            exception.departmentId === department.id &&
            exception.type === DutyExceptionType.HOLIDAY,
        ).length,
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
        holiday: exceptions.filter(
          (exception) => exception.type === DutyExceptionType.HOLIDAY,
        ).length,
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
    const today = this.parseDateOnly(this.localDateString(now), 'Today');
    const oversightEnd = this.parseDateOnly(
      this.addDays(this.localDateString(now), 30),
      'Oversight end date',
    );
    const scope = this.visibleAssignmentWhere(actor);
    const exceptionScope = this.visibleExceptionWhere(actor);
    const managementWhere = this.managementDutyWhere(actor);
    const [
      scheduledToday,
      onDutyNow,
      cancelledToday,
      leaveToday,
      holidayToday,
      assignedByMeUpcoming,
      managementDutiesUpcoming,
      overridesUpcoming,
      hierarchyOverridesUpcoming,
      conflictOverridesUpcoming,
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
      this.prisma.dutyException.count({
        where: {
          ...exceptionScope,
          exceptionDate: today,
          type: DutyExceptionType.HOLIDAY,
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
      this.prisma.dutyAssignment.count({
        where: {
          ...scope,
          authority: DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
          startsAt: { gte: now, lt: oversightEnd },
          cancelledAt: null,
        },
      }),
      this.prisma.dutyAssignment.count({
        where: {
          ...scope,
          hierarchyOverride: true,
          startsAt: { gte: now, lt: oversightEnd },
          cancelledAt: null,
        },
      }),
      this.prisma.dutyAssignment.count({
        where: {
          ...scope,
          conflictOverride: true,
          startsAt: { gte: now, lt: oversightEnd },
          cancelledAt: null,
        },
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
        holidayToday,
        cancelledToday,
        assignedByMeUpcoming,
        managementDutiesUpcoming,
        overridesUpcoming,
        hierarchyOverridesUpcoming,
        conflictOverridesUpcoming,
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
    await this.assertNoDutyExceptions(current.employeeAccountId, [date]);

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

  async createException(
    user: AuthenticatedUser,
    dto: CreateDutyExceptionDto,
  ) {
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

    const date = this.parseDateOnly(dto.date, 'Exception date');
    const conflictingDuty = await this.prisma.dutyAssignment.findFirst({
      where: {
        employeeAccountId: employee.id,
        dutyDate: date,
        cancelledAt: null,
      },
      select: { id: true },
    });

    if (conflictingDuty) {
      throw new ConflictException(
        'Cancel the employee duty assignment before recording leave or holiday.',
      );
    }

    const exception = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const created = await transaction.dutyException.create({
          data: {
            employeeAccountId: employee.id,
            createdByAccountId: actor.accountId,
            divisionId,
            departmentId,
            exceptionDate: date,
            type: dto.type,
            note: this.optionalText(dto.note),
          },
          select: dutyExceptionSelect,
        });
        await transaction.dutyActivity.create({
          data: {
            employeeAccountId: employee.id,
            actorAccountId: actor.accountId,
            action: DutyActivityAction.EXCEPTION_RECORDED,
            details: {
              exceptionId: created.id,
              type: created.type,
              date: this.dateOnlyString(created.exceptionDate),
              note: created.note,
            },
          },
        });
        return created;
      },
    );

    await this.dutyNotifications.publishDutyUpdate({
      assignmentId: null,
      employeeAccountId: employee.id,
      action: dto.type === DutyExceptionType.LEAVE ? 'LEAVE_RECORDED' : 'HOLIDAY_RECORDED',
      actorAccountId: actor.accountId,
      recipientAccountIds: [employee.id, actor.accountId],
      title: dto.type === DutyExceptionType.LEAVE ? 'Leave recorded' : 'Holiday recorded',
      body: `${dto.date}${exception.note ? ` • ${exception.note}` : ''}`,
      metadata: { exceptionId: exception.id, type: exception.type },
    });

    return {
      message: `${dto.type === DutyExceptionType.LEAVE ? 'Leave' : 'Holiday'} recorded successfully.`,
      exception: this.serializeException(exception),
    };
  }

  private async resolveManager(user: AuthenticatedUser) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);
    return actor;
  }

  private templateScope(actor: WorkActorContext) {
    if (actor.role === AccountRole.SUPER_ADMIN) {
      return { divisionId: null, departmentId: null };
    }

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      return { divisionId: actor.divisionId, departmentId: null };
    }

    return {
      divisionId: actor.divisionId,
      departmentId: actor.departmentId,
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
    // Account IDs are resolved through server-owned hierarchy checks before any schedule calculation.
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
    const [existingAssignments, exceptions] = await Promise.all([
      this.prisma.dutyAssignment.findMany({
        where: {
          employeeAccountId: { in: employeeIds },
          cancelledAt: null,
          startsAt: { lt: latestEnd },
          endsAt: { gt: earliestStart },
        },
        select: {
          id: true,
          employeeAccountId: true,
          startsAt: true,
          endsAt: true,
        },
      }),
      this.prisma.dutyException.findMany({
        where: {
          employeeAccountId: { in: employeeIds },
          exceptionDate: { in: dateValues },
        },
        select: {
          employeeAccountId: true,
          exceptionDate: true,
          type: true,
        },
      }),
    ]);

    const people = [] as Array<{
      account: WorkAccountRecord;
      divisionId: string;
      departmentId: string | null;
      supervisor: WorkAccountRecord;
      validWindows: DutyWindow[];
      conflicts: DutyWindowConflict[];
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
      const validWindows: DutyWindow[] = [];

      // Every employee-date window is classified as valid or conflicted for a reviewable preview.
      for (const window of windows) {
        const overlap = existingAssignments.find(
          (assignment) =>
            assignment.employeeAccountId === account.id &&
            assignment.startsAt < window.endsAt &&
            assignment.endsAt > window.startsAt,
        );
        const exception = exceptions.find(
          (record) =>
            record.employeeAccountId === account.id &&
            this.dateOnlyString(record.exceptionDate) === window.date,
        );

        if (overlap) {
          conflicts.push({
            window,
            type: 'DUTY_CONFLICT',
            message: 'Another duty is already set for this time.',
            existingAssignmentId: overlap.id,
          });
        } else if (exception) {
          conflicts.push({
            window,
            type:
              exception.type === DutyExceptionType.LEAVE ? 'LEAVE' : 'HOLIDAY',
            message:
              exception.type === DutyExceptionType.LEAVE
                ? 'Leave is already recorded for this date.'
                : 'A holiday is already recorded for this date.',
            existingAssignmentId: null,
          });
        } else {
          validWindows.push(window);
        }
      }

      people.push({
        account,
        divisionId,
        departmentId,
        supervisor,
        validWindows,
        conflicts,
      });
    }

    return {
      actor,
      shift,
      dates,
      people,
      totalRequested,
      requestedConflictOverride: dto.overrideConflicts === true,
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
      override: {
        canOverrideConflicts: prepared.actor.role === AccountRole.SUPER_ADMIN,
        requestedConflictOverride: prepared.requestedConflictOverride,
        hierarchyOverrideCount: prepared.people.filter((person) =>
          this.isHierarchyOverride(prepared.actor, person.account.role),
        ).length,
        requiresReason:
          prepared.people.some((person) =>
            this.isHierarchyOverride(prepared.actor, person.account.role),
          ) ||
          (prepared.requestedConflictOverride && conflictCount > 0),
      },
      people: prepared.people.map((person) => ({
        account: {
          id: person.account.id,
          role: person.account.role,
          username: person.account.username,
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
            ? this.isHierarchyOverride(prepared.actor, person.account.role)
              ? 'NEEDS_APPROVAL'
              : 'READY'
            : person.validWindows.length > 0
              ? 'PARTLY_READY'
              : 'BLOCKED',
        hierarchyOverride: this.isHierarchyOverride(
          prepared.actor,
          person.account.role,
        ),
        conflicts: person.conflicts.map((conflict) => ({
          date: conflict.window.date,
          startsAt: conflict.window.startsAt.toISOString(),
          endsAt: conflict.window.endsAt.toISOString(),
          type: conflict.type,
          message: conflict.message,
          existingAssignmentId: conflict.existingAssignmentId,
        })),
      })),
    };
  }

  private resolveOverrideGovernance(input: {
    actor: WorkActorContext;
    assigneeRole: AccountRole;
    conflictCount: number;
    overrideConflicts: boolean;
    overrideReason: string | undefined;
  }): DutyOverrideGovernance {
    const hierarchyOverride = this.isHierarchyOverride(
      input.actor,
      input.assigneeRole,
    );
    if (
      input.overrideConflicts &&
      input.actor.role !== AccountRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only Super Admin can override reviewed duty conflicts.',
      );
    }
    if (input.conflictCount > 0 && !input.overrideConflicts) {
      throw new ConflictException(
        'Duty conflicts were found. Super Admin must explicitly request an override and provide a reason.',
      );
    }
    if (input.overrideConflicts && input.conflictCount === 0) {
      throw new BadRequestException(
        'No duty conflicts are available to override.',
      );
    }

    const conflictOverride =
      input.overrideConflicts && input.conflictCount > 0;
    const overrideRequired = hierarchyOverride || conflictOverride;
    const overrideReason = this.optionalText(input.overrideReason);

    // A branch-wide hierarchy or conflict override is invalid without a meaningful operational reason.
    if (
      overrideRequired &&
      (!overrideReason || overrideReason.length < 10)
    ) {
      throw new BadRequestException(
        'Provide an override reason of at least 10 characters.',
      );
    }
    if (!overrideRequired && overrideReason) {
      throw new BadRequestException(
        'An override reason can be recorded only for an actual hierarchy or conflict override.',
      );
    }

    return {
      authority: overrideRequired
        ? DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE
        : DutyAssignmentAuthority.STANDARD_HIERARCHY,
      hierarchyOverride,
      conflictOverride,
      overrideReason: overrideRequired ? overrideReason : null,
    };
  }

  private isHierarchyOverride(
    actor: WorkActorContext,
    assigneeRole: AccountRole,
  ): boolean {
    // Super Admin directly scheduling below Senior Management bypasses the normal operating hierarchy.
    return (
      actor.role === AccountRole.SUPER_ADMIN &&
      (assigneeRole === AccountRole.TEAM_MANAGER ||
        assigneeRole === AccountRole.EMPLOYEE)
    );
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
    const [existingAssignments, exceptions] = await Promise.all([
      this.prisma.dutyAssignment.findMany({
        where: {
          employeeAccountId,
          cancelledAt: null,
          startsAt: { lt: latestEnd },
          endsAt: { gt: earliestStart },
        },
        select: { id: true, startsAt: true, endsAt: true },
      }),
      this.prisma.dutyException.findMany({
        where: {
          employeeAccountId,
          exceptionDate: {
            in: windows.map((window) =>
              this.parseDateOnly(window.date, 'Duty date'),
            ),
          },
        },
        select: { exceptionDate: true, type: true },
      }),
    ]);

    const conflicts: DutyWindowConflict[] = [];
    for (const window of windows) {
      const overlap = existingAssignments.find(
        (assignment) =>
          assignment.startsAt < window.endsAt &&
          assignment.endsAt > window.startsAt,
      );
      const exception = exceptions.find(
        (record) =>
          this.dateOnlyString(record.exceptionDate) === window.date,
      );
      if (overlap) {
        conflicts.push({
          window,
          type: 'DUTY_CONFLICT',
          message: 'Another duty is already set for this time.',
          existingAssignmentId: overlap.id,
        });
      } else if (exception) {
        conflicts.push({
          window,
          type:
            exception.type === DutyExceptionType.LEAVE ? 'LEAVE' : 'HOLIDAY',
          message:
              exception.type === DutyExceptionType.LEAVE
                ? 'Leave is already recorded for this date.'
                : 'A holiday is already recorded for this date.',
          existingAssignmentId: null,
        });
      }
    }
    return conflicts;
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
    const allowedRoles =
      actor.role === AccountRole.SUPER_ADMIN
        ? [
            AccountRole.SENIOR_MANAGEMENT,
            AccountRole.TEAM_MANAGER,
            AccountRole.EMPLOYEE,
          ]
        : actor.role === AccountRole.SENIOR_MANAGEMENT
          ? [AccountRole.TEAM_MANAGER, AccountRole.EMPLOYEE]
          : [AccountRole.EMPLOYEE];
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
      role: { in: allowedRoles },
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
    for (const window of windows) {
      const conflict = await this.prisma.dutyAssignment.findFirst({
        where: {
          employeeAccountId,
          id: excludedAssignmentId ? { not: excludedAssignmentId } : undefined,
          cancelledAt: null,
          startsAt: { lt: window.endsAt },
          endsAt: { gt: window.startsAt },
        },
        select: { id: true, startsAt: true, endsAt: true },
      });

      if (conflict) {
        throw new ConflictException(
          `Duty schedule conflicts with an existing assignment from ${conflict.startsAt.toISOString()} to ${conflict.endsAt.toISOString()}.`,
        );
      }
    }
  }

  private async assertNoDutyExceptions(
    employeeAccountId: string,
    dates: string[],
  ): Promise<void> {
    const exceptions = await this.prisma.dutyException.findMany({
      where: {
        employeeAccountId,
        exceptionDate: {
          in: dates.map((date) => this.parseDateOnly(date, 'Duty date')),
        },
      },
      select: { exceptionDate: true, type: true },
    });

    if (exceptions.length > 0) {
      const first = exceptions[0];
      throw new ConflictException(
        `Duty cannot be assigned on ${this.dateOnlyString(first.exceptionDate)} because ${first.type.toLowerCase()} is recorded.`,
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
