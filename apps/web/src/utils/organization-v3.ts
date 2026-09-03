import type { OrganizationUnitNode } from "../types/organization-v3";

export type OrganizationStatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

export function normalizeOrganizationCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeOrganizationName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function parseOrganizationSortOrder(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function flattenTree(
  nodes: OrganizationUnitNode[],
): OrganizationUnitNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

export function findUnit(
  nodes: OrganizationUnitNode[],
  unitId: string | null,
): OrganizationUnitNode | null {
  if (!unitId) {
    return null;
  }

  for (const node of nodes) {
    if (node.id === unitId) {
      return node;
    }

    const child = findUnit(node.children, unitId);
    if (child) {
      return child;
    }
  }

  return null;
}

export function collectDescendantIds(
  node: OrganizationUnitNode,
): Set<string> {
  const ids = new Set<string>();

  for (const child of node.children) {
    ids.add(child.id);
    for (const descendantId of collectDescendantIds(child)) {
      ids.add(descendantId);
    }
  }

  return ids;
}

export function filterTree(
  nodes: OrganizationUnitNode[],
  searchTerm: string,
  statusFilter: OrganizationStatusFilter,
): OrganizationUnitNode[] {
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, searchTerm, statusFilter);
    const searchMatches =
      searchTerm.length === 0 ||
      node.name.toLowerCase().includes(searchTerm) ||
      node.code.toLowerCase().includes(searchTerm) ||
      node.orgUnitType.name.toLowerCase().includes(searchTerm) ||
      node.orgUnitType.code.toLowerCase().includes(searchTerm);
    const statusMatches =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && node.isActive) ||
      (statusFilter === "INACTIVE" && !node.isActive);

    if ((searchMatches && statusMatches) || children.length > 0) {
      return [{ ...node, children }];
    }

    return [];
  });
}

export function formatOrganizationDate(
  value: string,
  locale: string,
  fallback: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
