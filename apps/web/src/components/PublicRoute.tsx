import {
  Navigate,
} from "react-router";
import type {
  ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";

interface PublicRouteProps {
  children: ReactNode;
}

export function PublicRoute({
  children,
}: PublicRouteProps) {
  const { t } = useTranslation("common");
  const {
    account,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>{t("loading.loadingNtMessage")}</p>
      </div>
    );
  }

  if (account) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return children;
}
