import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { getOrganizationWorkspaceContext } from "../services/organization-v3.service";
import type { OrganizationWorkspaceContext } from "../types/organization-v3";
import {
  OrganizationWorkspaceContextValue,
  type OrganizationWorkspaceValue,
} from "./organization-workspace-context";
import { useAuth } from "./AuthContext";

interface OrganizationWorkspaceState {
  accountId: string;
  context: OrganizationWorkspaceContext | null;
  attemptedAccessToken: string;
  error: string;
}

interface OrganizationWorkspaceProviderProps {
  children: ReactNode;
}

export function OrganizationWorkspaceProvider({
  children,
}: OrganizationWorkspaceProviderProps) {
  const { account, accessToken } = useAuth();
  const accountId = account?.id ?? null;
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<OrganizationWorkspaceState | null>(null);

  useEffect(() => {
    if (!accountId || !accessToken) {
      return;
    }

    let active = true;

    void getOrganizationWorkspaceContext(accessToken)
      .then((context) => {
        if (!active) {
          return;
        }

        setResult({
          accountId,
          context,
          attemptedAccessToken: accessToken,
          error: "",
        });
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        const error =
          requestError instanceof Error
            ? requestError.message
            : "Workspace access could not be loaded.";

        setResult((current) => ({
          accountId,
          context: current?.accountId === accountId ? current.context : null,
          attemptedAccessToken: accessToken,
          error,
        }));
      });

    return () => {
      active = false;
    };
  }, [accessToken, accountId, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  const value = useMemo<OrganizationWorkspaceValue>(() => {
    if (!accountId || !accessToken) {
      return {
        context: null,
        loading: false,
        refreshing: false,
        error: "",
        refresh,
      };
    }

    const currentResult = result?.accountId === accountId ? result : null;
    const context = currentResult?.context ?? null;
    const attemptedCurrentToken =
      currentResult?.attemptedAccessToken === accessToken;

    return {
      context,
      loading: !context && !attemptedCurrentToken,
      refreshing: Boolean(context && !attemptedCurrentToken),
      error: attemptedCurrentToken ? currentResult?.error ?? "" : "",
      refresh,
    };
  }, [accessToken, accountId, refresh, result]);

  return (
    <OrganizationWorkspaceContextValue.Provider value={value}>
      {children}
    </OrganizationWorkspaceContextValue.Provider>
  );
}
