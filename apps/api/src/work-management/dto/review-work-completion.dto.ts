import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReviewWorkCompletionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(1500)
  note!: string;
}
