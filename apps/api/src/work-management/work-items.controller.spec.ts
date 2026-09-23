import { WorkItemsController } from './work-items.controller';

describe('WorkItemsController classic Work write cutover', () => {
  const controller = new WorkItemsController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('exposes the restored classic Work create mutation', () => {
    expect('create' in controller).toBe(true);
  });
});
