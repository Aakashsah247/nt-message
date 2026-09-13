import { WorkItemsController } from './work-items.controller';

describe('WorkItemsController WM-V2 write cutover', () => {
  const controller = new WorkItemsController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('does not expose the retired WM-V2 create mutation', () => {
    expect('create' in controller).toBe(false);
  });
});
