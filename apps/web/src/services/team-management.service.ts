import { apiRequest } from "../lib/api";
import type {
  OperationalTeam,
  OperationalTeamListResponse,
  OperationalTeamMemberListResponse,
  OperationalTeamMutationResponse,
  SaveOperationalTeamInput,
  TeamManagementContext,
} from "../types/team-management";

function auth(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function queryString(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value?.trim()) params.set(key, value.trim());
  });
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function getTeamManagementContext(accessToken: string): Promise<TeamManagementContext> {
  return apiRequest<TeamManagementContext>("/team-management/context", { headers: auth(accessToken) });
}

export function listOperationalTeams(
  accessToken: string,
  query: { orgUnitId?: string; search?: string; status?: "active" | "removed" } = {},
): Promise<OperationalTeamListResponse> {
  return apiRequest<OperationalTeamListResponse>(`/team-management/teams${queryString(query)}`, {
    headers: auth(accessToken),
  });
}

export function getOperationalTeam(accessToken: string, teamId: string): Promise<OperationalTeam> {
  return apiRequest<OperationalTeam>(`/team-management/teams/${teamId}`, { headers: auth(accessToken) });
}

export function listOperationalTeamMembers(
  accessToken: string,
  query: { orgUnitId: string; search?: string },
): Promise<OperationalTeamMemberListResponse> {
  return apiRequest<OperationalTeamMemberListResponse>(`/team-management/members${queryString(query)}`, {
    headers: auth(accessToken),
  });
}

export function createOperationalTeam(
  accessToken: string,
  input: SaveOperationalTeamInput & { orgUnitId: string },
): Promise<OperationalTeamMutationResponse> {
  return apiRequest<OperationalTeamMutationResponse>("/team-management/teams", {
    method: "POST",
    headers: auth(accessToken),
    body: JSON.stringify(input),
  });
}

export function updateOperationalTeam(
  accessToken: string,
  teamId: string,
  input: SaveOperationalTeamInput,
): Promise<OperationalTeamMutationResponse> {
  return apiRequest<OperationalTeamMutationResponse>(`/team-management/teams/${teamId}`, {
    method: "PATCH",
    headers: auth(accessToken),
    body: JSON.stringify(input),
  });
}

export function deleteOperationalTeam(accessToken: string, teamId: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/team-management/teams/${teamId}`, {
    method: "DELETE",
    headers: auth(accessToken),
  });
}

export function restoreOperationalTeam(
  accessToken: string,
  teamId: string,
): Promise<OperationalTeamMutationResponse> {
  return apiRequest<OperationalTeamMutationResponse>(`/team-management/teams/${teamId}/restore`, {
    method: "POST",
    headers: auth(accessToken),
  });
}
