import type { Prisma } from '../generated/prisma/client';

export const workAccountSummarySelect = {
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
    },
  },
} satisfies Prisma.AccountSelect;

// Historical WM-V2 help/retention reads keep only the relationships still needed
// by compatibility actions. Canonical Work list/detail reads are served by V3.
export const workCompatibilityDetailSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  dueAt: true,
  createdBy: { select: workAccountSummarySelect },
  salesMember: { select: workAccountSummarySelect },
  assignments: {
    where: { endedAt: null },
    orderBy: [{ assignmentRole: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      assignmentRole: true,
      acknowledgedAt: true,
      startedAt: true,
      createdAt: true,
      assignee: { select: workAccountSummarySelect },
      assignedBy: { select: workAccountSummarySelect },
    },
  },
} satisfies Prisma.WorkItemSelect;
