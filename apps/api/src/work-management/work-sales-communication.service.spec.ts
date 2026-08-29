import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { AttachmentSecurityService } from '../attachments/attachment-security.service';
import type { AttachmentStorageService } from '../attachments/attachment-storage.service';
import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkAssignmentRole,
  WorkItemStatus,
  WorkSalesCoordinationStatus,
} from '../generated/prisma/enums';
import type { WorkNotificationsService } from './work-notifications.service';
import type { WorkScopeService } from './work-scope.service';
import { WorkSalesCommunicationService } from './work-sales-communication.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const employeeUser = {
  accountId: 'team-member',
  sessionId: 'session',
  username: 'team@ntc.test',
  role: AccountRole.EMPLOYEE,
};

const salesUser = {
  accountId: 'sales-member',
  sessionId: 'session',
  username: 'sales@ntc.test',
  role: AccountRole.EMPLOYEE,
};

function workItem(
  status: WorkSalesCoordinationStatus = WorkSalesCoordinationStatus.READY_FOR_SALES,
) {
  return {
    id: 'work-1',
    ticketNumber: 'NT-PAT-2026-000001',
    title: 'New installation',
    status: WorkItemStatus.IN_PROGRESS,
    assignedTeamId: 'team-1',
    salesMemberAccountId: 'sales-member',
    responsibleManagerAccountId: 'manager',
    salesCoordinationStatus: status,
    assignments: [
      {
        assigneeAccountId: 'team-member',
        assignmentRole: WorkAssignmentRole.PRIMARY,
        endedAt: null,
      },
    ],
  };
}

