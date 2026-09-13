import { Navigate,} from "react-router";
import { useAuth } from "../context/AuthContext";
import { getAccountHomePath} from "../utils/get-account-home-path";

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
      to={getAccountHomePath(account.accountClass)}
      replace
    />
  );
}