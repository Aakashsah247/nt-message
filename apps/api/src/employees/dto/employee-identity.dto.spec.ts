import { validateSync } from 'class-validator';

import { AccountRole } from '../../generated/prisma/enums';

import { CreateEmployeeDto } from './create-employee.dto';
import { UpdateEmployeeDto } from './update-employee.dto';

const DIVISION_ID = '11111111-1111-4111-8111-111111111111';

function buildCreateDto(
  phoneNumber: string,
  officialEmail = 'aakashSAH123@gmail.com',
): CreateEmployeeDto {
  return Object.assign(new CreateEmployeeDto(), {
    empId: 'NTC-1001',
    empName: 'Aakash Sah',
    phoneNumber,
    officialEmail,
    requestedRole: AccountRole.EMPLOYEE,
    divisionId: DIVISION_ID,
  });
}

describe('employee identity DTO validation', () => {
  it.each([
    '9801234567',
    '9779801234567',
    '+9779801234567',
  ])('accepts the approved Nepal phone format %s', (phoneNumber: string) => {
    expect(validateSync(buildCreateDto(phoneNumber))).toHaveLength(0);
  });

  it.each([
    '009779801234567',
    '+977 980-123-4567',
    '+977 (980) 123-4567',
  ])('rejects the unsupported Nepal phone format %s', (phoneNumber: string) => {
    const errors = validateSync(buildCreateDto(phoneNumber));

    expect(errors.some((error) => error.property === 'phoneNumber')).toBe(
      true,
    );
  });

  it('accepts a valid mixed-case official email', () => {
    expect(
      validateSync(buildCreateDto('9801234567', 'AakashSAH123@GMAIL.COM')),
    ).toHaveLength(0);
  });

  it('rejects invalid official email syntax', () => {
    const errors = validateSync(
      buildCreateDto('9801234567', 'not-an-email'),
    );

    expect(errors.some((error) => error.property === 'officialEmail')).toBe(
      true,
    );
  });

  it('keeps every employee update field optional', () => {
    expect(validateSync(new UpdateEmployeeDto())).toHaveLength(0);
  });
});
