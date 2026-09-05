import { apiRequest } from "../lib/api";

import type {
  CreateOrganizationDelegationInput,
  CreateOrganizationUnitInput,
  AssignOrganizationMembershipInput,
  AssignOrganizationLeadershipInput,
  EndOrganizationMembershipInput,
  OrganizationDelegationContextResponse,
  OrganizationDelegationListResponse,
  OrganizationDelegationMutationResponse,
  EndOrganizationLeadershipInput,
  MoveOrganizationUnitInput,
  OrganizationActionContext,
  OrganizationEmployeeMembershipsResponse,
  OrganizationMembershipMutationResponse,
  OrganizationLeadershipMutationResponse,
  OrganizationLeadershipResponse,
  OrganizationPeopleActionContext,
  OrganizationPeopleResponse,
  OrganizationNavigationContextResponse,
  OrganizationOfficeListResponse,
  OrganizationOfficeResponse,
  OrganizationTreeResponse,
  OrganizationUnitMutationResponse,
  SetOrganizationUnitStatusInput,
  RevokeOrganizationDelegationInput,
  TransferPrimaryMembershipInput,
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

export function getOrganizationNavigationContext(
  accessToken: string,
): Promise<OrganizationNavigationContextResponse> {
  return apiRequest<OrganizationNavigationContextResponse>(
    "/organization/navigation-context",
    {
      headers: authHeader(accessToken),
    },
  );
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

export function getOrganizationPeople(
  accessToken: string,
  officeId: string,
): Promise<OrganizationPeopleResponse> {
  return apiRequest<OrganizationPeopleResponse>(
    `/organization/offices/${officeId}/people`,
    {
      headers: authHeader(accessToken),
    },
  );
}

export function getOrganizationPeopleActions(
  accessToken: string,
  officeId: string,
  orgUnitId: string | null,
): Promise<OrganizationPeopleActionContext> {
  const path = orgUnitId
    ? `/organization/offices/${officeId}/units/${orgUnitId}/people/actions`
    : `/organization/offices/${officeId}/people/actions`;

  return apiRequest<OrganizationPeopleActionContext>(path, {
    headers: authHeader(accessToken),
  });
}

export function getEmployeeOrganizationMemberships(
  accessToken: string,
  officeId: string,
  employeeId: string,
): Promise<OrganizationEmployeeMembershipsResponse> {
  return apiRequest<OrganizationEmployeeMembershipsResponse>(
    `/organization/offices/${officeId}/employees/${employeeId}/memberships`,
    {
      headers: authHeader(accessToken),
    },
  );
}

export function transferPrimaryOrganizationMembership(
  accessToken: string,
  officeId: string,
  input: TransferPrimaryMembershipInput,
): Promise<OrganizationMembershipMutationResponse> {
  return apiRequest<OrganizationMembershipMutationResponse>(
    `/organization/offices/${officeId}/memberships/transfer-primary`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function assignOrganizationMembership(
  accessToken: string,
  officeId: string,
  input: AssignOrganizationMembershipInput,
): Promise<OrganizationMembershipMutationResponse> {
  return apiRequest<OrganizationMembershipMutationResponse>(
    `/organization/offices/${officeId}/memberships`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function endOrganizationMembership(
  accessToken: string,
  officeId: string,
  membershipId: string,
  input: EndOrganizationMembershipInput,
): Promise<OrganizationMembershipMutationResponse> {
  return apiRequest<OrganizationMembershipMutationResponse>(
    `/organization/offices/${officeId}/memberships/${membershipId}/end`,
    {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function getOrganizationLeadership(
  accessToken: string,
  officeId: string,
): Promise<OrganizationLeadershipResponse> {
  return apiRequest<OrganizationLeadershipResponse>(
    `/organization/offices/${officeId}/leadership`,
    {
      headers: authHeader(accessToken),
    },
  );
}

export function assignOrganizationLeadership(
  accessToken: string,
  officeId: string,
  input: AssignOrganizationLeadershipInput,
): Promise<OrganizationLeadershipMutationResponse> {
  return apiRequest<OrganizationLeadershipMutationResponse>(
    `/organization/offices/${officeId}/leadership`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function endOrganizationLeadership(
  accessToken: string,
  officeId: string,
  assignmentId: string,
  input: EndOrganizationLeadershipInput,
): Promise<OrganizationLeadershipMutationResponse> {
  return apiRequest<OrganizationLeadershipMutationResponse>(
    `/organization/offices/${officeId}/leadership/${assignmentId}/end`,
    {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}
export function getOrganizationDelegations(
  accessToken: string,
  officeId: string,
): Promise<OrganizationDelegationListResponse> {
  return apiRequest<OrganizationDelegationListResponse>(
    `/organization/offices/${officeId}/delegations`,
    {
      headers: authHeader(accessToken),
    },
  );
}

export function getOrganizationDelegationContext(
  accessToken: string,
  officeId: string,
  orgUnitId: string | null,
  includeDescendants: boolean,
): Promise<OrganizationDelegationContextResponse> {
  const query = new URLSearchParams();

  if (orgUnitId) {
    query.set("orgUnitId", orgUnitId);
    query.set("includeDescendants", String(includeDescendants));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";

  return apiRequest<OrganizationDelegationContextResponse>(
    `/organization/offices/${officeId}/delegations/context${suffix}`,
    {
      headers: authHeader(accessToken),
    },
  );
}

export function createOrganizationDelegation(
  accessToken: string,
  officeId: string,
  input: CreateOrganizationDelegationInput,
): Promise<OrganizationDelegationMutationResponse> {
  return apiRequest<OrganizationDelegationMutationResponse>(
    `/organization/offices/${officeId}/delegations`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function revokeOrganizationDelegation(
  accessToken: string,
  officeId: string,
  permissionId: string,
  input: RevokeOrganizationDelegationInput,
): Promise<OrganizationDelegationMutationResponse> {
  return apiRequest<OrganizationDelegationMutationResponse>(
    `/organization/offices/${officeId}/delegations/${permissionId}/revoke`,
    {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}
