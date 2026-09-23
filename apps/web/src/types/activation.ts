import type { AccountClass, AccountRole } from "./auth";

export interface ActivationIdentity {
  empName: string;
  empId: string;
  phoneNumber: string;
  officialEmail: string;
}

export interface ActivationInvitationPreview {
  employee: {
    empName: string;
    officialEmail: string;
  };

  organization: {
    officeId: string;
    officeName: string;
    orgUnitId: string | null;
    orgUnitName: string | null;
  };

  requestedRole: Exclude<AccountRole, "SUPER_ADMIN">;
  expiresAt: string;
}

export interface RequestActivationOtpResponse {
  message: string;
  expiresInSeconds: number;
}

export interface VerifyActivationOtpResponse {
  message: string;
  activationToken: string;
  expiresInSeconds: number;

  employee: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
  };

  accountRequest: {
    id: string;
    requestedRole: Exclude<AccountRole, "SUPER_ADMIN">;
  };
}

export interface CompleteActivationInput {
  activationToken: string;
  password: string;
  confirmPassword: string;
}

export interface CompleteActivationResponse {
  message: string;

  employee: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    isActivated: boolean;
  };

  account: {
    id: string;
    username: string | null;
    accountClass: AccountClass;
    role: AccountRole;
    isEnabled: boolean;
  };
}
