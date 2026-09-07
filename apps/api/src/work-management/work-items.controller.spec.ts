import { ConflictException } from '@nestjs/common';

import { WorkItemsController } from './work-items.controller';

describe('WorkItemsController WM-V2 write cutover', () => {
  const controller = new WorkItemsController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('rejects new WM-V2 Work creation after the V3 cutover', () => {
    expect(() => controller.create()).toThrow(ConflictException);
    expect(() => controller.create()).toThrow(
      'WM-V2 creation is closed after the Work Runtime V3 cutover.',
    );
  });
});
