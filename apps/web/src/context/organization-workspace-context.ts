import { createContext, useContext } from "react";

import type { OrganizationWorkspaceContext } from "../types/organization-v3";

export interface OrganizationWorkspaceValue {
  context: OrganizationWorkspaceContext | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
  refresh: () => void;
}

export const OrganizationWorkspaceContextValue =
  createContext<OrganizationWorkspaceValue | null>(null);

export function useOrganizationWorkspace(): OrganizationWorkspaceValue {
  const context = useContext(OrganizationWorkspaceContextValue);

  if (!context) {
    throw new Error(
      "useOrganizationWorkspace must be used inside OrganizationWorkspaceProvider.",
    );
  }

  return context;
}
