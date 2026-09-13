import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSync } from 'class-validator';

import { CreateAnnouncementDto } from '../announcements/dto/create-announcement.dto';
import { AnnouncementAudienceType } from '../generated/prisma/client';
import { CreateOfficialGroupConversationDto } from './dto/create-official-group-conversation.dto';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const schema = readFileSync(
  join(process.cwd(), 'prisma', 'schema.prisma'),
  'utf8',
);

const cutoverVerificationScript = readFileSync(
  join(process.cwd(), 'scripts', 'verify_communication_v3_cutover.js'),
  'utf8',
);

describe('P12-K communication historical compatibility and legacy-write cutover', () => {
  const officeId = '11111111-1111-4111-8111-111111111111';
  const orgUnitId = '22222222-2222-4222-8222-222222222222';

  it('accepts only Office/OrgUnit scope for new Official Group writes', () => {
    const native = Object.assign(new CreateOfficialGroupConversationDto(), {
      title: 'Access Network',
      scopeType: 'ORG_UNIT',
      officeId,
      orgUnitId,
      membershipMode: 'ENTIRE_SUBTREE',
    });
    expect(validateSync(native)).toHaveLength(0);

    for (const scopeType of ['ORGANIZATION', 'DIVISION', 'DEPARTMENT']) {
      const legacy = Object.assign(new CreateOfficialGroupConversationDto(), {
        title: 'Legacy group',
        scopeType,
      });
      expect(
        validateSync(legacy).some((error) => error.property === 'scopeType'),
      ).toBe(true);
    }
  });

  it('accepts only Office/OrgUnit/Official Group audiences for new Announcement writes', () => {
    const native = Object.assign(new CreateAnnouncementDto(), {
      audienceType: AnnouncementAudienceType.OFFICE,
      officeId,
      title: 'Office notice',
      body: 'Current Office announcement.',
    });
    expect(validateSync(native)).toHaveLength(0);

    for (const audienceType of ['ORGANIZATION', 'DIVISION', 'DEPARTMENT']) {
      const legacy = Object.assign(new CreateAnnouncementDto(), {
        audienceType,
        title: 'Legacy notice',
        body: 'Historical compatibility only.',
      });
      expect(
        validateSync(legacy).some((error) => error.property === 'audienceType'),
      ).toBe(true);
    }
  });

  it('reconciles native V3 bindings while reporting historical communication evidence', () => {
    expect(cutoverVerificationScript).toContain('invalid_native_office_groups');
    expect(cutoverVerificationScript).toContain(
      'invalid_native_orgunit_groups',
    );
    expect(cutoverVerificationScript).toContain(
      'invalid_native_office_announcements',
    );
    expect(cutoverVerificationScript).toContain(
      'invalid_native_orgunit_announcements',
    );
    expect(cutoverVerificationScript).toContain('legacy_group_message_count');
    expect(cutoverVerificationScript).toContain(
      'legacy_announcement_recipient_count',
    );
    expect(cutoverVerificationScript).toContain('CROSS_DIVISION');
    expect(cutoverVerificationScript).toContain('CROSS_DEPARTMENT');
    expect(cutoverVerificationScript).toContain('OUTSIDE_ORG_SCOPE');
  });

  it('locks the active schema to native V3 communication scope after Phase 13 cleanup', () => {
    expect(schema).toMatch(
      /enum OfficialGroupScopeType \{\s*OFFICE\s*ORG_UNIT\s*\}/,
    );
    expect(schema).toMatch(
      /enum AnnouncementAudienceType \{\s*OFFICIAL_GROUP\s*OFFICE\s*ORG_UNIT\s*\}/,
    );
    expect(schema).toMatch(
      /enum MessageRequestReason \{\s*PROTECTED_RECIPIENT\s*OUTSIDE_ORG_SCOPE\s*\}/,
    );

    expect(schema).not.toMatch(
      /enum OfficialGroupScopeType \{[^}]*\b(?:ORGANIZATION|DIVISION|DEPARTMENT)\b[^}]*\}/,
    );
    expect(schema).not.toMatch(
      /enum AnnouncementAudienceType \{[^}]*\b(?:ORGANIZATION|DIVISION|DEPARTMENT)\b[^}]*\}/,
    );
    expect(schema).not.toMatch(
      /enum MessageRequestReason \{[^}]*\b(?:CROSS_DIVISION|CROSS_DEPARTMENT)\b[^}]*\}/,
    );
    expect(schema).not.toContain('officialDivisionId');
    expect(schema).not.toContain('officialDepartmentId');
  });
});
