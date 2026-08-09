import { AccountRole } from '../generated/prisma/enums';
import { ConversationsService } from './conversations.service';

describe('ConversationsService messaging profile serialization', () => {
  it('returns the authorized employee contact number in the opened profile', () => {
    const service = new ConversationsService({} as never, {} as never, {} as never);
    const account = {
      id: 'account-2',
      username: 'employee@example.com',
      role: AccountRole.EMPLOYEE,
      isEnabled: true,
      profilePhotoKey: null,
      profileBio: null,
      showOnlineStatus: true,
      showReadReceipts: true,
      requireMessageRequests: false,
      employee: {
        id: 'employee-2',
        empId: 'NTC-1002',
        empName: 'Aakash Sah',
        officialEmail: 'aakash@example.com',
        phoneNumber: '9841000000',
        designation: 'Network Head',
        profilePhotoKey: null,
        profileBio: null,
        status: 'ACTIVE',
        employmentStatus: 'ACTIVE',
        archivedAt: null,
        isActivated: true,
        divisionId: 'division-1',
        departmentId: 'department-1',
        division: {
          id: 'division-1',
          code: 'TECH',
          name: 'Technical Division',
          isActive: true,
        },
        departmentUnit: {
          id: 'department-1',
          divisionId: 'division-1',
          code: 'NETWORK',
          name: 'Network Department',
          isActive: true,
        },
      },
    };

    const result = (
      service as unknown as {
        serializeUserProfile: (
          value: typeof account,
          viewerAccountId: string,
          sharedGroups: never[],
          contactMode: 'DIRECT',
          blockDirection: null,
        ) => { official: { contactNumber: string } | null };
      }
    ).serializeUserProfile(account, 'viewer-account', [], 'DIRECT', null);

    expect(result.official?.contactNumber).toBe('9841000000');
  });
});
