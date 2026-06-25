import { apiRequest } from "../lib/api";

import type {
  AssignManagementPositionInput,
  CreateManagementPositionInput,
  CreateManagementPositionResponse,
  EndManagementAssignmentInput,
  ListManagementPositionsQuery,
  ListManagementPositionsResponse,
  ManagementAssignmentActionResponse,
  ManagementPositionDetailResponse,
  ReplaceManagementPositionInput,
} from "../types/management-assignment";

function authorizationHeaders(
  accessToken: string,
): HeadersInit {
  return {
    Authorization:
      `Bearer ${accessToken}`,
  };
}

function createQueryString(
  query:
    ListManagementPositionsQuery,
): string {
  const params =
    new URLSearchParams();

  if (query.positionType) {
    params.set(
      "positionType",
      query.positionType,
    );
  }

  if (query.divisionId) {
    params.set(
      "divisionId",
      query.divisionId,
    );
  }

  if (query.departmentId) {
    params.set(
      "departmentId",
      query.departmentId,
    );
  }

  if (query.occupancy) {
    params.set(
      "occupancy",
      query.occupancy,
    );
  }

  return params.toString();
}

export function listManagementPositions(
  accessToken: string,
  query:
    ListManagementPositionsQuery = {},
): Promise<ListManagementPositionsResponse> {
  const queryString =
    createQueryString(query);

  const path = queryString
    ? `/admin/management-positions?${queryString}`
    : "/admin/management-positions";

  return apiRequest<ListManagementPositionsResponse>(
    path,
    {
      headers:
        authorizationHeaders(
          accessToken,
        ),
    },
  );
}

export function getManagementPosition(
  accessToken: string,
  positionId: string,
): Promise<ManagementPositionDetailResponse> {
  return apiRequest<ManagementPositionDetailResponse>(
    `/admin/management-positions/${positionId}`,
    {
      headers:
        authorizationHeaders(
          accessToken,
        ),
    },
  );
}

export function createManagementPosition(
  accessToken: string,
  input:
    CreateManagementPositionInput,
): Promise<CreateManagementPositionResponse> {
  return apiRequest<CreateManagementPositionResponse>(
    "/admin/management-positions",
    {
      method: "POST",

      headers:
        authorizationHeaders(
          accessToken,
        ),

      body:
        JSON.stringify(input),
    },
  );
}

export function assignManagementPosition(
  accessToken: string,
  positionId: string,
  input:
    AssignManagementPositionInput,
): Promise<ManagementAssignmentActionResponse> {
  return apiRequest<ManagementAssignmentActionResponse>(
    `/admin/management-positions/${positionId}/assign`,
    {
      method: "POST",

      headers:
        authorizationHeaders(
          accessToken,
        ),

      body:
        JSON.stringify(input),
    },
  );
}

export function replaceManagementPositionHolder(
  accessToken: string,
  positionId: string,
  input:
    ReplaceManagementPositionInput,
): Promise<ManagementAssignmentActionResponse> {
  return apiRequest<ManagementAssignmentActionResponse>(
    `/admin/management-positions/${positionId}/replace`,
    {
      method: "PATCH",

      headers:
        authorizationHeaders(
          accessToken,
        ),

      body:
        JSON.stringify(input),
    },
  );
}

export function endManagementAssignment(
  accessToken: string,
  positionId: string,
  input:
    EndManagementAssignmentInput,
): Promise<ManagementAssignmentActionResponse> {
  return apiRequest<ManagementAssignmentActionResponse>(
    `/admin/management-positions/${positionId}/end-assignment`,
    {
      method: "PATCH",

      headers:
        authorizationHeaders(
          accessToken,
        ),

      body:
        JSON.stringify(input),
    },
  );
}
