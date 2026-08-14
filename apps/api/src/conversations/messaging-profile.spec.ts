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
      superAdminProfile: null,
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

  it('uses the official Super Admin identity and phone in messaging profiles', () => {
    const previousName = process.env.SUPER_ADMIN_NAME;
    const previousEmail = process.env.SUPER_ADMIN_EMAIL;
    const previousPhone = process.env.SUPER_ADMIN_PHONE;

    process.env.SUPER_ADMIN_NAME = 'Configured Super Admin';
    process.env.SUPER_ADMIN_EMAIL = 'configured-admin@example.com';
    process.env.SUPER_ADMIN_PHONE = '9841000000';

    try {
      const service = new ConversationsService(
        {} as never,
        {} as never,
        {} as never,
      );
      const account = {
        id: 'super-admin-account',
        username: 'legacy-super-admin-login@example.com',
        role: AccountRole.SUPER_ADMIN,
        isEnabled: true,
        profilePhotoKey: null,
        profileBio: null,
        showOnlineStatus: true,
        showReadReceipts: true,
        requireMessageRequests: false,
        superAdminProfile: {
          fullName: 'Database Super Admin',
          email: 'database-super-admin@example.com',
          phoneNumber: '9800000000',
        },
        employee: null,
      };

      const result = (
        service as unknown as {
          serializeUserProfile: (
            value: typeof account,
            viewerAccountId: string,
            sharedGroups: never[],
            contactMode: 'SELF',
            blockDirection: null,
          ) => {
            displayName: string;
            official: {
              employeeId: string | null;
              officialEmail: string | null;
              contactNumber: string | null;
            } | null;
          };
        }
      ).serializeUserProfile(account, account.id, [], 'SELF', null);

      expect(result.displayName).toBe('Configured Super Admin');
      expect(result.official).toMatchObject({
        employeeId: null,
        officialEmail: 'configured-admin@example.com',
        contactNumber: '+9779841000000',
      });
    } finally {
      if (previousName === undefined) {
        delete process.env.SUPER_ADMIN_NAME;
      } else {
        process.env.SUPER_ADMIN_NAME = previousName;
      }

      if (previousEmail === undefined) {
        delete process.env.SUPER_ADMIN_EMAIL;
      } else {
        process.env.SUPER_ADMIN_EMAIL = previousEmail;
      }

      if (previousPhone === undefined) {
        delete process.env.SUPER_ADMIN_PHONE;
      } else {
        process.env.SUPER_ADMIN_PHONE = previousPhone;
      }
    }
  });
});
