import {
  Navigate,
} from "react-router";
import type {
  ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { ActivityTracker } from "./ActivityTracker";
import { useAuth } from "../context/AuthContext";
import type {
  AccountClass,
} from "../types/auth";

interface ProtectedRouteProps {
  children: ReactNode;
  accountClasses?: AccountClass[];
}

export function ProtectedRoute({
  children,
  accountClasses,
}: ProtectedRouteProps) {
  const { t } = useTranslation("common");
  const {
    account,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>{t("loading.checkingSession")}</p>
      </div>
    );
  }

  if (!account) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (
    accountClasses &&
    !accountClasses.includes(account.accountClass)
  ) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return (
    <>
      <ActivityTracker />
      {children}
    </>
  );
}
