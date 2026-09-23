import type { WorkItemRealtimePayload } from "../types/work-management";

export const WORK_REALTIME_EVENT = "nt-message:work-realtime";
export const WORK_REALTIME_RECONCILE_EVENT = "nt-message:work-realtime-reconcile";

export function publishWorkRealtimeEvent(payload: WorkItemRealtimePayload): void {
  window.dispatchEvent(
    new CustomEvent<WorkItemRealtimePayload>(WORK_REALTIME_EVENT, {
      detail: payload,
    }),
  );
}

export function publishWorkRealtimeReconcile(): void {
  window.dispatchEvent(new Event(WORK_REALTIME_RECONCILE_EVENT));
}
