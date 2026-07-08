import {
  Navigate,
} from "react-router";
import type {
  ReactNode,
} from "react";
import { ActivityTracker } from "./ActivityTracker";
import { useAuth } from "../context/AuthContext";
import type {
  AccountRole,
} from "../types/auth";

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: AccountRole[];
}

export function ProtectedRoute({
  children,
  roles,
}: ProtectedRouteProps) {
  const {
    account,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Checking session...</p>
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
    roles &&
    !roles.includes(account.role)
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
