import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useAuth } from "../context/AuthContext";
import { useOrganizationWorkspace } from "../context/organization-workspace-context";
import type { OrganizationWorkspaceFeature } from "../types/organization-v3";

interface WorkspaceFeatureRouteProps {
  feature: OrganizationWorkspaceFeature;
  children: ReactNode;
  fallbackPath?: string;
}

export function WorkspaceFeatureRoute({
  feature,
  children,
  fallbackPath = "/",
}: WorkspaceFeatureRouteProps) {
  const { account } = useAuth();
  const { context, loading, error, refresh } = useOrganizationWorkspace();

  if (!account) {
    return <Navigate to={fallbackPath} replace />;
  }

  if (loading) {
    return (
      <main className="management-page" role="status" aria-live="polite">
        Loading authorized workspace…
      </main>
    );
  }

  if (!context) {
    return (
      <main className="management-page" role="alert" aria-live="assertive">
        <section className="manager-workspace-state manager-workspace-state--error">
          <div>
            <strong>Workspace access is temporarily unavailable.</strong>
            <p>{error || "The workspace context could not be loaded."}</p>
          </div>
          <button type="button" onClick={refresh}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  return context.features[feature]
    ? children
    : <Navigate to={fallbackPath} replace />;
}
