import type { PrismaService } from '../database/prisma.service';
import { AccountClass, ActivityEventType } from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { MonitoringService } from './monitoring.service';

describe('MonitoringService V3 organization scope', () => {
  const service = new MonitoringService({} as PrismaService);

  it('builds activity-log filters from account class, office and org unit', () => {
    const where = (
      service as unknown as {
        buildActivityLogWhere: (
          query: {
            accountClass: AccountClass;
            officeId: string;
            orgUnitId: string;
          },
          start: Date,
          end: Date,
        ) => Prisma.ActivityEventWhereInput;
      }
    ).buildActivityLogWhere(
      {
        accountClass: AccountClass.OFFICE_USER,
        officeId: '3351f533-e9bd-4d33-84a9-fd647031c4ef',
        orgUnitId: '36a4f1cf-0554-41af-95dd-30b3ee7c6e73',
      },
      new Date('2026-09-17T03:15:00.000Z'),
      new Date('2026-09-17T12:15:00.000Z'),
    );

    expect(where).toMatchObject({
      AND: expect.arrayContaining([
        { account: { accountClass: AccountClass.OFFICE_USER } },
        {
          account: {
            employee: {
              is: {
                orgMemberships: {
                  some: {
                    membershipType: 'PRIMARY',
                    endsAt: null,
                    officeId: '3351f533-e9bd-4d33-84a9-fd647031c4ef',
                  },
                },
              },
            },
          },
        },
        {
          account: {
            employee: {
              is: {
                orgMemberships: {
                  some: {
                    membershipType: 'PRIMARY',
                    endsAt: null,
                    orgUnitId: '36a4f1cf-0554-41af-95dd-30b3ee7c6e73',
                  },
                },
              },
            },
          },
        },
      ]),
    });
  });

  it('maps monitoring activity records to V3 office and org-unit identity', () => {
    const row = (
      service as unknown as {
        toActivityLogRow: (record: unknown) => Record<string, unknown>;
      }
    ).toActivityLogRow({
      id: 'event-1',
      sessionId: 'session-123456789',
      eventType: ActivityEventType.PAGE_VIEW,
      pagePath: '/work-management',
      elementLabel: null,
      occurredAt: new Date('2026-09-17T06:00:00.000Z'),
      account: {
        id: 'account-1',
        username: 'office.user',
        accountClass: AccountClass.OFFICE_USER,
        employee: {
          empName: 'Office User',
          designation: 'Engineer',
          orgMemberships: [
            {
              office: {
                id: 'office-1',
                code: 'PATAN',
                name: 'Patan Office',
              },
              orgUnit: {
                id: 'unit-1',
                name: 'Network Operations',
                orgUnitType: {
                  id: 'type-1',
                  code: 'DEPARTMENT',
                  name: 'Department',
                },
              },
            },
          ],
        },
      },
    });

    expect(row).toMatchObject({
      accountClass: AccountClass.OFFICE_USER,
      officeId: 'office-1',
      officeCode: 'PATAN',
      officeName: 'Patan Office',
      orgUnitId: 'unit-1',
      orgUnitName: 'Network Operations',
      orgUnitType: 'Department',
    });
    expect(row).not.toHaveProperty('role');
    expect(row).not.toHaveProperty('division');
    expect(row).not.toHaveProperty('department');
  });
});
