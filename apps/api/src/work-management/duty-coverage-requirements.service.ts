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
  DutyCoverageRequirementAction,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CreateDutyCoverageRequirementDto } from './dto/create-duty-coverage-requirement.dto';
import { ListDutyCoverageRequirementsQueryDto } from './dto/list-duty-coverage-requirements-query.dto';
import { UpdateDutyCoverageRequirementDto } from './dto/update-duty-coverage-requirement.dto';
import { WorkScopeService } from './work-scope.service';
import type { WorkActorContext } from './work-scope.service';

const KATHMANDU_OFFSET_MS = 5.75 * 60 * 60 * 1000;
const FAR_FUTURE_DATE = new Date('9999-12-31T00:00:00.000Z');

const coverageRequirementSelect = {
  id: true,
  departmentId: true,
  shiftTemplateId: true,
  dayOfWeek: true,
  requiredStaff: true,
  reportingLocation: true,
  reportingLocationKey: true,
  effectiveFrom: true,
  effectiveUntil: true,
  createdByAccountId: true,
  updatedByAccountId: true,
  createdAt: true,
  updatedAt: true,
  department: {
    select: {
      id: true,
      divisionId: true,
      code: true,
      name: true,
      isActive: true,
      division: { select: { id: true, code: true, name: true, isActive: true } },
    },
  },
  shift: {
    select: {
      id: true,
      name: true,
      startMinute: true,
      endMinute: true,
      spansNextDay: true,
      isActive: true,
      divisionId: true,
      departmentId: true,
    },
  },
  createdBy: {
    select: {
      username: true,
      employee: { select: { empId: true, empName: true } },
    },
  },
  updatedBy: {
    select: {
      username: true,
      employee: { select: { empId: true, empName: true } },
    },
  },
} satisfies Prisma.DutyCoverageRequirementSelect;

type CoverageRequirementRecord = Prisma.DutyCoverageRequirementGetPayload<{
  select: typeof coverageRequirementSelect;
}>;

interface CoverageRequirementState {
  departmentId: string;
  shiftTemplateId: string;
  dayOfWeek: number;
  requiredStaff: number;
  reportingLocation: string | null;
  reportingLocationKey: string | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}

