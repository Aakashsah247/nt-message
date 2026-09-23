import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
export class CompleteSalesWorkDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  note?: string;
}
