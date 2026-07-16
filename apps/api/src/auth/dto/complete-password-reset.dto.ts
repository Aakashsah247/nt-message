import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import {
  PASSWORD_COMPLEXITY_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from '../../common/security/password-policy';

export class CompletePasswordResetDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  resetToken!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_COMPLEXITY_PATTERN, {
    message: PASSWORD_REQUIREMENTS_MESSAGE,
  })
  newPassword!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  confirmPassword!: string;
}
