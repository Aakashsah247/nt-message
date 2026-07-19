// class-transformer decorators read reflection metadata while DTO modules load.
import 'reflect-metadata';

import { validateSync } from 'class-validator';

import {
  AnnouncementAudienceType,
  AnnouncementPriority,
} from '../../generated/prisma/enums';
import { CreateAnnouncementDto } from './create-announcement.dto';
import { ListAnnouncementsQueryDto } from './list-announcements-query.dto';
import { UpdateAnnouncementDto } from './update-announcement.dto';

function validCreateDto(): CreateAnnouncementDto {
  return Object.assign(new CreateAnnouncementDto(), {
    audienceType: AnnouncementAudienceType.OFFICIAL_GROUP,
    officialConversationId: '11111111-1111-4111-8111-111111111111',
    title: 'Network maintenance',
    body: 'Planned maintenance begins at 10:00 PM.',
    priority: AnnouncementPriority.IMPORTANT,
    requiresAcknowledgement: true,
    allowAttachmentDownload: false,
    isPinned: true,
    scheduledAt: '2026-07-20T14:15:00.000Z',
    expiresAt: '2026-07-22T14:15:00.000Z',
  });
}

describe('announcement DTO validation', () => {
  it('accepts a complete professional announcement draft', () => {
    expect(validateSync(validCreateDto())).toHaveLength(0);
  });

  it('rejects unknown audience and priority values', () => {
    const dto = Object.assign(validCreateDto(), {
      audienceType: 'UNKNOWN',
      priority: 'CRITICAL',
    });

    const errors = validateSync(dto);
    expect(errors.some((error) => error.property === 'audienceType')).toBe(true);
    expect(errors.some((error) => error.property === 'priority')).toBe(true);
  });

  it('allows a partial update without weakening field validation', () => {
    const dto = Object.assign(new UpdateAnnouncementDto(), {
      title: 'Updated maintenance notice',
      requiresAcknowledgement: false,
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts an exact official-group list filter and rejects malformed IDs', () => {
    const valid = Object.assign(new ListAnnouncementsQueryDto(), {
      officialConversationId: '11111111-1111-4111-8111-111111111111',
    });
    const invalid = Object.assign(new ListAnnouncementsQueryDto(), {
      officialConversationId: 'not-a-conversation-id',
    });

    expect(validateSync(valid)).toHaveLength(0);
    expect(
      validateSync(invalid).some(
        (error) => error.property === 'officialConversationId',
      ),
    ).toBe(true);
  });

  it('caps list pagination and validates filters', () => {
    const dto = Object.assign(new ListAnnouncementsQueryDto(), {
      filter: 'INVALID',
      limit: 101,
    });

    const errors = validateSync(dto);
    expect(errors.some((error) => error.property === 'filter')).toBe(true);
    expect(errors.some((error) => error.property === 'limit')).toBe(true);
  });
});
