import {
  Navigate,
} from "react-router";
import type {
  ReactNode,
} from "react";
import { useAuth } from "../context/AuthContext";

interface PublicRouteProps {
  children: ReactNode;
}

export function PublicRoute({
  children,
}: PublicRouteProps) {
  const {
    account,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading NT Message...</p>
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