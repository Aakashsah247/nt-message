import { validateSync } from 'class-validator';

import { CorrectEmployeeIdentityDto } from './correct-employee-identity.dto';
import { UpdateEmployeeDto } from './update-employee.dto';

describe('employee identity DTO validation', () => {
  it('keeps every employee update field optional', () => {
    expect(validateSync(new UpdateEmployeeDto())).toHaveLength(0);
  });

  it('requires a reason for protected identity correction', () => {
    const dto = Object.assign(new CorrectEmployeeIdentityDto(), {
      officialEmail: 'corrected@ntc.net.np',
    });

    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });

  it('accepts a protected identity correction without organization fields', () => {
    const dto = Object.assign(new CorrectEmployeeIdentityDto(), {
      empId: 'NTC-2001',
      empName: 'Corrected Name',
      phoneNumber: '9801234567',
      officialEmail: 'corrected@ntc.net.np',
      reason: 'Correct official employee record',
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect('divisionId' in dto).toBe(false);
    expect('departmentId' in dto).toBe(false);
  });
});
