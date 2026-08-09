import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CoordinateWorkHelpDto {
  @IsUUID('4')
  helperAccountId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
