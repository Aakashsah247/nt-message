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
  } = useAuth();

  // Public auth pages stay usable while refresh-cookie recovery runs in the background.
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
