import type { AccountClass } from "../types/auth";

export function getAccountHomePath(accountClass: AccountClass): string {
  return accountClass === "SUPER_ADMIN" ? "/super-admin" : "/dashboard";
}
