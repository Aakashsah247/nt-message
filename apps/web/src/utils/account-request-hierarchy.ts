import type {
  AccountRequestOrgUnit,
  ManagerRequestContextResponse,
} from "../types/account-request";

function rootUnits(units: AccountRequestOrgUnit[]): AccountRequestOrgUnit[] {
  const ids = new Set(units.map((unit) => unit.id));
  return units.filter(
    (unit) => !unit.parentOrgUnitId || !ids.has(unit.parentOrgUnitId),
  );
}

export function getDefaultAccountRequestTargetId(
  requestContext: ManagerRequestContextResponse,
): string {
  if (requestContext.authority.kind === "OFFICE_HEAD") {
    return "";
  }

  const roots = rootUnits(requestContext.orgUnits);
  return roots.length === 1 ? (roots[0]?.id ?? "") : "";
}
