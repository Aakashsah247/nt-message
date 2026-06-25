import { apiRequest } from "../lib/api";

import type {
  ActivationIdentity,
  CompleteActivationInput,
  CompleteActivationResponse,
  PublicDepartmentsResponse,
  RequestActivationOtpResponse,
  VerifyActivationOtpResponse,
} from "../types/activation";

export function getPublicDepartments(): Promise<PublicDepartmentsResponse> {
  return apiRequest<PublicDepartmentsResponse>(
    "/public/organization/departments",
  );
}

export function requestActivationOtp(
  identity: ActivationIdentity,
): Promise<RequestActivationOtpResponse> {
  return apiRequest<RequestActivationOtpResponse>("/activation/request-otp", {
    method: "POST",

    body: JSON.stringify(identity),
  });
}

export function verifyActivationOtp(
  identity: ActivationIdentity,
  otp: string,
): Promise<VerifyActivationOtpResponse> {
  return apiRequest<VerifyActivationOtpResponse>("/activation/verify-otp", {
    method: "POST",

    body: JSON.stringify({
      ...identity,
      otp,
    }),
  });
}

export function completeActivation(
  input: CompleteActivationInput,
): Promise<CompleteActivationResponse> {
  return apiRequest<CompleteActivationResponse>("/activation/complete", {
    method: "POST",

    body: JSON.stringify(input),
  });
}
