import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import type { OrganizationUnitNode } from "../../types/organization-v3";

interface OrganizationTreeProps {
  node: OrganizationUnitNode;
  depth: number;
  selectedUnitId: string | null;
  expandedIds: Set<string>;
  forceExpanded: boolean;
  onSelect: (unitId: string) => void;
  onToggle: (unitId: string) => void;
}

export function OrganizationTree({
  node,
  depth,
  selectedUnitId,
  expandedIds,
  forceExpanded,
  onSelect,
  onToggle,
}: OrganizationTreeProps) {
  const { t } = useTranslation("organization");
  const hasChildren = node.children.length > 0;
  const expanded = forceExpanded || expandedIds.has(node.id);

  return (
    <div className="organization-tree-branch" role="none">
      <div
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={hasChildren ? expanded : undefined}
        className={
          selectedUnitId === node.id
            ? "organization-tree-row is-selected"
            : "organization-tree-row"
        }
        style={{
          "--organization-indent": `${Math.min(depth, 6) * 0.65}rem`,
        } as CSSProperties}
      >
        <button
          type="button"
          className="organization-tree-toggle"
          onClick={() => onToggle(node.id)}
          disabled={!hasChildren}
          aria-expanded={hasChildren ? expanded : undefined}
          aria-label={
            hasChildren
              ? expanded
                ? t("tree.collapse", { name: node.name })
                : t("tree.expand", { name: node.name })
              : undefined
          }
        >
          {hasChildren ? (expanded ? "−" : "+") : "·"}
        </button>

        <button
          type="button"
          className="organization-tree-select"
          onClick={() => onSelect(node.id)}
        >
          <span className="organization-tree-type">
            {node.orgUnitType.name}
          </span>
          <span className="organization-tree-identity">
            <strong>{node.name}</strong>
            <small>{node.code}</small>
          </span>
          <span
            className={
              node.isActive
                ? "organization-status is-active"
                : "organization-status"
            }
          >
            {node.isActive ? t("common.active") : t("common.inactive")}
          </span>
          <span className="organization-tree-counts">
            <small>{t("tree.people", { count: node._count.memberships })}</small>
            <small>
              {t("tree.leaders", {
                count: node._count.leadershipAssignments,
              })}
            </small>
          </span>
        </button>
      </div>

      {hasChildren && expanded && (
        <div className="organization-tree-children" role="group">
          {node.children.map((child) => (
            <OrganizationTree
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedUnitId={selectedUnitId}
              expandedIds={expandedIds}
              forceExpanded={forceExpanded}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
