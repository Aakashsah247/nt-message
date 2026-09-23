import { apiRequest, isApiNetworkError } from "../lib/api";
import type {
  CreateWorkTypeDefinitionInput,
  CreateWorkTypeDraftInput,
  ReplaceWorkTypeConfigurationInput,
  UpdateWorkTypeDraftInput,
  WorkTypeActionContextResponse,
  WorkTypeConfigurationContextResponse,
  WorkTypeDefinitionMutationResponse,
  WorkTypeDetailResponse,
  WorkTypeDiscardDraftResponse,
  WorkTypeDraftMutationResponse,
  WorkTypeListResponse,
  WorkTypePublishResponse,
} from "../types/work-type-v3";

function authHeader(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

async function retryOnceOnNetworkError<T>(
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isApiNetworkError(error)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
    return request();
  }
}

function officePath(officeId: string): string {
  return `/work-types/offices/${officeId}`;
}

export function getWorkTypeActions(
  accessToken: string,
  officeId: string,
): Promise<WorkTypeActionContextResponse> {
  return retryOnceOnNetworkError(() =>
    apiRequest<WorkTypeActionContextResponse>(
      `${officePath(officeId)}/actions`,
      { headers: authHeader(accessToken) },
    ),
  );
}

export function getWorkTypeConfigurationContext(
  accessToken: string,
  officeId: string,
): Promise<WorkTypeConfigurationContextResponse> {
  return retryOnceOnNetworkError(() =>
    apiRequest<WorkTypeConfigurationContextResponse>(
      `${officePath(officeId)}/configuration-context`,
      { headers: authHeader(accessToken) },
    ),
  );
}

export function listWorkTypes(
  accessToken: string,
  officeId: string,
): Promise<WorkTypeListResponse> {
  return retryOnceOnNetworkError(() =>
    apiRequest<WorkTypeListResponse>(officePath(officeId), {
      headers: authHeader(accessToken),
    }),
  );
}

export function getWorkType(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
): Promise<WorkTypeDetailResponse> {
  return retryOnceOnNetworkError(() =>
    apiRequest<WorkTypeDetailResponse>(
      `${officePath(officeId)}/${workTypeDefinitionId}`,
      { headers: authHeader(accessToken) },
    ),
  );
}

export function createWorkTypeDraft(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
  input: CreateWorkTypeDraftInput,
): Promise<WorkTypeDraftMutationResponse> {
  return apiRequest<WorkTypeDraftMutationResponse>(
    `${officePath(officeId)}/${workTypeDefinitionId}/drafts`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function updateWorkTypeDraft(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
  versionId: string,
  input: UpdateWorkTypeDraftInput,
): Promise<WorkTypeDraftMutationResponse> {
  return retryOnceOnNetworkError(() =>
    apiRequest<WorkTypeDraftMutationResponse>(
      `${officePath(officeId)}/${workTypeDefinitionId}/drafts/${versionId}`,
      {
        method: "PATCH",
        headers: authHeader(accessToken),
        body: JSON.stringify(input),
      },
    ),
  );
}

export function replaceWorkTypeDraftConfiguration(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
  versionId: string,
  input: ReplaceWorkTypeConfigurationInput,
): Promise<WorkTypeDraftMutationResponse> {
  return retryOnceOnNetworkError(() =>
    apiRequest<WorkTypeDraftMutationResponse>(
      `${officePath(officeId)}/${workTypeDefinitionId}/drafts/${versionId}/configuration`,
      {
        method: "PUT",
        headers: authHeader(accessToken),
        body: JSON.stringify(input),
      },
    ),
  );
}

export function discardWorkTypeDraft(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
  versionId: string,
): Promise<WorkTypeDiscardDraftResponse> {
  return apiRequest<WorkTypeDiscardDraftResponse>(
    `${officePath(officeId)}/${workTypeDefinitionId}/drafts/${versionId}`,
    {
      method: "DELETE",
      headers: authHeader(accessToken),
    },
  );
}

export function publishWorkTypeDraft(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
  versionId: string,
): Promise<WorkTypePublishResponse> {
  return apiRequest<WorkTypePublishResponse>(
    `${officePath(officeId)}/${workTypeDefinitionId}/drafts/${versionId}/publish`,
    {
      method: "POST",
      headers: authHeader(accessToken),
    },
  );
}

export function createWorkTypeDefinition(
  accessToken: string,
  officeId: string,
  input: CreateWorkTypeDefinitionInput,
): Promise<WorkTypeDefinitionMutationResponse> {
  return apiRequest<WorkTypeDefinitionMutationResponse>(officePath(officeId), {
    method: "POST",
    headers: authHeader(accessToken),
    body: JSON.stringify(input),
  });
}

export function removeWorkTypeDefinition(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
): Promise<WorkTypeDefinitionMutationResponse> {
  return apiRequest<WorkTypeDefinitionMutationResponse>(
    `${officePath(officeId)}/${workTypeDefinitionId}`,
    { method: "DELETE", headers: authHeader(accessToken) },
  );
}

export function permanentlyDeleteWorkTypeDefinition(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
): Promise<WorkTypeDefinitionMutationResponse> {
  return apiRequest<WorkTypeDefinitionMutationResponse>(
    `${officePath(officeId)}/${workTypeDefinitionId}/permanent`,
    { method: "DELETE", headers: authHeader(accessToken) },
  );
}

export function restoreWorkTypeDefinition(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
): Promise<WorkTypeDefinitionMutationResponse> {
  return apiRequest<WorkTypeDefinitionMutationResponse>(
    `${officePath(officeId)}/${workTypeDefinitionId}/restore`,
    { method: "POST", headers: authHeader(accessToken) },
  );
}
