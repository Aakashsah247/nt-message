import { apiRequest } from "../lib/api";
import type {
  ApproveWorkRuntimeV3StageInput,
  AssignWorkRuntimeV3StageInput,
  BlockWorkRuntimeV3StageInput,
  CancelWorkRuntimeV3Input,
  CompleteWorkRuntimeV3Input,
  CreateWorkRuntimeV3Input,
  ReopenWorkRuntimeV3Input,
  ReturnWorkRuntimeV3StageInput,
  SubmitWorkRuntimeV3StageInput,
  WorkRuntimeV3CreateContext,
  WorkRuntimeV3Work,
  WorkRuntimeV3WorkAction,
  WorkRuntimeV3Stage,
  WorkRuntimeV3StageMutationInput,
} from "../types/work-runtime-v3";

function authHeader(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function officePath(officeId: string): string {
  return `/work-v3/offices/${officeId}`;
}

function queuePath(officeId: string, queue: "mine" | "team" | "org-unit", take: number): string {
  const params = new URLSearchParams({ take: String(take) });
  return `${officePath(officeId)}/queues/${queue}?${params.toString()}`;
}

export function getWorkRuntimeV3CreateContext(
  accessToken: string,
  officeId: string,
): Promise<WorkRuntimeV3CreateContext> {
  return apiRequest<WorkRuntimeV3CreateContext>(
    `${officePath(officeId)}/create-context`,
    { headers: authHeader(accessToken) },
  );
}

export function createWorkRuntimeV3(
  accessToken: string,
  officeId: string,
  input: CreateWorkRuntimeV3Input,
): Promise<WorkRuntimeV3Work> {
  return apiRequest<WorkRuntimeV3Work>(officePath(officeId), {
    method: "POST",
    headers: authHeader(accessToken),
    body: JSON.stringify(input),
  });
}

export function getWorkRuntimeV3(
  accessToken: string,
  officeId: string,
  workItemId: string,
): Promise<WorkRuntimeV3Work> {
  return apiRequest<WorkRuntimeV3Work>(
    `${officePath(officeId)}/work-items/${workItemId}`,
    { headers: authHeader(accessToken) },
  );
}

export function listMyWorkRuntimeV3Stages(
  accessToken: string,
  officeId: string,
  take = 50,
): Promise<WorkRuntimeV3Stage[]> {
  return apiRequest<WorkRuntimeV3Stage[]>(queuePath(officeId, "mine", take), {
    headers: authHeader(accessToken),
  });
}

export function listTeamWorkRuntimeV3Stages(
  accessToken: string,
  officeId: string,
  take = 50,
): Promise<WorkRuntimeV3Stage[]> {
  return apiRequest<WorkRuntimeV3Stage[]>(queuePath(officeId, "team", take), {
    headers: authHeader(accessToken),
  });
}

export function listOrgUnitWorkRuntimeV3Stages(
  accessToken: string,
  officeId: string,
  take = 50,
): Promise<WorkRuntimeV3Stage[]> {
  return apiRequest<WorkRuntimeV3Stage[]>(queuePath(officeId, "org-unit", take), {
    headers: authHeader(accessToken),
  });
}

export function getWorkRuntimeV3Stage(
  accessToken: string,
  officeId: string,
  stageId: string,
): Promise<WorkRuntimeV3Stage> {
  return apiRequest<WorkRuntimeV3Stage>(
    `${officePath(officeId)}/stages/${stageId}`,
    { headers: authHeader(accessToken) },
  );
}

export function assignWorkRuntimeV3Stage(
  accessToken: string,
  officeId: string,
  stageId: string,
  input: AssignWorkRuntimeV3StageInput,
): Promise<WorkRuntimeV3Stage> {
  return apiRequest<WorkRuntimeV3Stage>(
    `${officePath(officeId)}/stages/${stageId}/assign`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

function mutateStage(
  accessToken: string,
  officeId: string,
  stageId: string,
  action: "start" | "resume",
  input: WorkRuntimeV3StageMutationInput,
): Promise<WorkRuntimeV3Stage> {
  return apiRequest<WorkRuntimeV3Stage>(
    `${officePath(officeId)}/stages/${stageId}/${action}`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function startWorkRuntimeV3Stage(
  accessToken: string,
  officeId: string,
  stageId: string,
  input: WorkRuntimeV3StageMutationInput,
): Promise<WorkRuntimeV3Stage> {
  return mutateStage(accessToken, officeId, stageId, "start", input);
}

export function resumeWorkRuntimeV3Stage(
  accessToken: string,
  officeId: string,
  stageId: string,
  input: WorkRuntimeV3StageMutationInput,
): Promise<WorkRuntimeV3Stage> {
  return mutateStage(accessToken, officeId, stageId, "resume", input);
}

export function blockWorkRuntimeV3Stage(
  accessToken: string,
  officeId: string,
  stageId: string,
  input: BlockWorkRuntimeV3StageInput,
): Promise<WorkRuntimeV3Stage> {
  return apiRequest<WorkRuntimeV3Stage>(
    `${officePath(officeId)}/stages/${stageId}/block`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function submitWorkRuntimeV3Stage(
  accessToken: string,
  officeId: string,
  stageId: string,
  input: SubmitWorkRuntimeV3StageInput,
): Promise<WorkRuntimeV3Stage> {
  return apiRequest<WorkRuntimeV3Stage>(
    `${officePath(officeId)}/stages/${stageId}/submit`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function approveWorkRuntimeV3Stage(
  accessToken: string,
  officeId: string,
  stageId: string,
  input: ApproveWorkRuntimeV3StageInput,
): Promise<WorkRuntimeV3Stage> {
  return apiRequest<WorkRuntimeV3Stage>(
    `${officePath(officeId)}/stages/${stageId}/approve`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function returnWorkRuntimeV3Stage(
  accessToken: string,
  officeId: string,
  stageId: string,
  input: ReturnWorkRuntimeV3StageInput,
): Promise<WorkRuntimeV3Stage> {
  return apiRequest<WorkRuntimeV3Stage>(
    `${officePath(officeId)}/stages/${stageId}/return`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function getWorkRuntimeV3Actions(
  accessToken: string,
  officeId: string,
  workItemId: string,
): Promise<WorkRuntimeV3WorkAction[]> {
  return apiRequest<WorkRuntimeV3WorkAction[]>(
    `${officePath(officeId)}/work-items/${workItemId}/actions`,
    { headers: authHeader(accessToken) },
  );
}

export function completeWorkRuntimeV3(
  accessToken: string,
  officeId: string,
  workItemId: string,
  input: CompleteWorkRuntimeV3Input,
): Promise<unknown> {
  return apiRequest<unknown>(
    `${officePath(officeId)}/work-items/${workItemId}/complete`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function cancelWorkRuntimeV3(
  accessToken: string,
  officeId: string,
  workItemId: string,
  input: CancelWorkRuntimeV3Input,
): Promise<unknown> {
  return apiRequest<unknown>(
    `${officePath(officeId)}/work-items/${workItemId}/cancel`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function reopenWorkRuntimeV3(
  accessToken: string,
  officeId: string,
  workItemId: string,
  input: ReopenWorkRuntimeV3Input,
): Promise<unknown> {
  return apiRequest<unknown>(
    `${officePath(officeId)}/work-items/${workItemId}/reopen`,
    {
      method: "POST",
      headers: authHeader(accessToken),
      body: JSON.stringify(input),
    },
  );
}
