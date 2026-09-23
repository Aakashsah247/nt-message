import type { AccountRole } from "./auth";

export type EmergencyAlertRecipientStatus =
  | "PENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED_NO_PHONE";

export type EmergencyAlertProfileSource =
  | "EMPLOYEE_PROFILE"
  | "SUPER_ADMIN_PROFILE";

export type EmergencyAlertRecipientKind = "OFFICE_USER" | "SYSTEM_SUPPORT";
export type EmergencySmsLanguage = "EN" | "NE";
export type EmergencySmsMessageMode = "QUICK" | "CUSTOM";

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
  recipientKind: EmergencyAlertRecipientKind;
  authorityLabel: string;
  designation: string | null;
  officeId: string | null;
  officeName: string | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  orgUnitType: string | null;
  teamName: string | null;
  profileSource: EmergencyAlertProfileSource;
  phoneAvailable: boolean;
  phoneDisplay: string | null;
  phoneStatus: SuperAdminProfileStatus | "READY";
  phoneStatusMessage: string;
}

export interface EmergencyAlertContactsResponse {
  office: { id: string; name: string };
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
  language: EmergencySmsLanguage;
  messageMode: EmergencySmsMessageMode;
}
