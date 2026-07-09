import type {
  AccountRole,
} from "./auth";

export type EmergencyAlertRecipientStatus =
  | "PENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED_NO_PHONE";

export type EmergencyAlertProfileSource =
  | "EMPLOYEE_PROFILE"
  | "SUPER_ADMIN_PROFILE";

export type SuperAdminProfileSource =
  | "SYSTEM_CONFIG"
  | "DATABASE_SETUP"
  | "ACCOUNT_FALLBACK";

export type SuperAdminProfileStatus =
  | "READY"
  | "NOT_CONFIGURED"
  | "INVALID_PHONE"
  | "DUPLICATE_EMAIL"
  | "DUPLICATE_PHONE";

export interface SuperAdminEmergencyProfile {
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  source: SuperAdminProfileSource;
  profileStatus: SuperAdminProfileStatus;
  statusMessage: string;
  updatedAt: string | null;
}

export interface SuperAdminEmergencyProfileResponse {
  data: SuperAdminEmergencyProfile;
}

export interface EmergencyAlertContact {
  accountId: string;
  displayName: string;
  role: AccountRole;
  designation: string | null;
  division: string | null;
  department: string | null;
  profileSource: EmergencyAlertProfileSource;
  phoneAvailable: boolean;
  phoneStatus: SuperAdminProfileStatus | "READY";
  phoneStatusMessage: string;
}

export interface EmergencyAlertContactsResponse {
  data: EmergencyAlertContact[];
}

export interface EmergencyAlertPublicAccount {
  accountId: string;
  username: string | null;
  role: AccountRole;
  displayName: string;
}

export interface EmergencyAlertRecipientDelivery {
  id: string;
  accountId: string;
  employeeName: string;
  role: AccountRole;
  phoneNumber: string | null;
  status: EmergencyAlertRecipientStatus;
  providerName: string;
  providerMessageId: string | null;
  failureReason: string | null;
  sentAt: string | null;
}

export interface SendEmergencyAlertResponse {
  alert: {
    id: string;
    sender: EmergencyAlertPublicAccount;
    recipient: EmergencyAlertPublicAccount;
    messageLong: string;
    messageShort: string;
    createdAt: string;
  };
  recipient: EmergencyAlertRecipientDelivery;
  architectureNote: string;
}
