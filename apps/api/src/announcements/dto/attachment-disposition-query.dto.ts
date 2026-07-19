import { IsIn, IsOptional } from 'class-validator';

export class AttachmentDispositionQueryDto {
  @IsOptional()
  @IsIn(['inline', 'download'])
  disposition: 'inline' | 'download' = 'inline';
}
