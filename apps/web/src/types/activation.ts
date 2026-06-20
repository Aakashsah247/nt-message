import type { AccountRole } from "./auth";

export interface PublicDepartment {
  id: string;
  code: string;
  name: string;
  divisionId: string;

  division: {
    id: string;
    code: string;
    name: string;
  };
}

export interface PublicDepartmentsResponse {
  data: PublicDepartment[];
}

export interface ActivationIdentity {
  empName: string;
  empId: string;
  phoneNumber: string;
  officialEmail: string;
  departmentId: string;
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
    role: AccountRole;
    isEnabled: boolean;
  };
}
