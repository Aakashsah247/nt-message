import { WorkStageWorkspacePage } from "./WorkStageWorkspacePage";

const MY_WORK_QUEUES = ["MINE", "TEAM"] as const;

export function MyWorkPage() {
  return (
    <WorkStageWorkspacePage
      allowedQueues={MY_WORK_QUEUES}
      initialQueueMode="MINE"
      pageKind="MY_WORK"
    />
  );
}
