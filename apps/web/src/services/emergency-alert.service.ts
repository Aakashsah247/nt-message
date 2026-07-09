import { apiRequest } from "../lib/api";
import type {
  EmergencyAlertContactsResponse,
  SendEmergencyAlertResponse,
  SuperAdminEmergencyProfileResponse,
} from "../types/emergency-alert";

function createAuthorizationHeaders(
  accessToken: string,
): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function listEmergencyAlertContacts(
  accessToken: string,
): Promise<EmergencyAlertContactsResponse> {
  return apiRequest<EmergencyAlertContactsResponse>(
    "/emergency-alerts/contacts",
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function getSuperAdminEmergencyProfile(
  accessToken: string,
): Promise<SuperAdminEmergencyProfileResponse> {
  return apiRequest<SuperAdminEmergencyProfileResponse>(
    "/emergency-alerts/super-admin-profile",
    {
      headers: createAuthorizationHeaders(accessToken),
    },
  );
}

export function sendEmergencyAlert(
  accessToken: string,
  payload: {
    recipientAccountId: string;
  },
): Promise<SendEmergencyAlertResponse> {
  return apiRequest<SendEmergencyAlertResponse>(
    "/emergency-alerts",
    {
      method: "POST",
      headers: createAuthorizationHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}
