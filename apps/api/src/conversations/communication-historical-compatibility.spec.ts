import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSync } from 'class-validator';

import { CreateAnnouncementDto } from '../announcements/dto/create-announcement.dto';
import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  AnnouncementAudienceType,
  OfficialGroupScopeType,
} from '../generated/prisma/client';
import { ConversationsService } from './conversations.service';
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
  const divisionId = '33333333-3333-4333-8333-333333333333';
  const accountId = '44444444-4444-4444-8444-444444444444';
  const employeeId = '55555555-5555-4555-8555-555555555555';

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

    for (const audienceType of [
      AnnouncementAudienceType.ORGANIZATION,
      AnnouncementAudienceType.DIVISION,
      AnnouncementAudienceType.DEPARTMENT,
    ]) {
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

  it('keeps inactive legacy Official Group metadata manageable through its V3 binding', async () => {
    const prisma = {
      division: {
        findUnique: jest.fn().mockResolvedValue({
          id: divisionId,
          code: 'OLD-TECH',
          name: 'Historical Technical Division',
          isActive: false,
        }),
      },
    } as unknown as PrismaService;
    const service = new ConversationsService(
      prisma,
      { emitConversationUpdated: jest.fn() } as never,
      {} as never,
    );

    jest
      .spyOn(
        service as unknown as {
          resolveLegacyOfficialGroupOfficeId: () => Promise<string>;
        },
        'resolveLegacyOfficialGroupOfficeId',
      )
      .mockResolvedValue(officeId);
    jest
      .spyOn(
        service as unknown as {
          resolveOfficialGroupOrgUnitId: () => Promise<string>;
        },
        'resolveOfficialGroupOrgUnitId',
      )
      .mockResolvedValue(orgUnitId);
    jest
      .spyOn(
        service as unknown as {
          canManageOfficialGroupScope: () => Promise<boolean>;
        },
        'canManageOfficialGroupScope',
      )
      .mockResolvedValue(true);

    const authorize = (
      service as unknown as {
        getAuthorizedOfficialGroupScope: (
          viewer: unknown,
          scopeType: OfficialGroupScopeType,
          legacyDivisionId?: string | null,
        ) => Promise<{ officeId: string; orgUnitId: string | null }>;
      }
    ).getAuthorizedOfficialGroupScope.bind(service);

    await expect(
      authorize(
        {
          accountId,
          employeeId,
          role: AccountRole.EMPLOYEE,
          divisionId: null,
          departmentId: null,
        },
        OfficialGroupScopeType.DIVISION,
        divisionId,
      ),
    ).resolves.toMatchObject({ officeId, orgUnitId });
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

  it('retains legacy communication fields and enum values until Phase 13 cleanup', () => {
    expect(schema).toMatch(
      /enum OfficialGroupScopeType \{[\s\S]*?ORGANIZATION[\s\S]*?DIVISION[\s\S]*?DEPARTMENT[\s\S]*?OFFICE[\s\S]*?ORG_UNIT[\s\S]*?\}/,
    );
    expect(schema).toMatch(
      /enum AnnouncementAudienceType \{[\s\S]*?ORGANIZATION[\s\S]*?DIVISION[\s\S]*?DEPARTMENT[\s\S]*?OFFICIAL_GROUP[\s\S]*?OFFICE[\s\S]*?ORG_UNIT[\s\S]*?\}/,
    );
    expect(schema).toMatch(
      /enum MessageRequestReason \{[\s\S]*?CROSS_DEPARTMENT[\s\S]*?CROSS_DIVISION[\s\S]*?OUTSIDE_ORG_SCOPE[\s\S]*?\}/,
    );
    expect(schema).toContain('officialDivisionId');
    expect(schema).toContain('officialDepartmentId');
    expect(schema).toContain('divisionId');
    expect(schema).toContain('departmentId');
  });
});
