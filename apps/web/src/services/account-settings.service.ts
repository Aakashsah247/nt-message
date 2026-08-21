import { apiRequest } from "../lib/api";
import type { InterfaceLanguage } from "../i18n/language";

export interface AccountLanguageResponse {
  interfaceLanguage: InterfaceLanguage;
}

export function updateAccountLanguage(
  accessToken: string,
  interfaceLanguage: InterfaceLanguage,
): Promise<AccountLanguageResponse> {
  return apiRequest<AccountLanguageResponse>("/account-settings/language", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ interfaceLanguage }),
  });
}
