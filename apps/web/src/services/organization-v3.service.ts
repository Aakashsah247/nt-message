import { apiRequest } from "../lib/api";

import type {
  CreateOrganizationUnitInput,
  MoveOrganizationUnitInput,
  OrganizationActionContext,
  OrganizationOfficeListResponse,
  OrganizationOfficeResponse,
  OrganizationTreeResponse,
  OrganizationUnitMutationResponse,
  SetOrganizationUnitStatusInput,
  UpdateOrganizationUnitInput,
} from "../types/organization-v3";

function authHeader(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function getOrganizationOffices(
  accessToken: string,
): Promise<OrganizationOfficeListResponse> {
  return apiRequest<OrganizationOfficeListResponse>("/organization/offices", {
    headers: authHeader(accessToken),
  });
}

export function getOrganizationOffice(
  accessToken: string,
  officeId: string,
): Promise<OrganizationOfficeResponse> {
  return apiRequest<OrganizationOfficeResponse>(
    `/organization/offices/${officeId}`,
    {
      headers: authHeader(accessToken),
    },
  );
}

export function getOrganizationTree(
  accessToken: string,
  officeId: string,
): Promise<OrganizationTreeResponse> {
  return apiRequest<OrganizationTreeResponse>(
    `/organization/offices/${officeId}/tree`,
    {
      headers: authHeader(accessToken),
    },
  );
}

export function getOrganizationActions(
  accessToken: string,
  officeId: string,
  orgUnitId: string | null,
): Promise<OrganizationActionContext> {
  const path = orgUnitId
    ? `/organization/offices/${officeId}/units/${orgUnitId}/actions`
    : `/organization/offices/${officeId}/actions`;

  return apiRequest<OrganizationActionContext>(path, {
    headers: authHeader(accessToken),
  });
}

export function createOrganizationUnit(
  accessToken: string,
  officeId: string,
  input: CreateOrganizationUnitInput,
): Promise<OrganizationUnitMutationResponse> {
  return apiRequest<OrganizationUnitMutationResponse>(
    `/organization/offices/${officeId}/units`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function updateOrganizationUnit(
  accessToken: string,
  officeId: string,
  unitId: string,
  input: UpdateOrganizationUnitInput,
): Promise<OrganizationUnitMutationResponse> {
  return apiRequest<OrganizationUnitMutationResponse>(
    `/organization/offices/${officeId}/units/${unitId}`,
    {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function moveOrganizationUnit(
  accessToken: string,
  officeId: string,
  unitId: string,
  input: MoveOrganizationUnitInput,
): Promise<OrganizationUnitMutationResponse> {
  return apiRequest<OrganizationUnitMutationResponse>(
    `/organization/offices/${officeId}/units/${unitId}/move`,
    {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function setOrganizationUnitStatus(
  accessToken: string,
  officeId: string,
  unitId: string,
  input: SetOrganizationUnitStatusInput,
): Promise<OrganizationUnitMutationResponse> {
  return apiRequest<OrganizationUnitMutationResponse>(
    `/organization/offices/${officeId}/units/${unitId}/status`,
    {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}
