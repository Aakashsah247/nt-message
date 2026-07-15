import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import {
  AccountRole,
  ManagementPositionType,
} from '../generated/prisma/client';

import type { Prisma } from '../generated/prisma/client';

interface ResolveManagementPositionInput {
  requestedRole: AccountRole;
  divisionId: string;
  departmentId: string | null;

  suppliedManagementPositionId?: string | null;

  allowEmployeeId?: string | null;
}

const positionSelect = {
  id: true,
  positionType: true,
  divisionId: true,
  departmentId: true,
  isActive: true,

  reservedByAccountRequestId: true,

  assignments: {
    where: {
      endedAt: null,
    },

    take: 1,

    select: {
      id: true,
      employeeId: true,
    },
  },
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function resolveOrCreateVacantManagementPosition(
  transaction: Prisma.TransactionClient,

  input: ResolveManagementPositionInput,
) {
  const requiredPositionType =
    input.requestedRole === AccountRole.SENIOR_MANAGEMENT
      ? ManagementPositionType.SENIOR_MANAGEMENT
      : input.requestedRole === AccountRole.TEAM_MANAGER
        ? ManagementPositionType.TEAM_MANAGER
        : null;

  if (!requiredPositionType) {
    throw new BadRequestException(
      'A normal employee account must not reference a management position.',
    );
  }

  if (
    requiredPositionType === ManagementPositionType.TEAM_MANAGER &&
    !input.departmentId
  ) {
    throw new BadRequestException(
      'A Team Manager account requires a department.',
    );
  }

  const scopedDepartmentId =
    requiredPositionType === ManagementPositionType.SENIOR_MANAGEMENT
      ? null
      : input.departmentId;

  let position = input.suppliedManagementPositionId
    ? await transaction.managementPosition.findUnique({
        where: {
          id: input.suppliedManagementPositionId,
        },

        select: positionSelect,
      })
    : await transaction.managementPosition.findFirst({
        where: {
          positionType: requiredPositionType,

          divisionId: input.divisionId,

          departmentId: scopedDepartmentId,
        },

        select: positionSelect,
      });

  if (!position && input.suppliedManagementPositionId) {
    throw new NotFoundException(
      'The selected management position was not found.',
    );
  }

  if (!position) {
    try {
      position = await transaction.managementPosition.create({
        data: {
          positionType: requiredPositionType,

          divisionId: input.divisionId,

          departmentId: scopedDepartmentId,

          isActive: true,
        },

        select: positionSelect,
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'The management position was created by another request. Please submit again.',
        );
      }

      throw error;
    }
  }

  if (position.positionType !== requiredPositionType) {
    throw new BadRequestException(
      'The selected management position does not match the requested role.',
    );
  }

  if (position.divisionId !== input.divisionId) {
    throw new BadRequestException(
      'The selected management position does not belong to the selected division.',
    );
  }

  if (position.departmentId !== scopedDepartmentId) {
    throw new BadRequestException(
      'The selected management position does not match the selected organization scope.',
    );
  }

  if (!position.isActive) {
    throw new ConflictException(
      'The management position for this organization scope is inactive.',
    );
  }

  if (position.reservedByAccountRequestId) {
    throw new ConflictException(
      'A management account is already approved and waiting for activation in this organization scope.',
    );
  }

  const activeAssignment = position.assignments[0] ?? null;

  if (
    activeAssignment &&
    activeAssignment.employeeId !== input.allowEmployeeId
  ) {
    throw new ConflictException(
      'An active management employee already exists in this organization scope.',
    );
  }

  return position;
}
