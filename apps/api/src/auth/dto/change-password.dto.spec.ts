import { validateSync } from 'class-validator';

import { ChangePasswordDto } from './change-password.dto';

function buildDto(): ChangePasswordDto {
  return Object.assign(new ChangePasswordDto(), {
    currentPassword: 'CurrentPassword#42',
    newPassword: 'ReplacementPassword#43',
    confirmPassword: 'ReplacementPassword#43',
  });
}

describe('ChangePasswordDto', () => {
  it('accepts a complete password-change request', () => {
    expect(validateSync(buildDto())).toHaveLength(0);
  });

  it('requires the current password', () => {
    const dto = Object.assign(buildDto(), {
      currentPassword: '',
    });

    expect(
      validateSync(dto).some(
        (error) => error.property === 'currentPassword',
      ),
    ).toBe(true);
  });

  it.each([
    'short#1A',
    'alllowercase#123',
    'ALLUPPERCASE#123',
    'NoNumber#Password',
    'NoSpecial123Password',
  ])('rejects the invalid new password %s', (newPassword: string) => {
    const dto = Object.assign(buildDto(), {
      newPassword,
    });

    expect(
      validateSync(dto).some(
        (error) => error.property === 'newPassword',
      ),
    ).toBe(true);
  });

  it('applies the same length boundary to confirmation', () => {
    const dto = Object.assign(buildDto(), {
      confirmPassword: 'too-short',
    });

    expect(
      validateSync(dto).some(
        (error) => error.property === 'confirmPassword',
      ),
    ).toBe(true);
  });
});
