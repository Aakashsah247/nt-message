import { Navigate,} from "react-router";
import { useAuth } from "../context/AuthContext";
import { getRoleHomePath} from "../utils/get-role-home-path";

export function RoleHome() {
  const { account } = useAuth();

  if (!account) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  return (
    <Navigate
      to={getRoleHomePath(account.role)}
      replace
    />
  );
}