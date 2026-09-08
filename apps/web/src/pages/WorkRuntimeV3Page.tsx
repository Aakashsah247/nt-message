import { useLocation } from "react-router";

import { IncomingWorkPage } from "./IncomingWorkPage";
import { MyWorkPage } from "./MyWorkPage";
import { WorkOverviewPage } from "./WorkOverviewPage";
import { WorkStageWorkspacePage } from "./WorkStageWorkspacePage";

export function WorkRuntimeV3Page() {
  const { pathname } = useLocation();

  if (pathname === "/work") {
    return <WorkOverviewPage />;
  }

  if (pathname === "/my-work") {
    return <MyWorkPage />;
  }

  if (pathname === "/incoming-work") {
    return <IncomingWorkPage />;
  }

  return <WorkStageWorkspacePage />;
}
