import { AccountRole, MessageRequestReason } from '../generated/prisma/client';

import { ConversationsService } from './conversations.service';

describe('P12-G generic message request OrgUnit scope', () => {
  const service = Object.create(
    ConversationsService.prototype,
  ) as ConversationsService;
  const reason = (
    viewer: unknown,
    target: unknown,
    officeHeads = new Set<string>(),
    placements = new Map<string, { officeId: string; orgUnitId: string }>(),
    related = new Set<string>(),
  ) =>
    (
      service as unknown as {
        getMessageRequestReason: (
          viewer: unknown,
          target: unknown,
          officeHeads: ReadonlySet<string>,
          orgScope: {
            primaryByEmployeeId: Map<
              string,
              { officeId: string; orgUnitId: string }
            >;
            relatedOrgUnitPairs: Set<string>;
          },
        ) => MessageRequestReason | null;
      }
    ).getMessageRequestReason(viewer, target, officeHeads, {
      primaryByEmployeeId: placements,
      relatedOrgUnitPairs: related,
    });

  const viewer = (
    employeeId: string | null,
    role: AccountRole = AccountRole.EMPLOYEE,
  ) => ({
    accountId: `${employeeId ?? 'system'}-account`,
    employeeId,
    role,
    divisionId: null,
    departmentId: null,
  });
  const target = (employeeId: string) => ({
    id: `${employeeId}-account`,
    role: AccountRole.EMPLOYEE,
    employee: { id: employeeId, divisionId: null, departmentId: null },
  });

  it('allows direct first contact inside the same OrgUnit', () => {
    const placements = new Map([
      ['employee-a', { officeId: 'office-1', orgUnitId: 'unit-1' }],
      ['employee-b', { officeId: 'office-1', orgUnitId: 'unit-1' }],
    ]);
    expect(
      reason(viewer('employee-a'), target('employee-b'), new Set(), placements),
    ).toBeNull();
  });

  it('allows direct first contact across an ancestor/descendant OrgUnit relationship', () => {
    const placements = new Map([
      ['employee-a', { officeId: 'office-1', orgUnitId: 'parent' }],
      ['employee-b', { officeId: 'office-1', orgUnitId: 'child' }],
    ]);
    expect(
      reason(
        viewer('employee-a'),
        target('employee-b'),
        new Set(),
        placements,
        new Set(['child:parent']),
      ),
    ).toBeNull();
  });

  it('uses one generic reason for sibling, cross-office, and unplaced participants', () => {
    const siblingPlacements = new Map([
      ['employee-a', { officeId: 'office-1', orgUnitId: 'unit-a' }],
      ['employee-b', { officeId: 'office-1', orgUnitId: 'unit-b' }],
    ]);
    expect(
      reason(
        viewer('employee-a'),
        target('employee-b'),
        new Set(),
        siblingPlacements,
      ),
    ).toBe(MessageRequestReason.OUTSIDE_ORG_SCOPE);

    const crossOffice = new Map([
      ['employee-a', { officeId: 'office-1', orgUnitId: 'unit-a' }],
      ['employee-b', { officeId: 'office-2', orgUnitId: 'unit-b' }],
    ]);
    expect(
      reason(
        viewer('employee-a'),
        target('employee-b'),
        new Set(),
        crossOffice,
      ),
    ).toBe(MessageRequestReason.OUTSIDE_ORG_SCOPE);
    expect(
      reason(viewer(null, AccountRole.SUPER_ADMIN), target('employee-b')),
    ).toBe(MessageRequestReason.OUTSIDE_ORG_SCOPE);
  });

  it('keeps Office Head as the only Office-level first-contact exception', () => {
    const placements = new Map([
      ['office-head', { officeId: 'office-1', orgUnitId: 'unit-a' }],
      ['employee-b', { officeId: 'office-1', orgUnitId: 'unit-b' }],
    ]);
    expect(
      reason(
        viewer('office-head'),
        target('employee-b'),
        new Set(['office-head']),
        placements,
      ),
    ).toBeNull();
    expect(
      reason(
        viewer('employee-b'),
        target('office-head'),
        new Set(['office-head']),
        placements,
      ),
    ).toBe(MessageRequestReason.PROTECTED_RECIPIENT);
  });
});
