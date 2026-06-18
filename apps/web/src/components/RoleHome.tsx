import {
  Navigate,
} from "react-router";
import { useAuth } from "../context/AuthContext";

export function RoleHome() {
  const { account } = useAuth();

  return (
    <Navigate
      to={
        account?.role === "ADMIN"
          ? "/admin"
          : "/messages"
      }
      replace
    />
  );
}