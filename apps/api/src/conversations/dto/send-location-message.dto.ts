import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SendLocationMessageDto {
  @IsUUID('4', {
    message: 'Client message ID must be a valid UUID.',
  })
  clientMessageId!: string;

  @IsNumber(
    {
      allowInfinity: false,
      allowNaN: false,
    },
    {
      message: 'Latitude must be a valid coordinate.',
    },
  )
  @Min(-90, {
    message: 'Latitude must be a valid coordinate.',
  })
  @Max(90, {
    message: 'Latitude must be a valid coordinate.',
  })
  latitude!: number;

  @IsNumber(
    {
      allowInfinity: false,
      allowNaN: false,
    },
    {
      message: 'Longitude must be a valid coordinate.',
    },
  )
  @Min(-180, {
    message: 'Longitude must be a valid coordinate.',
  })
  @Max(180, {
    message: 'Longitude must be a valid coordinate.',
  })
  longitude!: number;

  @IsOptional()
  @IsNumber(
    {
      allowInfinity: false,
      allowNaN: false,
    },
    {
      message: 'Accuracy must be a positive number.',
    },
  )
  @Min(0, {
    message: 'Accuracy must be a positive number.',
  })
  @Max(100000, {
    message: 'Accuracy must be a valid distance value.',
  })
  accuracyMeters?: number;

  @IsOptional()
  @IsNumber(
    {
      allowInfinity: false,
      allowNaN: false,
    },
    {
      message: 'Heading must be a valid degree value.',
    },
  )
  @Min(0, {
    message: 'Heading must be a valid degree value.',
  })
  @Max(360, {
    message: 'Heading must be a valid degree value.',
  })
  headingDegrees?: number;

  @IsOptional()
  @IsNumber(
    {
      allowInfinity: false,
      allowNaN: false,
    },
    {
      message: 'Speed must be a positive number.',
    },
  )
  @Min(0, {
    message: 'Speed must be a positive number.',
  })
  @Max(1000, {
    message: 'Speed must be a valid movement value.',
  })
  speedMetersPerSecond?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120, {
    message: 'Location label must be at most 120 characters.',
  })
  label?: string;

  @IsOptional()
  @IsBoolean()
  live?: boolean;

  @IsOptional()
  @IsIn([15, 60, 480], {
    message: 'Live location duration must be 15 minutes, 1 hour or 8 hours.',
  })
  liveDurationMinutes?: 15 | 60 | 480;
}