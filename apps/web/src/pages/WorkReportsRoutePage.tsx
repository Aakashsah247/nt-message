import { useAuth } from "../context/AuthContext";
import { WorkReportsPage as WorkReportsV3Page } from "./WorkReportsPage";
import { WorkReportsPage as WorkReportsMainPage } from "./WorkReportsMainPage";

export function WorkReportsRoutePage() {
  const { account } = useAuth();

  // Super Admin keeps the V3 multi-office, read-only report surface. Office
  // users receive the finalized main-branch report experience through the
  // V3 compatibility adapter.
  return account?.accountClass === "SUPER_ADMIN"
    ? <WorkReportsV3Page />
    : <WorkReportsMainPage />;
}
