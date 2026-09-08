import { WorkStageWorkspacePage } from "./WorkStageWorkspacePage";

const INCOMING_WORK_QUEUES = ["ORG_UNIT"] as const;

export function IncomingWorkPage() {
  return (
    <WorkStageWorkspacePage
      allowedQueues={INCOMING_WORK_QUEUES}
      initialQueueMode="ORG_UNIT"
      pageKind="INCOMING_WORK"
    />
  );
}
