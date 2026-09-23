import { BadRequestException } from '@nestjs/common';

import { WorkFinalClosureMode } from '../generated/prisma/enums';

export enum WorkTypeTemplate {
  STANDARD = 'STANDARD',
  TEAM_SALES = 'TEAM_SALES',
  ADMINISTRATIVE = 'ADMINISTRATIVE',
}

export interface FixedWorkTypeTemplateDefinition {
  template: WorkTypeTemplate;
  label: string;
  description: string;
  teamRequired: boolean;
  allowsIndividualAssignment: boolean;
  requiresSalesMember: boolean;
  finalClosureMode: WorkFinalClosureMode;
}

export const FIXED_WORK_TYPE_TEMPLATES: Record<
  WorkTypeTemplate,
  FixedWorkTypeTemplateDefinition
> = {
  [WorkTypeTemplate.STANDARD]: {
    template: WorkTypeTemplate.STANDARD,
    label: 'Standard',
    description:
      'Main Team execution, completion, Responsible Reviewer and closure.',
    teamRequired: true,
    allowsIndividualAssignment: false,
    requiresSalesMember: false,
    finalClosureMode: WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
  },
  [WorkTypeTemplate.TEAM_SALES]: {
    template: WorkTypeTemplate.TEAM_SALES,
    label: 'Team + Sales',
    description:
      'Main Team execution plus required Sales coordination before completion.',
    teamRequired: true,
    allowsIndividualAssignment: false,
    requiresSalesMember: true,
    finalClosureMode: WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
  },
  [WorkTypeTemplate.ADMINISTRATIVE]: {
    template: WorkTypeTemplate.ADMINISTRATIVE,
    label: 'Administrative',
    description:
      'Team or individual execution, completion, Responsible Reviewer and closure.',
    teamRequired: false,
    allowsIndividualAssignment: true,
    requiresSalesMember: false,
    finalClosureMode: WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
  },
};

export function isWorkTypeTemplate(value: unknown): value is WorkTypeTemplate {
  return (
    typeof value === 'string' &&
    Object.values(WorkTypeTemplate).includes(value as WorkTypeTemplate)
  );
}

export function assertWorkTypeTemplate(value: unknown): WorkTypeTemplate {
  if (!isWorkTypeTemplate(value)) {
    throw new BadRequestException(
      'Work Type template must be Standard, Team + Sales, or Administrative.',
    );
  }
  return value;
}
