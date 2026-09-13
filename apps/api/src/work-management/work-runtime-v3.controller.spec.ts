import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { WorkRuntimeV3QueueQueryDto } from './dto/work-runtime-v3-stage.dto';
import { WorkRuntimeV3Controller } from './work-runtime-v3.controller';

const officeId = '11111111-1111-4111-8111-111111111111';
const workItemId = '22222222-2222-4222-8222-222222222222';

function createController(
  workRuntime: { listWork: jest.Mock },
  stageRuntime: { getWorkAvailableActions: jest.Mock },
): WorkRuntimeV3Controller {
  type ControllerArgs = ConstructorParameters<typeof WorkRuntimeV3Controller>;

  return new WorkRuntimeV3Controller(
    workRuntime as unknown as ControllerArgs[0],
    stageRuntime as unknown as ControllerArgs[1],
    {} as ControllerArgs[2],
    {} as ControllerArgs[3],
    {} as ControllerArgs[4],
  );
}

describe('WorkRuntimeV3Controller overview contract', () => {
  it('returns Super Admin oversight rows with backend-resolved empty mutation actions', async () => {
    const superAdmin = {
      accountId: '33333333-3333-4333-8333-333333333333',
      role: 'SUPER_ADMIN',
    } as unknown as AuthenticatedUser;
    const workRuntime = {
      listWork: jest.fn().mockResolvedValue({
        office: {
          id: officeId,
          code: 'PATAN',
          name: 'Patan Office',
          isActive: true,
        },
        data: [
          {
            id: workItemId,
            ticketNumber: 'NT-PATAN-TECH-2026-000001',
            title: 'Test Work',
          },
        ],
      }),
    };
    const stageRuntime = {
      getWorkAvailableActions: jest.fn().mockResolvedValue([]),
    };
    const controller = createController(workRuntime, stageRuntime);

    const result = await controller.listWork(superAdmin, officeId, {
      take: 50,
    } as WorkRuntimeV3QueueQueryDto);

    expect(workRuntime.listWork).toHaveBeenCalledWith(superAdmin, officeId, 50);
    expect(stageRuntime.getWorkAvailableActions).toHaveBeenCalledWith(
      superAdmin,
      officeId,
      workItemId,
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        id: workItemId,
        availableActions: [],
      }),
    ]);
  });
});
