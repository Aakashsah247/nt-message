import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import type {
  ReactNode,
} from "react";
import {
  loginUser,
  logoutAuth,
  refreshAuth,
} from "../services/auth.service";
import type {
  AuthAccount,
  AuthResponse,
} from "../types/auth";

interface AuthContextValue {
  account: AuthAccount | null;
  accessToken: string | null;
  loading: boolean;

  login: (
    identifier: string,
    password: string,
  ) => Promise<AuthAccount>;

  logout: () => Promise<void>;
}

const AuthContext =
  createContext<AuthContextValue | null>(
    null,
  );

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [account, setAccount] =
    useState<AuthAccount | null>(null);

  const [accessToken, setAccessToken] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  function saveSession(
    result: AuthResponse,
  ): void {
    setAccount(result.account);
    setAccessToken(result.accessToken);
  }

  function clearSession(): void {
    setAccount(null);
    setAccessToken(null);
  }

  useEffect(() => {
    let active = true;

    refreshAuth()
      .then((result) => {
        if (active) {
          saveSession(result);
        }
      })
      .catch(() => {
        if (active) {
          clearSession();
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function login(
    identifier: string,
    password: string,
  ): Promise<AuthAccount> {
    const result =
      await loginUser(
        identifier,
        password,
      );

    saveSession(result);

    return result.account;
  }

  async function logout():
    Promise<void> {
    try {
      await logoutAuth();
    } finally {
      clearSession();
    }
  }

  return (
    <AuthContext.Provider
      value={{
        account,
        accessToken,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth():
  AuthContextValue {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider.",
    );
  }

  return context;
}