import { validateSync } from 'class-validator';

import { CompletePasswordResetDto } from './complete-password-reset.dto';
import { RequestPasswordResetDto } from './request-password-reset.dto';
import { VerifyPasswordResetOtpDto } from './verify-password-reset-otp.dto';

describe('password recovery DTOs', () => {
  it('accepts a valid official email request', () => {
    const dto = Object.assign(new RequestPasswordResetDto(), {
      officialEmail: 'employee@example.test',
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects malformed recovery codes', () => {
    const dto = Object.assign(new VerifyPasswordResetOtpDto(), {
      officialEmail: 'employee@example.test',
      otp: '12AB',
    });

    expect(
      validateSync(dto).some((error) => error.property === 'otp'),
    ).toBe(true);
  });

  it('applies the canonical password policy to reset completion', () => {
    const dto = Object.assign(new CompletePasswordResetDto(), {
      resetToken: 't'.repeat(43),
      newPassword: 'weak-password',
      confirmPassword: 'weak-password',
    });

    expect(
      validateSync(dto).some((error) => error.property === 'newPassword'),
    ).toBe(true);
  });
});