describe('WorkSalesCommunicationService WM-V2-4B1', () => {
  const prisma = {
    workItem: {
      findUnique: jest.fn(),
    },
    departmentTeamMember: {
      findFirst: jest.fn(),
    },
    workSalesMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    workSalesAttachment: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaService;
  const scope = {
    resolveActorContext: jest.fn(),
  } as unknown as WorkScopeService;
  const notifications = {
    publishWorkUpdate: jest.fn(),
  } as unknown as WorkNotificationsService;
  const storage = {
    writeUploadedFile: jest.fn(),
    deleteFile: jest.fn(),
    exists: jest.fn(),
    resolvePath: jest.fn(),
  } as unknown as AttachmentStorageService;
  const security = {
    scanValidatedUpload: jest.fn(),
    canAccessStoredAttachment: jest.fn(),
  } as unknown as AttachmentSecurityService;

  const service = new WorkSalesCommunicationService(
    prisma,
    scope,
    notifications,
    storage,
    security,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'team-member',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-1',
      departmentId: 'department-1',
    });
    jest.mocked(prisma.workItem.findUnique).mockResolvedValue(workItem() as never);
    jest.mocked(storage.deleteFile).mockResolvedValue(true);
    jest.mocked(security.scanValidatedUpload).mockResolvedValue('FORMAT_VALIDATED');
  });

  it('stores a field-team Sales message and secure file metadata without putting file bytes in PostgreSQL', async () => {
    const file = {
      originalname: 'customer.pdf',
      mimetype: 'application/pdf',
      size: 8,
      buffer: Buffer.from('%PDF-1.7'),
    };
    jest.mocked(storage.writeUploadedFile).mockResolvedValue();
    jest.mocked(prisma.workSalesMessage.create).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        ({
          id: data.id,
          workItemId: 'work-1',
          senderAccountId: 'team-member',
          text: 'Please process this customer.',
          createdAt: new Date(),
          sender: {
            id: 'team-member',
            username: 'team@ntc.test',
            role: AccountRole.EMPLOYEE,
            employee: { empName: 'Field Worker', designation: 'Technician' },
          },
          attachments: [
            {
              id: 'attachment-1',
              originalFileName: 'customer.pdf',
              mimeType: 'application/pdf',
              fileSizeBytes: 8,
              scanStatus: 'FORMAT_VALIDATED',
              createdAt: new Date(),
            },
          ],
        }) as never,
    );

    const result = await service.createMessage(
      employeeUser,
      'work-1',
      { text: 'Please process this customer.' },
      [file],
    );

    expect(security.scanValidatedUpload).toHaveBeenCalledWith(file);
    expect(storage.writeUploadedFile).toHaveBeenCalledWith(
      'work',
      expect.stringContaining('work-1/sales/'),
      file,
    );
    expect(prisma.workSalesMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workItemId: 'work-1',
          senderAccountId: 'team-member',
          attachments: expect.objectContaining({ create: expect.any(Array) }),
        }),
      }),
    );
    expect(result.message).toBe('Sent.');
  });

  it('lets the assigned Sales Member send a reply only after the work is sent to Sales', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'sales-member',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-1',
      departmentId: 'sales-department',
    });
    jest.mocked(prisma.workSalesMessage.create).mockResolvedValue({
      id: 'message-sales',
      workItemId: 'work-1',
      senderAccountId: 'sales-member',
      text: 'Billing is being processed.',
      createdAt: new Date(),
      sender: {
        id: 'sales-member',
        username: 'sales@ntc.test',
        role: AccountRole.EMPLOYEE,
        employee: { empName: 'Sales User', designation: 'Sales Officer' },
      },
      attachments: [],
    } as never);

    await service.createMessage(
      salesUser,
      'work-1',
      { text: 'Billing is being processed.' },
      [],
    );

    expect(notifications.publishWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SALES_MESSAGE_ADDED',
        notificationRecipientAccountIds: ['team-member'],
      }),
    );
  });

  it('hides prepared team files from Sales until Send to Sales is used', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'sales-member',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-1',
      departmentId: 'sales-department',
    });
    jest.mocked(prisma.workItem.findUnique).mockResolvedValue(
      workItem(WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS) as never,
    );

    await expect(service.listMessages(salesUser, 'work-1')).resolves.toEqual({
      messages: [],
    });
    expect(prisma.workSalesMessage.findMany).not.toHaveBeenCalled();
  });

  it('rejects a person who is not in the Primary Team, Sales or the responsible manager', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'outsider',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-1',
      departmentId: 'department-1',
    });
    jest.mocked(prisma.departmentTeamMember.findFirst).mockResolvedValue(null);

    await expect(service.listMessages(employeeUser, 'work-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('requires a message or file and blocks unsupported executable-style uploads', async () => {
    await expect(
      service.createMessage(employeeUser, 'work-1', {}, []),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createMessage(employeeUser, 'work-1', {}, [
        {
          originalname: 'program.exe',
          mimetype: 'application/octet-stream',
          size: 10,
          buffer: Buffer.from('not-allowed'),
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cleans up a stored file if the database write fails', async () => {
    const file = {
      originalname: 'customer.pdf',
      mimetype: 'application/pdf',
      size: 8,
      buffer: Buffer.from('%PDF-1.7'),
    };
    jest.mocked(storage.writeUploadedFile).mockResolvedValue();
    jest.mocked(prisma.workSalesMessage.create).mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      service.createMessage(employeeUser, 'work-1', {}, [file]),
    ).rejects.toThrow('database unavailable');
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'work',
      expect.stringContaining('work-1/sales/'),
    );
  });

  it('does not give Supporting Staff access to private Sales files', async () => {
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'support-member',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-1',
      departmentId: 'support-department',
    });
    jest.mocked(prisma.workItem.findUnique).mockResolvedValue({
      ...workItem(),
      assignments: [
        ...workItem().assignments,
        {
          assigneeAccountId: 'support-member',
          assignmentRole: WorkAssignmentRole.SUPPORTING,
          endedAt: null,
        },
      ],
    } as never);
    jest.mocked(prisma.departmentTeamMember.findFirst).mockResolvedValue(null);

    await expect(
      service.listMessages(
        {
          accountId: 'support-member',
          sessionId: 'session',
          username: 'support@ntc.test',
          role: AccountRole.EMPLOYEE,
        },
        'work-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

});
