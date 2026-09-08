import type { AuthenticatedUser } from '../auth/types/auth.types';
import { WorkRuntimeV3Service } from './work-runtime-v3.service';

const officeId = '11111111-1111-4111-8111-111111111111';
const workItemId = '22222222-2222-4222-8222-222222222222';

function createHarness() {
  const officeFindUnique = jest.fn();
  const workItemFindMany = jest.fn();
  const orgMembershipFindMany = jest.fn();
  const visibleOrgUnitIds = jest.fn();

  const prisma = {
    office: { findUnique: officeFindUnique },
    workItem: { findMany: workItemFindMany },
    orgMembership: { findMany: orgMembershipFindMany },
  };
  const authorization = { visibleOrgUnitIds };

  type ServiceArgs = ConstructorParameters<typeof WorkRuntimeV3Service>;
  const service = new WorkRuntimeV3Service(
    prisma as unknown as ServiceArgs[0],
    authorization as unknown as ServiceArgs[1],
    {} as ServiceArgs[2],
    {} as ServiceArgs[3],
  );

  return {
    service,
    officeFindUnique,
    workItemFindMany,
    orgMembershipFindMany,
    visibleOrgUnitIds,
  };
}

describe('WorkRuntimeV3Service overview read contract', () => {
  it('gives Super Admin office-wide read-only oversight without operational membership filtering', async () => {
    const harness = createHarness();
    const superAdmin = {
      accountId: '33333333-3333-4333-8333-333333333333',
      role: 'SUPER_ADMIN',
    } as unknown as AuthenticatedUser;

    harness.officeFindUnique.mockResolvedValue({
      id: officeId,
      code: 'PATAN',
      name: 'Patan Office',
      isActive: true,
    });
    harness.workItemFindMany.mockResolvedValue([{ id: workItemId }]);

    const result = await harness.service.listWork(superAdmin, officeId, 25);

    expect(result.office).toEqual(
      expect.objectContaining({ id: officeId, isActive: true }),
    );
    expect(result.data).toEqual([{ id: workItemId }]);
    expect(harness.visibleOrgUnitIds).not.toHaveBeenCalled();
    expect(harness.orgMembershipFindMany).not.toHaveBeenCalled();

    const query = harness.workItemFindMany.mock.calls[0]?.[0] as {
      take: number;
      where: Record<string, unknown>;
    };
    expect(query.take).toBe(25);
    expect(query.where).toEqual(
      expect.objectContaining({
        officeId,
        runtimeStatus: { not: null },
        workTypeVersionId: { not: null },
        primaryOwnerOrgUnitId: { not: null },
      }),
    );
    expect(query.where).not.toHaveProperty('OR');
  });

  it('limits operational users to their authorized, created, participant, or assignment visibility', async () => {
    const harness = createHarness();
    const member = {
      accountId: '44444444-4444-4444-8444-444444444444',
      role: 'EMPLOYEE',
    } as unknown as AuthenticatedUser;

    harness.officeFindUnique.mockResolvedValue({
      id: officeId,
      code: 'PATAN',
      name: 'Patan Office',
      isActive: true,
    });
    harness.visibleOrgUnitIds.mockResolvedValue([
      '55555555-5555-4555-8555-555555555555',
    ]);
    harness.orgMembershipFindMany.mockResolvedValue([
      { orgUnitId: '66666666-6666-4666-8666-666666666666' },
    ]);
    harness.workItemFindMany.mockResolvedValue([]);

    await harness.service.listWork(member, officeId, 500);

    expect(harness.visibleOrgUnitIds).toHaveBeenCalledWith(
      member,
      expect.anything(),
      officeId,
    );
    expect(harness.orgMembershipFindMany).toHaveBeenCalled();

    const query = harness.workItemFindMany.mock.calls[0]?.[0] as {
      take: number;
      where: { officeId: string; OR?: unknown[] };
    };
    expect(query.take).toBe(100);
    expect(query.where.officeId).toBe(officeId);
    expect(query.where.OR).toEqual(
      expect.arrayContaining([{ createdByAccountId: member.accountId }]),
    );

    const serializedVisibility = JSON.stringify(query.where.OR);
    expect(serializedVisibility).toContain(
      '55555555-5555-4555-8555-555555555555',
    );
    expect(serializedVisibility).toContain(
      '66666666-6666-4666-8666-666666666666',
    );
  });
});
