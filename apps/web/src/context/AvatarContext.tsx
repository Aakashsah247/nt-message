import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { useAuth } from "./AuthContext";
import { listDirectoryEmployees } from "../services/directory.service";
import {
  createDirectoryProfilePhotoObjectUrl,
  createMessagingProfilePhotoObjectUrl,
} from "../services/messaging.service";

const UNKNOWN_PHOTO_KEY = "__protected-photo-check__";
const NO_PHOTO_KEY = "__protected-photo-absent__";

interface AvatarContextValue {
  accountUrls: Record<string, string>;
  employeeUrls: Record<string, string>;
  employeeIdsByEmail: Record<string, string | null>;
  accountRevision: number;
  employeeRevision: number;
  ensureAccountAvatar: (accountId: string, photoKey?: string | null) => void;
  ensureEmployeeAvatar: (employeeId: string, photoKey?: string | null) => void;
  ensureEmployeeIdByEmail: (officialEmail: string) => void;
  refreshAvatar: (identity: AvatarRefreshIdentity) => void;
}

interface AvatarProviderProps {
  children: ReactNode;
}

export interface AvatarRefreshIdentity {
  accountId?: string | null;
  employeeId?: string | null;
}

const AvatarContext = createContext<AvatarContextValue | null>(null);

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function revokeUrl(url: string | undefined): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

