import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
export class ReassignWorkDto {
  @IsOptional() @IsUUID('4') operationalTeamId?: string;
  @IsOptional() @IsUUID('4') assigneeAccountId?: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
