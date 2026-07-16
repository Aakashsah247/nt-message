import { validateSync } from 'class-validator';

import { CreateAccountRequestDto } from './create-account-request.dto';
import { ResubmitAccountRequestDto } from './resubmit-account-request.dto';

function buildCreateDto(
  phoneNumber: string,
  officialEmail = 'aakashSAH123@gmail.com',
): CreateAccountRequestDto {
  return Object.assign(new CreateAccountRequestDto(), {
    empId: 'NTC-1001',
    empName: 'Aakash Sah',
    phoneNumber,
    officialEmail,
  });
}

describe('account request identity DTO validation', () => {
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

  it('accepts a valid mixed-case email address', () => {
    expect(
      validateSync(buildCreateDto('9801234567', 'AakashSAH123@GMAIL.COM')),
    ).toHaveLength(0);
  });

  it('rejects an invalid email address', () => {
    const errors = validateSync(
      buildCreateDto('9801234567', 'not-an-email'),
    );

    expect(errors.some((error) => error.property === 'officialEmail')).toBe(
      true,
    );
  });

  it('keeps every resubmission field optional', () => {
    expect(validateSync(new ResubmitAccountRequestDto())).toHaveLength(0);
  });
});
