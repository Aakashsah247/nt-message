import { validateSync } from 'class-validator';

import { RequestActivationOtpDto } from './request-activation-otp.dto';
import { VerifyActivationOtpDto } from './verify-activation-otp.dto';

function buildRequestDto(): RequestActivationOtpDto {
  return Object.assign(new RequestActivationOtpDto(), {
    empName: 'Aakash Sah',
    empId: 'NTC-1001',
    phoneNumber: '+9779801234567',
    officialEmail: 'Aakash.Sah@ntc.net.np',
  });
}

describe('activation identity DTO validation', () => {
  it('accepts canonical V3 identity without legacy hierarchy identifiers', () => {
    expect(validateSync(buildRequestDto())).toHaveLength(0);
  });

  it('does not expose legacy Division or Department fields', () => {
    const dto = buildRequestDto() as RequestActivationOtpDto &
      Record<string, unknown>;

    expect('divisionId' in dto).toBe(false);
    expect('departmentId' in dto).toBe(false);
  });

  it('applies the same canonical identity validation when verifying OTP', () => {
    const dto = Object.assign(new VerifyActivationOtpDto(), {
      ...buildRequestDto(),
      otp: '123456',
    });

    expect(validateSync(dto)).toHaveLength(0);
  });
});
