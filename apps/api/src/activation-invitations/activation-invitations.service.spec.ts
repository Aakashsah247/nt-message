import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountRequestLifecycleState,
  AccountRequestStatus,
  AccountRole,
  EmployeeStatus,
  OrgMembershipType,
} from '../generated/prisma/enums';
import { MailService } from '../mail/mail.service';

import { ActivationInvitationsService } from './activation-invitations.service';

// This suite tests pure cooldown calculations. Mocking the database provider keeps
// Jest isolated from the generated Prisma runtime, which is covered by API build
// and integration checks rather than by this focused unit test.
jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createService(
  prisma: PrismaService = {} as PrismaService,
): ActivationInvitationsService {
  const values: Record<string, string> = {
    WEB_ORIGIN: 'http://localhost:5173',
    ACTIVATION_INVITATION_TTL_HOURS: '72',
    OTP_RESEND_COOLDOWN_SECONDS: '60',
  };

  const configService = {
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  return new ActivationInvitationsService(
    prisma,
    {} as MailService,
    configService,
  );
}

describe('ActivationInvitationsService resend cooldown', () => {
  it('allows the first resend immediately', () => {
    const service = createService();

    expect(service.getResendCooldownRemainingSeconds(null)).toBe(0);
  });

  it('returns the remaining whole seconds during cooldown', () => {
    const service = createService();
    const attemptedAt = new Date('2026-07-16T10:00:00.000Z');
    const now = new Date('2026-07-16T10:00:30.200Z');

    expect(service.getResendCooldownRemainingSeconds(attemptedAt, now)).toBe(
      30,
    );
  });

  it('allows resend exactly when the cooldown expires', () => {
    const service = createService();
    const attemptedAt = new Date('2026-07-16T10:00:00.000Z');
    const now = new Date('2026-07-16T10:01:00.000Z');

    expect(service.getResendCooldownRemainingSeconds(attemptedAt, now)).toBe(0);
  });

  it('returns the next allowed resend time', () => {
    const service = createService();
    const attemptedAt = new Date('2026-07-16T10:00:00.000Z');

    expect(service.getResendAvailableAt(attemptedAt).toISOString()).toBe(
      '2026-07-16T10:01:00.000Z',
    );
  });
});

describe('ActivationInvitationsService V3 invitation scope', () => {
  function canonicalInvitation(orgUnitId = 'unit-a') {
    return {
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      invalidatedAt: null,
      request: {
        requestedRole: AccountRole.EMPLOYEE,
        status: AccountRequestStatus.APPROVED,
        lifecycleState: AccountRequestLifecycleState.PROVISIONED,
        employeeId: 'employee-a',
        officeId: 'office-a',
        intendedOrgUnitId: 'unit-a',
        divisionId: null,
        departmentId: null,
        managementPositionId: null,
        office: {
          name: 'Patan Telecom Office',
          isActive: true,
        },
        intendedOrgUnit: {
          name: 'Technical',
          officeId: 'office-a',
          isActive: true,
        },
        division: null,
        department: null,
      },
      employee: {
        id: 'employee-a',
        empName: 'Provisioned Employee',
        officialEmail: 'employee@ntc.net.np',
        status: EmployeeStatus.ACTIVE,
        isActivated: false,
        account: null,
        orgMemberships: [
          {
            officeId: 'office-a',
            orgUnitId,
            membershipType: OrgMembershipType.PRIMARY,
            endsAt: null,
          },
        ],
      },
    };
  }

  it('previews a V3 invitation from Office + current PRIMARY OrgMembership without legacy Division data', async () => {
    const prisma = {
      activationInvitation: {
        findUnique: jest.fn().mockResolvedValue(canonicalInvitation()),
      },
    } as unknown as PrismaService;
    const service = createService(prisma);

    await expect(service.getInvitationPreview('token')).resolves.toMatchObject({
      organization: {
        officeId: 'office-a',
        officeName: 'Patan Telecom Office',
        orgUnitId: 'unit-a',
        orgUnitName: 'Technical',
        divisionId: null,
        departmentId: null,
      },
      requestedRole: AccountRole.EMPLOYEE,
    });
  });

  it('rejects a V3 invitation after the employee PRIMARY placement no longer matches the request', async () => {
    const prisma = {
      activationInvitation: {
        findUnique: jest
          .fn()
          .mockResolvedValue(canonicalInvitation('different-unit')),
      },
    } as unknown as PrismaService;
    const service = createService(prisma);

    await expect(service.getInvitationPreview('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
