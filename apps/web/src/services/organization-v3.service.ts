import { apiRequest, isApiNetworkError } from "../lib/api";

import type {
  OrganizationWorkspaceContext,
  CreateOrganizationDelegationInput,
  CreateOrganizationOfficeInput,
  CreateOrganizationOfficeResponse,
  AssignOfficeHeadInput,
  ReplaceOfficeHeadInput,
  ReplaceOfficeHeadResponse,
  CreateOfficeHeadAccountInput,
  CreateOfficeHeadAccountResponse,
  CreateOrganizationUnitInput,
  AssignOrganizationMembershipInput,
  AssignOrganizationLeadershipInput,
  EndOrganizationMembershipInput,
  OrganizationDelegationContextResponse,
  OrganizationDelegationListResponse,
  OrganizationDelegationMutationResponse,
  EndOrganizationLeadershipInput,
  DeleteOrganizationUnitResponse,
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
  OrganizationOfficeHeadContextResponse,
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

const workspaceContextRequests = new Map<
  string,
  Promise<OrganizationWorkspaceContext>
>();

export function getOrganizationWorkspaceContext(
  accessToken: string,
): Promise<OrganizationWorkspaceContext> {
  const inFlightRequest = workspaceContextRequests.get(accessToken);

  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = apiRequest<OrganizationWorkspaceContext>(
    "/organization/workspace-context",
    { headers: authHeader(accessToken) },
  ).finally(() => {
    if (workspaceContextRequests.get(accessToken) === request) {
      workspaceContextRequests.delete(accessToken);
    }
  });

  workspaceContextRequests.set(accessToken, request);
  return request;
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

export function getOrganizationOfficeHeadContext(
  accessToken: string,
): Promise<OrganizationOfficeHeadContextResponse> {
  return apiRequest<OrganizationOfficeHeadContextResponse>(
    "/organization/office-head-context",
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

function requestOrganizationUnitStatus(
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

export async function setOrganizationUnitStatus(
  accessToken: string,
  officeId: string,
  unitId: string,
  input: SetOrganizationUnitStatusInput,
): Promise<OrganizationUnitMutationResponse> {
  try {
    return await requestOrganizationUnitStatus(
      accessToken,
      officeId,
      unitId,
      input,
    );
  } catch (error) {
    if (!isApiNetworkError(error)) {
      throw error;
    }

    // Setting an explicit active state is idempotent. A single retry is safe even
    // when the first request reached the API but its response was interrupted.
    await new Promise((resolve) => setTimeout(resolve, 400));

    return requestOrganizationUnitStatus(
      accessToken,
      officeId,
      unitId,
      input,
    );
  }
}

export function deleteOrganizationUnit(
  accessToken: string,
  officeId: string,
  unitId: string,
): Promise<DeleteOrganizationUnitResponse> {
  return apiRequest<DeleteOrganizationUnitResponse>(
    `/organization/offices/${officeId}/units/${unitId}`,
    {
      method: "DELETE",
      headers: authHeader(accessToken),
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

export function createOrganizationOffice(accessToken: string, input: CreateOrganizationOfficeInput): Promise<CreateOrganizationOfficeResponse> { return apiRequest('/organization/offices', { method: 'POST', headers: authHeader(accessToken), body: JSON.stringify(input) }); }
export function assignOfficeHead(accessToken: string, officeId: string, input: AssignOfficeHeadInput) { return apiRequest(`/organization/offices/${officeId}/leadership/office-head`, { method: 'POST', headers: authHeader(accessToken), body: JSON.stringify(input) }); }
export function replaceOfficeHead(accessToken: string, officeId: string, input: ReplaceOfficeHeadInput): Promise<ReplaceOfficeHeadResponse> { return apiRequest<ReplaceOfficeHeadResponse>(`/organization/offices/${officeId}/leadership/office-head/replace`, { method: 'PATCH', headers: authHeader(accessToken), body: JSON.stringify(input) }); }
export function createOfficeHeadAccount(accessToken: string, officeId: string, input: CreateOfficeHeadAccountInput): Promise<CreateOfficeHeadAccountResponse> { return apiRequest<CreateOfficeHeadAccountResponse>(`/organization/offices/${officeId}/leadership/office-head/account`, { method: 'POST', headers: authHeader(accessToken), body: JSON.stringify(input) }); }
