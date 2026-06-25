import type {
  AccountRole,
} from "../types/auth";

export function getRoleHomePath(
  role: AccountRole,
): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/super-admin";

    case "SENIOR_MANAGEMENT":
      return "/senior-management";

    case "TEAM_MANAGER":
      return "/team-manager";

    case "EMPLOYEE":
      return "/messages";
  }
}