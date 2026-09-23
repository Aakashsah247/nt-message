import {
  WORK_FOUNDATION_COMPLETION_FIELD_CODES,
  WORK_SYSTEM_CONTROLLED_FIELD_CODES,
} from './work-foundation.constants';

describe('Work foundation field ownership', () => {
  it('keeps only platform completion controls and Sales note outside Work Type Information', () => {
    expect(WORK_FOUNDATION_COMPLETION_FIELD_CODES).toEqual([
      'COMPLETION_RESULT',
      'COMPLETION_SUMMARY',
      'MORE_WORK_REQUIRED',
    ]);
    expect(WORK_SYSTEM_CONTROLLED_FIELD_CODES).toEqual([
      'COMPLETION_RESULT',
      'COMPLETION_SUMMARY',
      'MORE_WORK_REQUIRED',
      'SALES_NOTE',
    ]);
    expect(WORK_SYSTEM_CONTROLLED_FIELD_CODES).not.toContain('CUSTOMER_ID');
    expect(WORK_SYSTEM_CONTROLLED_FIELD_CODES).not.toContain('RX_LEVEL_DBM');
  });
});