export function AvatarProvider({ children }: AvatarProviderProps) {
  const { accessToken } = useAuth();
  const [accountUrls, setAccountUrls] = useState<Record<string, string>>({});
  const [employeeUrls, setEmployeeUrls] = useState<Record<string, string>>({});
  const [employeeIdsByEmail, setEmployeeIdsByEmail] = useState<
    Record<string, string | null>
  >({});
  const [accountRevision, setAccountRevision] = useState(0);
  const [employeeRevision, setEmployeeRevision] = useState(0);

  const generationRef = useRef(0);
  const accountVersionsRef = useRef<Record<string, number>>({});
  const employeeVersionsRef = useRef<Record<string, number>>({});
  const accountUrlsRef = useRef<Record<string, string>>({});
  const employeeUrlsRef = useRef<Record<string, string>>({});
  const employeeIdsByEmailRef = useRef<Record<string, string | null>>({});
  const accountCacheKeysRef = useRef<Record<string, string>>({});
  const employeeCacheKeysRef = useRef<Record<string, string>>({});
  const pendingAccountLoadsRef = useRef<Partial<Record<string, Promise<void>>>>({});
  const pendingEmployeeLoadsRef = useRef<Partial<Record<string, Promise<void>>>>({});
  const pendingEmailResolutionsRef = useRef<Partial<Record<string, Promise<void>>>>({});

  useEffect(() => {
    accountUrlsRef.current = accountUrls;
  }, [accountUrls]);

  useEffect(() => {
    employeeUrlsRef.current = employeeUrls;
  }, [employeeUrls]);

  useEffect(() => {
    employeeIdsByEmailRef.current = employeeIdsByEmail;
  }, [employeeIdsByEmail]);

  const resetAvatarRegistry = useCallback((updateReactState: boolean) => {
    generationRef.current += 1;

    Object.values(accountUrlsRef.current).forEach(revokeUrl);
    Object.values(employeeUrlsRef.current).forEach(revokeUrl);

    accountUrlsRef.current = {};
    employeeUrlsRef.current = {};
    employeeIdsByEmailRef.current = {};
    accountVersionsRef.current = {};
    employeeVersionsRef.current = {};
    accountCacheKeysRef.current = {};
    employeeCacheKeysRef.current = {};
    pendingAccountLoadsRef.current = {};
    pendingEmployeeLoadsRef.current = {};
    pendingEmailResolutionsRef.current = {};

    if (updateReactState) {
      setAccountUrls({});
      setEmployeeUrls({});
      setEmployeeIdsByEmail({});
      setAccountRevision((current) => current + 1);
      setEmployeeRevision((current) => current + 1);
    }
  }, []);

  useEffect(() => {
    // Access tokens rotate during long sessions. Re-fetch protected images with
    // the active token instead of retaining URLs created by an older session.
    resetAvatarRegistry(true);
  }, [accessToken, resetAvatarRegistry]);

  useEffect(() => {
    return () => resetAvatarRegistry(false);
  }, [resetAvatarRegistry]);

  const ensureAccountAvatar = useCallback((
    accountId: string,
    photoKey?: string | null,
  ) => {
    if (!accessToken || !accountId) {
      return;
    }

    const requestedKey =
      photoKey === null ? NO_PHOTO_KEY : photoKey ?? UNKNOWN_PHOTO_KEY;
    if (accountCacheKeysRef.current[accountId] === requestedKey) {
      return;
    }

    if (photoKey === null) {
      // Known no-photo accounts use initials without issuing a predictable 404 request.
      revokeUrl(accountUrlsRef.current[accountId]);
      accountCacheKeysRef.current[accountId] = requestedKey;
      setAccountUrls((current) => {
        if (!current[accountId]) {
          return current;
        }

        const { [accountId]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
      return;
    }

    const generation = generationRef.current;
    const identityVersion = accountVersionsRef.current[accountId] ?? 0;
    const pendingKey = `${accountId}:${requestedKey}:${identityVersion}`;

    if (pendingAccountLoadsRef.current[pendingKey]) {
      return;
    }

    let request: Promise<void>;
    request = createMessagingProfilePhotoObjectUrl(accessToken, accountId)
      .then((url) => {
        if (
          generation !== generationRef.current ||
          identityVersion !== (accountVersionsRef.current[accountId] ?? 0)
        ) {
          revokeUrl(url ?? undefined);
          return;
        }

        revokeUrl(accountUrlsRef.current[accountId]);
        accountCacheKeysRef.current[accountId] = requestedKey;
        setAccountUrls((current) => {
          if (url) {
            return { ...current, [accountId]: url };
          }

          if (!current[accountId]) {
            return current;
          }

          const { [accountId]: _removed, ...rest } = current;
          void _removed;
          return rest;
        });
      })
      .catch(() => {
        if (
          generation !== generationRef.current ||
          identityVersion !== (accountVersionsRef.current[accountId] ?? 0)
        ) {
          return;
        }

        revokeUrl(accountUrlsRef.current[accountId]);
        accountCacheKeysRef.current[accountId] = requestedKey;
        setAccountUrls((current) => {
          if (!current[accountId]) {
            return current;
          }

          const { [accountId]: _removed, ...rest } = current;
          void _removed;
          return rest;
        });
      })
      .finally(() => {
        if (pendingAccountLoadsRef.current[pendingKey] === request) {
          delete pendingAccountLoadsRef.current[pendingKey];
        }
      });

    pendingAccountLoadsRef.current[pendingKey] = request;
  }, [accessToken]);

  const ensureEmployeeAvatar = useCallback((
    employeeId: string,
    photoKey?: string | null,
  ) => {
    if (!accessToken || !employeeId) {
      return;
    }

    const requestedKey =
      photoKey === null ? NO_PHOTO_KEY : photoKey ?? UNKNOWN_PHOTO_KEY;
    if (employeeCacheKeysRef.current[employeeId] === requestedKey) {
      return;
    }

    if (photoKey === null) {
      // Directory metadata already proves whether a custom avatar exists.
      revokeUrl(employeeUrlsRef.current[employeeId]);
      employeeCacheKeysRef.current[employeeId] = requestedKey;
      setEmployeeUrls((current) => {
        if (!current[employeeId]) {
          return current;
        }

        const { [employeeId]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
      return;
    }

    const generation = generationRef.current;
    const identityVersion = employeeVersionsRef.current[employeeId] ?? 0;
    const pendingKey = `${employeeId}:${requestedKey}:${identityVersion}`;

    if (pendingEmployeeLoadsRef.current[pendingKey]) {
      return;
    }

    let request: Promise<void>;
    request = createDirectoryProfilePhotoObjectUrl(accessToken, employeeId)
      .then((url) => {
        if (
          generation !== generationRef.current ||
          identityVersion !== (employeeVersionsRef.current[employeeId] ?? 0)
        ) {
          revokeUrl(url ?? undefined);
          return;
        }

        revokeUrl(employeeUrlsRef.current[employeeId]);
        employeeCacheKeysRef.current[employeeId] = requestedKey;
        setEmployeeUrls((current) => {
          if (url) {
            return { ...current, [employeeId]: url };
          }

          if (!current[employeeId]) {
            return current;
          }

          const { [employeeId]: _removed, ...rest } = current;
          void _removed;
          return rest;
        });
      })
      .catch(() => {
        if (
          generation !== generationRef.current ||
          identityVersion !== (employeeVersionsRef.current[employeeId] ?? 0)
        ) {
          return;
        }

        revokeUrl(employeeUrlsRef.current[employeeId]);
        employeeCacheKeysRef.current[employeeId] = requestedKey;
        setEmployeeUrls((current) => {
          if (!current[employeeId]) {
            return current;
          }

          const { [employeeId]: _removed, ...rest } = current;
          void _removed;
          return rest;
        });
      })
      .finally(() => {
        if (pendingEmployeeLoadsRef.current[pendingKey] === request) {
          delete pendingEmployeeLoadsRef.current[pendingKey];
        }
      });

    pendingEmployeeLoadsRef.current[pendingKey] = request;
  }, [accessToken]);

  const ensureEmployeeIdByEmail = useCallback((officialEmail: string) => {
    if (!accessToken) {
      return;
    }

    const normalizedEmail = normalizeEmail(officialEmail);
    if (
      !normalizedEmail ||
      Object.prototype.hasOwnProperty.call(
        employeeIdsByEmailRef.current,
        normalizedEmail,
      )
    ) {
      return;
    }

    if (pendingEmailResolutionsRef.current[normalizedEmail]) {
      return;
    }

    const generation = generationRef.current;

    // Activated request rows do not expose employeeId. Resolve the protected
    // directory identity once and reuse it for desktop and mobile queue cards.
    let request: Promise<void>;
    request = listDirectoryEmployees(accessToken, {
      search: normalizedEmail,
      recordStatus: "CURRENT",
      page: 1,
      limit: 5,
    })
      .then((response) => {
        if (generation !== generationRef.current) {
          return;
        }

        const employee = response.data.find(
          (candidate) => normalizeEmail(candidate.officialEmail ?? "") === normalizedEmail,
        );
        const employeeId = employee?.id ?? null;

        employeeIdsByEmailRef.current = {
          ...employeeIdsByEmailRef.current,
          [normalizedEmail]: employeeId,
        };
        setEmployeeIdsByEmail(employeeIdsByEmailRef.current);
      })
      .catch(() => {
        if (generation !== generationRef.current) {
          return;
        }

        employeeIdsByEmailRef.current = {
          ...employeeIdsByEmailRef.current,
          [normalizedEmail]: null,
        };
        setEmployeeIdsByEmail(employeeIdsByEmailRef.current);
      })
      .finally(() => {
        if (pendingEmailResolutionsRef.current[normalizedEmail] === request) {
          delete pendingEmailResolutionsRef.current[normalizedEmail];
        }
      });

    pendingEmailResolutionsRef.current[normalizedEmail] = request;
  }, [accessToken]);

  const refreshAvatar = useCallback((identity: AvatarRefreshIdentity) => {
    const accountId = identity.accountId ?? null;
    const employeeId = identity.employeeId ?? null;

    if (accountId) {
      revokeUrl(accountUrlsRef.current[accountId]);
      accountVersionsRef.current[accountId] =
        (accountVersionsRef.current[accountId] ?? 0) + 1;
      delete accountCacheKeysRef.current[accountId];

      setAccountUrls((current) => {
        if (!current[accountId]) {
          return current;
        }

        const { [accountId]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
      setAccountRevision((current) => current + 1);
    }

    if (employeeId) {
      revokeUrl(employeeUrlsRef.current[employeeId]);
      employeeVersionsRef.current[employeeId] =
        (employeeVersionsRef.current[employeeId] ?? 0) + 1;
      delete employeeCacheKeysRef.current[employeeId];

      setEmployeeUrls((current) => {
        if (!current[employeeId]) {
          return current;
        }

        const { [employeeId]: _removed, ...rest } = current;
        void _removed;
        return rest;
      });
      setEmployeeRevision((current) => current + 1);
    }
  }, []);

  const value = useMemo<AvatarContextValue>(() => ({
    accountUrls,
    employeeUrls,
    employeeIdsByEmail,
    accountRevision,
    employeeRevision,
    ensureAccountAvatar,
    ensureEmployeeAvatar,
    ensureEmployeeIdByEmail,
    refreshAvatar,
  }), [
    accountRevision,
    accountUrls,
    employeeIdsByEmail,
    employeeRevision,
    employeeUrls,
    ensureAccountAvatar,
    ensureEmployeeAvatar,
    ensureEmployeeIdByEmail,
    refreshAvatar,
  ]);

  return (
    <AvatarContext.Provider value={value}>
      {children}
    </AvatarContext.Provider>
  );
}

// The provider and hook intentionally share one module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAvatarRegistry(): AvatarContextValue {
  const context = useContext(AvatarContext);

  if (!context) {
    throw new Error("useAvatarRegistry must be used inside AvatarProvider.");
  }

  return context;
}
