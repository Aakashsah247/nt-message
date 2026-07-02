import { IsString, MaxLength, MinLength } from 'class-validator';

export class CloseAccountRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
