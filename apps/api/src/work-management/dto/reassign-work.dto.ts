import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ReassignWorkDto {
  @IsUUID('4')
  primaryAssigneeAccountId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
