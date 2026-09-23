import { useAuth as useCurrentAuth } from "./AuthContext";
import { useOrganizationWorkspace } from "./organization-workspace-context";

/**
 * Compatibility-only auth projection for the restored main-branch Work UI.
 * Authorization remains backend/V3 authoritative. The legacy role value is
 * used only so the old finalized Work presentation renders the correct
 * management/employee controls for the current V3 leadership context.
 */
export function useAuth() {
  const auth = useCurrentAuth();
  const { context } = useOrganizationWorkspace();

  if (!auth.account) {
    return auth;
  }

  let role = "EMPLOYEE";
  if (auth.account.accountClass === "SUPER_ADMIN") {
    role = "SUPER_ADMIN";
  } else if (context?.authority.isOfficeHead) {
    role = "SENIOR_MANAGEMENT";
  } else if (
    context?.authority.isOrganizationHead ||
    context?.authority.isOrgUnitHead ||
    context?.features.workManagement
  ) {
    role = "TEAM_MANAGER";
  }

  return {
    ...auth,
    account: {
      ...auth.account,
      role,
    },
  };
}
