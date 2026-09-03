import { ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import type { ActivationInvitationsService } from '../activation-invitations/activation-invitations.service';
import type { ConversationsService } from '../conversations/conversations.service';
import { EmployeesService } from './employees.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('EmployeesService legacy update boundary', () => {
  function createService(prisma: PrismaService) {
    return new EmployeesService(
      prisma,
      {} as ConversationsService,
      {} as ActivationInvitationsService,
    );
  }

  it('does not allow protected identity changes through the legacy generic update endpoint', async () => {
    const prisma = {
      employee: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;

    await expect(
      createService(prisma).updateEmployee('employee-1', {
        officialEmail: 'new@ntc.net.np',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
  });

  it('does not allow organization placement changes through the legacy generic update endpoint', async () => {
    const prisma = {
      employee: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;

    await expect(
      createService(prisma).updateEmployee('employee-1', {
        divisionId: '11111111-1111-4111-8111-111111111111',
        departmentId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
  });
});
