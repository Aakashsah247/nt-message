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
  DutyCoverageRequirementAction,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { CreateDutyCoverageRequirementDto } from './dto/create-duty-coverage-requirement.dto';
import { ListDutyCoverageRequirementsQueryDto } from './dto/list-duty-coverage-requirements-query.dto';
import { UpdateDutyCoverageRequirementDto } from './dto/update-duty-coverage-requirement.dto';
import { DutyAuthorizationService } from './duty-authorization.service';

const KATHMANDU_OFFSET_MS = 5.75 * 60 * 60 * 1000;
const FAR_FUTURE_DATE = new Date('9999-12-31T00:00:00.000Z');

const coverageRequirementSelect = {
  id: true,
  officeId: true,
  orgUnitId: true,
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
  office: { select: { id: true, code: true, name: true } },
  orgUnit: {
    select: {
      id: true,
      officeId: true,
      code: true,
      name: true,
      isActive: true,
      parentOrgUnitId: true,
      orgUnitType: { select: { code: true, name: true, isTeam: true } },
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
      officeId: true,
      orgUnitId: true,
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
  officeId: string;
  orgUnitId: string;
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
    private readonly dutyAuthorization: DutyAuthorizationService,
    private readonly organizationAuthorization: OrganizationAuthorizationService,
  ) {}

  async listRequirements(
    user: AuthenticatedUser,
    query: ListDutyCoverageRequirementsQueryDto,
  ): Promise<unknown> {
    const range = this.resolveOptionalRange(query.from, query.to);
    const visibleWhere = await this.buildVisibleWhere(user);

    if (query.orgUnitId) {
      await this.assertVisibleOrgUnit(user, query.orgUnitId);
    }

    const records = await this.prisma.dutyCoverageRequirement.findMany({
      where: {
        AND: [
          visibleWhere,
          ...(query.orgUnitId ? [{ orgUnitId: query.orgUnitId }] : []),
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
        { orgUnit: { name: 'asc' } },
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
    const scope = await this.resolveManagedScope(
      user,
      dto.orgUnitId,
      true,
    );
    await this.resolveShiftForOrgUnit(
      dto.shiftTemplateId,
      scope.officeId,
      scope.orgUnitId,
      true,
    );

    const state: CoverageRequirementState = {
      officeId: scope.officeId,
      orgUnitId: scope.orgUnitId,
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
          createdByAccountId: user.accountId,
          updatedByAccountId: user.accountId,
        },
        select: coverageRequirementSelect,
      });

      await transaction.dutyCoverageRequirementActivity.create({
        data: {
          requirementId: requirement.id,
          actorAccountId: user.accountId,
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
    const existing = await this.findVisibleRequirement(user, requirementId);
    if (!existing.officeId || !existing.orgUnitId) {
      throw new ConflictException(
        'This historical coverage requirement has not been reconciled to Office/OrgUnit scope and cannot be changed.',
      );
    }
    await this.organizationAuthorization.assertCan(
      user,
      CAPABILITIES.DUTY_MANAGE,
      existing.officeId,
      existing.orgUnitId,
    );

    const previous = this.toState(existing);
    const today = this.currentKathmanduDate();
    const hasStarted = existing.effectiveFrom <= today;

    if (existing.effectiveUntil && existing.effectiveUntil < today) {
      throw new BadRequestException(
        'Historical coverage requirements cannot be changed.',
      );
    }

    const scope = await this.resolveManagedScope(
      user,
      dto.orgUnitId ?? existing.orgUnitId,
      !hasStarted,
    );
    const nextShiftTemplateId = dto.shiftTemplateId ?? existing.shiftTemplateId;
    await this.resolveShiftForOrgUnit(
      nextShiftTemplateId,
      scope.officeId,
      scope.orgUnitId,
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
      officeId: scope.officeId,
      orgUnitId: scope.orgUnitId,
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
          updatedByAccountId: user.accountId,
        },
        select: coverageRequirementSelect,
      });

      await transaction.dutyCoverageRequirementActivity.create({
        data: {
          requirementId,
          actorAccountId: user.accountId,
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
    const requirement = await this.findVisibleRequirement(user, requirementId);
    const activities = await this.prisma.dutyCoverageRequirementActivity.findMany({
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

  private async buildVisibleWhere(
    user: AuthenticatedUser,
  ): Promise<Prisma.DutyCoverageRequirementWhereInput> {
    const context = await this.dutyAuthorization.getContext(user);
    if (context.readOnlyOversight) return {};
    if (!context.officeId || !context.canView) {
      return { id: '__no_duty_coverage_scope__' };
    }

    const orgUnitIds = new Set(
      await this.organizationAuthorization.visibleOrgUnitIds(
        user,
        CAPABILITIES.DUTY_VIEW,
        context.officeId,
      ),
    );
    if (context.operationalTeamLeadIds.length) {
      const teams = await this.prisma.operationalTeam.findMany({
        where: {
          id: { in: context.operationalTeamLeadIds },
          isActive: true,
          archivedAt: null,
          orgUnit: { is: { officeId: context.officeId, isActive: true } },
        },
        select: { orgUnitId: true },
      });
      for (const team of teams) orgUnitIds.add(team.orgUnitId);
    }

    return orgUnitIds.size
      ? { officeId: context.officeId, orgUnitId: { in: [...orgUnitIds] } }
      : { id: '__no_duty_coverage_scope__' };
  }

  private async assertVisibleOrgUnit(
    user: AuthenticatedUser,
    orgUnitId: string,
  ): Promise<void> {
    const context = await this.dutyAuthorization.getContext(user);
    if (context.readOnlyOversight) return;
    if (!context.officeId) {
      throw new ForbiddenException('The selected OrgUnit is outside your Duty visibility scope.');
    }

    const visibleOrgUnitIds = new Set(
      await this.organizationAuthorization.visibleOrgUnitIds(
        user,
        CAPABILITIES.DUTY_VIEW,
        context.officeId,
      ),
    );
    if (context.operationalTeamLeadIds.length) {
      const team = await this.prisma.operationalTeam.findFirst({
        where: {
          id: { in: context.operationalTeamLeadIds },
          orgUnitId,
          isActive: true,
          archivedAt: null,
          orgUnit: { is: { officeId: context.officeId, isActive: true } },
        },
        select: { id: true },
      });
      if (team) visibleOrgUnitIds.add(orgUnitId);
    }
    if (!visibleOrgUnitIds.has(orgUnitId)) {
      throw new ForbiddenException('The selected OrgUnit is outside your Duty visibility scope.');
    }
  }

  private async resolveManagedScope(
    user: AuthenticatedUser,
    requestedOrgUnitId: string | undefined,
    requireActive: boolean,
  ): Promise<{
    officeId: string;
    orgUnitId: string;
  }> {
    const context = await this.dutyAuthorization.assertCanUseManagement(
      user,
      CAPABILITIES.DUTY_MANAGE,
    );
    if (!context.officeId) {
      throw new ForbiddenException('Duty coverage requires an active Office scope.');
    }
    if (!requestedOrgUnitId) {
      throw new BadRequestException('Select an OrgUnit for this coverage requirement.');
    }

    const orgUnit = await this.prisma.orgUnit.findFirst({
      where: {
        id: requestedOrgUnitId,
        officeId: context.officeId,
        ...(requireActive ? { isActive: true } : {}),
      },
      select: { id: true, officeId: true, isActive: true },
    });
    if (!orgUnit) {
      throw new NotFoundException('The selected OrgUnit was not found in this Office.');
    }
    if (requireActive && !orgUnit.isActive) {
      throw new BadRequestException(
        'Coverage requirements can be managed only for an active OrgUnit.',
      );
    }

    await this.organizationAuthorization.assertCan(
      user,
      CAPABILITIES.DUTY_MANAGE,
      orgUnit.officeId,
      orgUnit.id,
    );

    return { officeId: orgUnit.officeId, orgUnitId: orgUnit.id };
  }

  private async resolveShiftForOrgUnit(
    shiftTemplateId: string,
    officeId: string,
    orgUnitId: string,
    requireActive: boolean,
  ): Promise<void> {
    const shift = await this.prisma.dutyShiftTemplate.findUnique({
      where: { id: shiftTemplateId },
      select: {
        id: true,
        isActive: true,
        officeId: true,
        orgUnitId: true,
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
    if (!shift.officeId) {
      throw new ConflictException(
        'This historical shift template has not been reconciled to Office/OrgUnit scope and cannot receive new coverage requirements.',
      );
    }
    if (shift.officeId !== officeId) {
      throw new ForbiddenException(
        'The selected shift template belongs to another Office.',
      );
    }
    if (!shift.orgUnitId) return;

    const insideScope = await this.prisma.orgUnitClosure.findFirst({
      where: {
        ancestorOrgUnitId: shift.orgUnitId,
        descendantOrgUnitId: orgUnitId,
      },
      select: { ancestorOrgUnitId: true },
    });
    if (!insideScope) {
      throw new ForbiddenException(
        'The selected shift template is outside this OrgUnit scope.',
      );
    }
  }

  private async findVisibleRequirement(
    user: AuthenticatedUser,
    requirementId: string,
  ): Promise<CoverageRequirementRecord> {
    const visibleWhere = await this.buildVisibleWhere(user);
    const requirement = await this.prisma.dutyCoverageRequirement.findFirst({
      where: { AND: [{ id: requirementId }, visibleWhere] },
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
            officeId: state.officeId,
            orgUnitId: state.orgUnitId,
            shiftTemplateId: state.shiftTemplateId,
            dayOfWeek: state.dayOfWeek,
            ...(excludedRequirementId
              ? { id: { not: excludedRequirementId } }
              : {}),
            effectiveFrom: { lte: state.effectiveUntil ?? FAR_FUTURE_DATE },
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
        'An overlapping coverage requirement already exists for this OrgUnit, shift, weekday and location scope.',
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
    if (!record.officeId || !record.orgUnitId) {
      throw new ConflictException(
        'This coverage requirement does not have reconciled Office/OrgUnit scope.',
      );
    }
    return {
      officeId: record.officeId,
      orgUnitId: record.orgUnitId,
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
      previous.officeId !== next.officeId ||
      previous.orgUnitId !== next.orgUnitId ||
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
      officeId: state.officeId,
      orgUnitId: state.orgUnitId,
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
      office: record.office,
      orgUnit: record.orgUnit,
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
    return account.employee?.empName ?? account.username ?? 'Unknown account';
  }
}
