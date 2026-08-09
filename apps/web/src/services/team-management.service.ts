import { apiRequest } from "../lib/api";
import type {
  DeleteDepartmentTeamResponse,
  DepartmentTeam,
  DepartmentTeamListResponse,
  DepartmentTeamMutationResponse,
  SaveDepartmentTeamInput,
  TeamManagementContext,
  TeamMemberListResponse,
} from "../types/team-management";

function authorizationHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function buildQuery(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value?.trim()) {
      params.set(key, value.trim());
    }
  });

  const result = params.toString();
  return result ? `?${result}` : "";
}

export function getTeamManagementContext(
  accessToken: string,
): Promise<TeamManagementContext> {
  return apiRequest<TeamManagementContext>("/team-management/context", {
    headers: authorizationHeaders(accessToken),
  });
}

export function listDepartmentTeams(
  accessToken: string,
  query: {
    divisionId?: string;
    departmentId?: string;
    search?: string;
  } = {},
): Promise<DepartmentTeamListResponse> {
  return apiRequest<DepartmentTeamListResponse>(
    `/team-management/teams${buildQuery(query)}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function getDepartmentTeam(
  accessToken: string,
  teamId: string,
): Promise<DepartmentTeam> {
  return apiRequest<DepartmentTeam>(`/team-management/teams/${teamId}`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function listDepartmentTeamMembers(
  accessToken: string,
  query: {
    departmentId?: string;
    search?: string;
  },
): Promise<TeamMemberListResponse> {
  return apiRequest<TeamMemberListResponse>(
    `/team-management/members${buildQuery(query)}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function createDepartmentTeam(
  accessToken: string,
  input: SaveDepartmentTeamInput,
): Promise<DepartmentTeamMutationResponse> {
  return apiRequest<DepartmentTeamMutationResponse>("/team-management/teams", {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function updateDepartmentTeam(
  accessToken: string,
  teamId: string,
  input: Omit<SaveDepartmentTeamInput, "departmentId">,
): Promise<DepartmentTeamMutationResponse> {
  return apiRequest<DepartmentTeamMutationResponse>(
    `/team-management/teams/${teamId}`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function deleteDepartmentTeam(
  accessToken: string,
  teamId: string,
): Promise<DeleteDepartmentTeamResponse> {
  return apiRequest<DeleteDepartmentTeamResponse>(
    `/team-management/teams/${teamId}`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}
