import { apiRequest } from "../lib/api";
import type {
  CreateWorkTypeDraftInput,
  ReplaceWorkTypeConfigurationInput,
  UpdateWorkTypeDraftInput,
  WorkTypeActionContextResponse,
  WorkTypeConfigurationContextResponse,
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

function officePath(officeId: string): string {
  return `/work-types/offices/${officeId}`;
}

export function getWorkTypeActions(
  accessToken: string,
  officeId: string,
): Promise<WorkTypeActionContextResponse> {
  return apiRequest<WorkTypeActionContextResponse>(
    `${officePath(officeId)}/actions`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkTypeConfigurationContext(
  accessToken: string,
  officeId: string,
): Promise<WorkTypeConfigurationContextResponse> {
  return apiRequest<WorkTypeConfigurationContextResponse>(
    `${officePath(officeId)}/configuration-context`,
    { headers: authHeader(accessToken) },
  );
}

export function listWorkTypes(
  accessToken: string,
  officeId: string,
): Promise<WorkTypeListResponse> {
  return apiRequest<WorkTypeListResponse>(officePath(officeId), {
    headers: authHeader(accessToken),
  });
}

export function getWorkType(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
): Promise<WorkTypeDetailResponse> {
  return apiRequest<WorkTypeDetailResponse>(
    `${officePath(officeId)}/${workTypeDefinitionId}`,
    { headers: authHeader(accessToken) },
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
  return apiRequest<WorkTypeDraftMutationResponse>(
    `${officePath(officeId)}/${workTypeDefinitionId}/drafts/${versionId}`,
    {
      method: "PATCH",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function replaceWorkTypeDraftConfiguration(
  accessToken: string,
  officeId: string,
  workTypeDefinitionId: string,
  versionId: string,
  input: ReplaceWorkTypeConfigurationInput,
): Promise<WorkTypeDraftMutationResponse> {
  return apiRequest<WorkTypeDraftMutationResponse>(
    `${officePath(officeId)}/${workTypeDefinitionId}/drafts/${versionId}/configuration`,
    {
      method: "PUT",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
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
