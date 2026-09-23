import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import type { OrganizationUnitNode } from "../../types/organization-v3";

interface OrganizationTreeProps {
  node: OrganizationUnitNode;
  depth: number;
  expandedIds: Set<string>;
  forceExpanded: boolean;
  peopleCountByUnit: ReadonlyMap<string, number>;
  onSelect: (unitId: string) => void;
  onToggle: (unitId: string) => void;
}

export function OrganizationTree({
  node,
  depth,
  expandedIds,
  forceExpanded,
  peopleCountByUnit,
  onSelect,
  onToggle,
}: OrganizationTreeProps) {
  const { t } = useTranslation("organization");
  const hasChildren = node.children.length > 0;
  const expanded = forceExpanded || expandedIds.has(node.id);
  const directPeople = peopleCountByUnit.get(node.id) ?? 0;

  return (
    <article
      className="organization-hierarchy-item"
      style={
        {
          "--organization-depth": Math.min(depth, 6),
        } as CSSProperties
      }
    >
      <div className="organization-hierarchy-item__summary">
        <button
          type="button"
          className="organization-hierarchy-item__badge"
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
          <span aria-hidden="true">{hasChildren ? (expanded ? "−" : "+") : "•"}</span>
        </button>

        <span className="organization-hierarchy-item__identity">
          <strong>{node.name}</strong>
          <small>
            {node.orgUnitType.name} · {node.code}
          </small>
        </span>

        <div className="organization-hierarchy-item__context" aria-label={node.name}>
          <span>{t("tree.people", { count: directPeople })}</span>
          <span>{t("tree.branches", { count: node.children.length })}</span>
          {node.deletionProtected && (
            <span className="organization-protection-badge">
              {t("tree.protected", { count: node.linkedRecordCount })}
            </span>
          )}
        </div>

        <div className="organization-hierarchy-item__row-actions">
          {hasChildren && (
            <button
              type="button"
              className="organization-action organization-action--quiet"
              onClick={() => onToggle(node.id)}
              aria-expanded={expanded}
            >
              {expanded
                ? t("tree.hideBranches")
                : t("tree.viewBranches", { count: node.children.length })}
            </button>
          )}
          <button
            type="button"
            className="organization-action organization-action--toggle"
            onClick={() => onSelect(node.id)}
          >
            {t("tree.manage")}
          </button>
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="organization-hierarchy-item__details" role="group">
          <div className="organization-hierarchy-children">
            {node.children.map((child) => (
              <OrganizationTree
                key={child.id}
                node={child}
                depth={depth + 1}
                expandedIds={expandedIds}
                forceExpanded={forceExpanded}
                peopleCountByUnit={peopleCountByUnit}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