@Injectable()
export class DutyCoverageRequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
  ) {}

  async listRequirements(
    user: AuthenticatedUser,
    query: ListDutyCoverageRequirementsQueryDto,
  ): Promise<unknown> {
    const actor = await this.resolveManagerActor(user);
    await this.assertOptionalDepartmentInsideScope(actor, query.departmentId);
    const range = this.resolveOptionalRange(query.from, query.to);

    const records = await this.prisma.dutyCoverageRequirement.findMany({
      where: {
        AND: [
          this.buildVisibleWhere(actor),
          ...(query.departmentId ? [{ departmentId: query.departmentId }] : []),
          ...(query.shiftTemplateId
            ? [{ shiftTemplateId: query.shiftTemplateId }]
            : []),
          ...(query.dayOfWeek !== undefined
            ? [{ dayOfWeek: query.dayOfWeek }]
            : []),
          ...(range.from
            ? [
                {
                  OR: [
                    { effectiveUntil: null },
                    { effectiveUntil: { gte: range.from } },
                  ],
                },
              ]
            : []),
          ...(range.to ? [{ effectiveFrom: { lte: range.to } }] : []),
        ],
      },
      orderBy: [
        { department: { name: 'asc' } },
        { dayOfWeek: 'asc' },
        { shift: { startMinute: 'asc' } },
        { reportingLocationKey: 'asc' },
        { effectiveFrom: 'desc' },
      ],
      select: coverageRequirementSelect,
    });

    return {
      generatedAt: new Date().toISOString(),
      timezone: 'Asia/Kathmandu',
      items: records.map((record) => this.presentRequirement(record)),
    };
  }

  async createRequirement(
    user: AuthenticatedUser,
    dto: CreateDutyCoverageRequirementDto,
  ): Promise<unknown> {
    const actor = await this.resolveManagerActor(user);
    const department = await this.resolveDepartment(actor, dto.departmentId, true);
    await this.resolveShiftForDepartment(
      dto.shiftTemplateId,
      department.divisionId,
      department.id,
      true,
    );

    const state: CoverageRequirementState = {
      departmentId: department.id,
      shiftTemplateId: dto.shiftTemplateId,
      dayOfWeek: dto.dayOfWeek,
      requiredStaff: dto.requiredStaff,
      ...this.normalizeLocation(dto.reportingLocation),
      effectiveFrom: this.parseDate(dto.effectiveFrom),
      effectiveUntil: dto.effectiveUntil
        ? this.parseDate(dto.effectiveUntil)
        : null,
    };
    this.assertValidDateWindow(state.effectiveFrom, state.effectiveUntil);
    if (state.effectiveFrom < this.currentKathmanduDate()) {
      throw new BadRequestException(
        'A new coverage requirement cannot be backdated because that would rewrite historical reports.',
      );
    }
    await this.assertNoOverlap(state);

    const created = await this.prisma.$transaction(async (transaction) => {
      const requirement = await transaction.dutyCoverageRequirement.create({
        data: {
          ...state,
          createdByAccountId: actor.accountId,
          updatedByAccountId: actor.accountId,
        },
        select: coverageRequirementSelect,
      });

      await transaction.dutyCoverageRequirementActivity.create({
        data: {
          requirementId: requirement.id,
          actorAccountId: actor.accountId,
          action: DutyCoverageRequirementAction.CREATED,
          nextState: this.auditState(state),
        },
      });

      return requirement;
    });

    return this.presentRequirement(created);
  }

  async updateRequirement(
    user: AuthenticatedUser,
    requirementId: string,
    dto: UpdateDutyCoverageRequirementDto,
  ): Promise<unknown> {
    const actor = await this.resolveManagerActor(user);
    const existing = await this.findVisibleRequirement(actor, requirementId);
    const previous = this.toState(existing);
    const today = this.currentKathmanduDate();
    const hasStarted = existing.effectiveFrom <= today;

    if (existing.effectiveUntil && existing.effectiveUntil < today) {
      throw new BadRequestException(
        'Historical coverage requirements cannot be changed.',
      );
    }

    const nextDepartmentId = dto.departmentId ?? existing.departmentId;
    const department = await this.resolveDepartment(
      actor,
      nextDepartmentId,
      !hasStarted,
    );
    const nextShiftTemplateId = dto.shiftTemplateId ?? existing.shiftTemplateId;
    await this.resolveShiftForDepartment(
      nextShiftTemplateId,
      department.divisionId,
      department.id,
      !hasStarted,
    );

    const location =
      dto.reportingLocation === undefined
        ? {
            reportingLocation: existing.reportingLocation,
            reportingLocationKey: existing.reportingLocationKey,
          }
        : this.normalizeLocation(dto.reportingLocation ?? undefined);
    const next: CoverageRequirementState = {
      departmentId: nextDepartmentId,
      shiftTemplateId: nextShiftTemplateId,
      dayOfWeek: dto.dayOfWeek ?? existing.dayOfWeek,
      requiredStaff: dto.requiredStaff ?? existing.requiredStaff,
      ...location,
      effectiveFrom: dto.effectiveFrom
        ? this.parseDate(dto.effectiveFrom)
        : existing.effectiveFrom,
      effectiveUntil:
        dto.effectiveUntil === undefined
          ? existing.effectiveUntil
          : dto.effectiveUntil === null
            ? null
            : this.parseDate(dto.effectiveUntil),
    };
    this.assertValidDateWindow(next.effectiveFrom, next.effectiveUntil);

    if (hasStarted && this.changesHistoricalDefinition(previous, next)) {
      throw new BadRequestException(
        'A coverage requirement that has started cannot be rewritten. Retire it and create a new effective-dated requirement.',
      );
    }
    if (hasStarted && next.effectiveUntil && next.effectiveUntil < today) {
      throw new BadRequestException(
        'An active coverage requirement cannot be retired before the current Nepal date.',
      );
    }
    if (this.statesEqual(previous, next)) {
      throw new BadRequestException('No coverage requirement changes were supplied.');
    }

    await this.assertNoOverlap(next, requirementId);
    const action =
      next.effectiveUntil &&
      (!previous.effectiveUntil || next.effectiveUntil < previous.effectiveUntil)
        ? DutyCoverageRequirementAction.RETIRED
        : DutyCoverageRequirementAction.UPDATED;

    const updated = await this.prisma.$transaction(async (transaction) => {
      const requirement = await transaction.dutyCoverageRequirement.update({
        where: { id: requirementId },
        data: {
          ...next,
          updatedByAccountId: actor.accountId,
        },
        select: coverageRequirementSelect,
      });

      await transaction.dutyCoverageRequirementActivity.create({
        data: {
          requirementId,
          actorAccountId: actor.accountId,
          action,
          previousState: this.auditState(previous),
          nextState: this.auditState(next),
        },
      });

      return requirement;
    });

    return this.presentRequirement(updated);
  }

  async getRequirementAudit(
    user: AuthenticatedUser,
    requirementId: string,
  ): Promise<unknown> {
    const actor = await this.resolveManagerActor(user);
    const requirement = await this.findVisibleRequirement(actor, requirementId);
    const activities =
      await this.prisma.dutyCoverageRequirementActivity.findMany({
        where: { requirementId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          action: true,
          previousState: true,
          nextState: true,
          createdAt: true,
          actor: {
            select: {
              username: true,
              employee: { select: { empId: true, empName: true } },
            },
          },
        },
      });

    return {
      requirement: this.presentRequirement(requirement),
      activities: activities.map((activity) => ({
        id: activity.id,
        action: activity.action,
        previousState: activity.previousState,
        nextState: activity.nextState,
        actor: this.accountName(activity.actor),
        createdAt: activity.createdAt.toISOString(),
      })),
    };
  }

  private async resolveManagerActor(
    user: AuthenticatedUser,
  ): Promise<WorkActorContext> {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);
    return actor;
  }

  private buildVisibleWhere(
    actor: WorkActorContext,
  ): Prisma.DutyCoverageRequirementWhereInput {
    if (actor.role === AccountRole.SUPER_ADMIN) return {};
    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      return {
        department: {
          is: { divisionId: actor.divisionId ?? '__missing_division__' },
        },
      };
    }
    return {
      departmentId: actor.departmentId ?? '__missing_department__',
    };
  }

  private async assertOptionalDepartmentInsideScope(
    actor: WorkActorContext,
    departmentId: string | undefined,
  ): Promise<void> {
    if (!departmentId) return;
    await this.resolveDepartment(actor, departmentId, false);
  }

  private async resolveDepartment(
    actor: WorkActorContext,
    departmentId: string,
    requireActive: boolean,
  ): Promise<{
    id: string;
    divisionId: string;
    code: string;
    name: string;
    isActive: boolean;
  }> {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: {
        id: true,
        divisionId: true,
        code: true,
        name: true,
        isActive: true,
        division: { select: { isActive: true } },
      },
    });
    if (!department) {
      throw new NotFoundException('Department was not found.');
    }
    if (requireActive && (!department.isActive || !department.division.isActive)) {
      throw new BadRequestException(
        'Coverage requirements can be managed only for an active department.',
      );
    }
    if (
      actor.role === AccountRole.TEAM_MANAGER &&
      department.id !== actor.departmentId
    ) {
      throw new ForbiddenException(
        'Team Managers can manage coverage only for their own department.',
      );
    }
    if (
      actor.role === AccountRole.SENIOR_MANAGEMENT &&
      department.divisionId !== actor.divisionId
    ) {
      throw new ForbiddenException(
        'Senior Management can manage coverage only inside the assigned division.',
      );
    }
    return department;
  }

  private async resolveShiftForDepartment(
    shiftTemplateId: string,
    divisionId: string,
    departmentId: string,
    requireActive: boolean,
  ): Promise<void> {
    const shift = await this.prisma.dutyShiftTemplate.findUnique({
      where: { id: shiftTemplateId },
      select: {
        id: true,
        isActive: true,
        divisionId: true,
        departmentId: true,
      },
    });
    if (!shift) {
      throw new NotFoundException('Duty shift template was not found.');
    }
    if (requireActive && !shift.isActive) {
      throw new BadRequestException(
        'An inactive shift template cannot receive a coverage requirement.',
      );
    }
    const matchesDepartment =
      (!shift.departmentId || shift.departmentId === departmentId) &&
      (!shift.divisionId || shift.divisionId === divisionId);
    if (!matchesDepartment) {
      throw new ForbiddenException(
        'The selected shift template is not available to this department.',
      );
    }
  }

  private async findVisibleRequirement(
    actor: WorkActorContext,
    requirementId: string,
  ): Promise<CoverageRequirementRecord> {
    const requirement = await this.prisma.dutyCoverageRequirement.findFirst({
      where: {
        AND: [{ id: requirementId }, this.buildVisibleWhere(actor)],
      },
      select: coverageRequirementSelect,
    });
    if (!requirement) {
      throw new NotFoundException('Duty coverage requirement was not found.');
    }
    return requirement;
  }

  private async assertNoOverlap(
    state: CoverageRequirementState,
    excludedRequirementId?: string,
  ): Promise<void> {
    // A generic location target and a location-specific target cannot coexist for one staffing slot.
    const locationScope: Prisma.DutyCoverageRequirementWhereInput =
      state.reportingLocationKey === null
        ? {}
        : {
            OR: [
              { reportingLocationKey: null },
              { reportingLocationKey: state.reportingLocationKey },
            ],
          };
    const overlap = await this.prisma.dutyCoverageRequirement.findFirst({
      where: {
        AND: [
          {
            departmentId: state.departmentId,
            shiftTemplateId: state.shiftTemplateId,
            dayOfWeek: state.dayOfWeek,
            ...(excludedRequirementId
              ? { id: { not: excludedRequirementId } }
              : {}),
            effectiveFrom: {
              lte: state.effectiveUntil ?? FAR_FUTURE_DATE,
            },
            OR: [
              { effectiveUntil: null },
              { effectiveUntil: { gte: state.effectiveFrom } },
            ],
          },
          locationScope,
        ],
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException(
        'An overlapping coverage requirement already exists for this department, shift, weekday and location scope.',
      );
    }
  }

  private resolveOptionalRange(from?: string, to?: string) {
    const parsedFrom = from ? this.parseDate(from) : null;
    const parsedTo = to ? this.parseDate(to) : null;
    if (parsedFrom && parsedTo && parsedTo < parsedFrom) {
      throw new BadRequestException('Coverage range end must not precede start.');
    }
    return { from: parsedFrom, to: parsedTo };
  }

  private parseDate(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new BadRequestException('Coverage dates must use YYYY-MM-DD format.');
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('One or more coverage dates are invalid.');
    }
    return date;
  }

  private currentKathmanduDate(): Date {
    const kathmanduNow = new Date(Date.now() + KATHMANDU_OFFSET_MS);
    return new Date(
      Date.UTC(
        kathmanduNow.getUTCFullYear(),
        kathmanduNow.getUTCMonth(),
        kathmanduNow.getUTCDate(),
      ),
    );
  }

  private assertValidDateWindow(from: Date, until: Date | null): void {
    if (until && until < from) {
      throw new BadRequestException(
        'Coverage effective-until date must not precede effective-from date.',
      );
    }
  }

  private normalizeLocation(value?: string): {
    reportingLocation: string | null;
    reportingLocationKey: string | null;
  } {
    const display = value?.trim().replace(/\s+/g, ' ') ?? null;
    return {
      reportingLocation: display,
      reportingLocationKey: display
        ? display.normalize('NFKC').toLocaleLowerCase('en-US')
        : null,
    };
  }

  private toState(record: CoverageRequirementRecord): CoverageRequirementState {
    return {
      departmentId: record.departmentId,
      shiftTemplateId: record.shiftTemplateId,
      dayOfWeek: record.dayOfWeek,
      requiredStaff: record.requiredStaff,
      reportingLocation: record.reportingLocation,
      reportingLocationKey: record.reportingLocationKey,
      effectiveFrom: record.effectiveFrom,
      effectiveUntil: record.effectiveUntil,
    };
  }

  private changesHistoricalDefinition(
    previous: CoverageRequirementState,
    next: CoverageRequirementState,
  ): boolean {
    return (
      previous.departmentId !== next.departmentId ||
      previous.shiftTemplateId !== next.shiftTemplateId ||
      previous.dayOfWeek !== next.dayOfWeek ||
      previous.requiredStaff !== next.requiredStaff ||
      previous.reportingLocationKey !== next.reportingLocationKey ||
      previous.effectiveFrom.getTime() !== next.effectiveFrom.getTime()
    );
  }

  private statesEqual(
    previous: CoverageRequirementState,
    next: CoverageRequirementState,
  ): boolean {
    return (
      !this.changesHistoricalDefinition(previous, next) &&
      (previous.effectiveUntil?.getTime() ?? null) ===
        (next.effectiveUntil?.getTime() ?? null)
    );
  }

  private auditState(state: CoverageRequirementState): Prisma.InputJsonValue {
    return {
      departmentId: state.departmentId,
      shiftTemplateId: state.shiftTemplateId,
      dayOfWeek: state.dayOfWeek,
      requiredStaff: state.requiredStaff,
      reportingLocation: state.reportingLocation,
      effectiveFrom: state.effectiveFrom.toISOString().slice(0, 10),
      effectiveUntil: state.effectiveUntil?.toISOString().slice(0, 10) ?? null,
    };
  }

  private presentRequirement(record: CoverageRequirementRecord) {
    return {
      id: record.id,
      department: {
        id: record.department.id,
        divisionId: record.department.divisionId,
        code: record.department.code,
        name: record.department.name,
        division: record.department.division,
      },
      shift: record.shift,
      dayOfWeek: record.dayOfWeek,
      requiredStaff: record.requiredStaff,
      reportingLocation: record.reportingLocation,
      effectiveFrom: record.effectiveFrom.toISOString().slice(0, 10),
      effectiveUntil: record.effectiveUntil?.toISOString().slice(0, 10) ?? null,
      createdBy: this.accountName(record.createdBy),
      updatedBy: this.accountName(record.updatedBy),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private accountName(account: {
    username: string | null;
    employee: { empId: string; empName: string } | null;
  }): string {
    if (account.employee) {
      return `${account.employee.empName} (${account.employee.empId})`;
    }
    return account.username ?? 'Authorized account';
  }
}
