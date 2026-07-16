import { validateSync } from 'class-validator';

import { RequestActivationOtpDto } from './request-activation-otp.dto';
import { VerifyActivationOtpDto } from './verify-activation-otp.dto';

const divisionId = '11111111-1111-4111-8111-111111111111';
const departmentId = '22222222-2222-4222-8222-222222222222';

function buildRequestDto(
  department: string | null = departmentId,
): RequestActivationOtpDto {
  return Object.assign(new RequestActivationOtpDto(), {
    empName: 'Aakash Sah',
    empId: 'NTC-1001',
    phoneNumber: '+9779801234567',
    officialEmail: 'Aakash.Sah@ntc.net.np',
    divisionId,
    departmentId: department,
  });
}

describe('activation identity DTO validation', () => {
  it('accepts a division and department assignment', () => {
    expect(validateSync(buildRequestDto())).toHaveLength(0);
  });

  it('accepts a division-level assignment without a department', () => {
    expect(validateSync(buildRequestDto(null))).toHaveLength(0);
  });

  it('requires a valid division UUID', () => {
    const dto = Object.assign(buildRequestDto(), {
      divisionId: 'not-a-uuid',
    });

    expect(
      validateSync(dto).some((error) => error.property === 'divisionId'),
    ).toBe(true);
  });

  it('rejects an invalid department UUID when one is supplied', () => {
    const dto = Object.assign(buildRequestDto(), {
      departmentId: 'not-a-uuid',
    });

    expect(
      validateSync(dto).some((error) => error.property === 'departmentId'),
    ).toBe(true);
  });

  it('applies the same organization validation when verifying OTP', () => {
    const dto = Object.assign(new VerifyActivationOtpDto(), {
      ...buildRequestDto(null),
      otp: '123456',
    });

    expect(validateSync(dto)).toHaveLength(0);
  });
});
