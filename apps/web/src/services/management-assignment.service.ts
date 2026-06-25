import { apiRequest } from "../lib/api";

import type {
  EndManagementAssignmentInput,
  ListManagementPositionsQuery,
  ListManagementPositionsResponse,
  ManagementAssignmentActionResponse,
  ManagementPositionDetailResponse,
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
