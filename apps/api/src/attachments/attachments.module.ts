import { Module } from '@nestjs/common';

import { AttachmentSecurityBackfillService } from './attachment-security-backfill.service';
import { AttachmentSecurityService } from './attachment-security.service';
import { AttachmentStorageService } from './attachment-storage.service';
import { AttachmentTempCleanupInterceptor } from './attachment-temp-cleanup.interceptor';

@Module({
  providers: [
    AttachmentStorageService,
    AttachmentSecurityService,
    AttachmentSecurityBackfillService,
    AttachmentTempCleanupInterceptor,
  ],
  exports: [
    AttachmentStorageService,
    AttachmentSecurityService,
    AttachmentTempCleanupInterceptor,
  ],
})
export class AttachmentsModule {}
