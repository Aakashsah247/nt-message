import { useTranslation } from "react-i18next";
import type { OperationalTeamOrgUnitOption } from "../../types/team-management";

const ORDER = ["DIVISION", "DEPARTMENT", "SECTION", "UNIT"] as const;
type FormalType = (typeof ORDER)[number];

interface Props {
  units: OperationalTeamOrgUnitOption[];
  value: string;
  onChange: (orgUnitId: string) => void;
  allowAll?: boolean;
  disabled?: boolean;
}

export function TeamHierarchySelector({ units, value, onChange, allowAll = false, disabled = false }: Props) {
  const { t } = useTranslation("teams");
  const labels: Record<FormalType, string> = { DIVISION: t("common.division"), DEPARTMENT: t("common.department"), SECTION: t("common.section"), UNIT: t("common.unit") };
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const selected = byId.get(value) ?? null;
  const selectedPath = new Set<string>();
  let cursor = selected;
  while (cursor) {
    selectedPath.add(cursor.id);
    cursor = cursor.parentOrgUnitId ? byId.get(cursor.parentOrgUnitId) ?? null : null;
  }

  const choiceFor = (type: FormalType) =>
    units.find((unit) => unit.orgUnitType.code === type && selectedPath.has(unit.id))?.id ?? "";

  const selectedByType: Record<FormalType, string> = {
    DIVISION: choiceFor("DIVISION"),
    DEPARTMENT: choiceFor("DEPARTMENT"),
    SECTION: choiceFor("SECTION"),
    UNIT: choiceFor("UNIT"),
  };

  const unitIds = new Set(units.map((unit) => unit.id));
  const roots = units.filter((unit) => !unit.parentOrgUnitId || !unitIds.has(unit.parentOrgUnitId));
  const rootIndex = roots.reduce<number>((lowest, unit) => {
    const index = ORDER.indexOf(unit.orgUnitType.code as FormalType);
    return index >= 0 ? Math.min(lowest, index) : lowest;
  }, ORDER.length);

  function options(type: FormalType): OperationalTeamOrgUnitOption[] {
    const index = ORDER.indexOf(type);
    if (index === rootIndex) return roots.filter((unit) => unit.orgUnitType.code === type);
    if (index < rootIndex || index === 0) return [];
    const parentType = ORDER[index - 1];
    const parentId = selectedByType[parentType];
    if (!parentId) return [];
    return units.filter((unit) => unit.orgUnitType.code === type && unit.parentOrgUnitId === parentId);
  }

  function choose(type: FormalType, nextId: string) {
    if (!nextId) {
      const index = ORDER.indexOf(type);
      if (index === 0 && allowAll) onChange("");
      else {
        const parentType = ORDER[index - 1];
        onChange(index > 0 ? selectedByType[parentType] : "");
      }
      return;
    }
    onChange(nextId);
  }

  const firstAvailable = rootIndex < ORDER.length ? rootIndex : ORDER.findIndex((type) => options(type).length > 0 || selectedByType[type]);

  return (
    <div className="team-hierarchy-selector">
      {ORDER.map((type, index) => {
        const items = options(type);
        const current = selectedByType[type];
        const shouldShow = index === firstAvailable || items.length > 0 || Boolean(current);
        if (!shouldShow) return null;
        return (
          <label key={type}>
            <span>{labels[type]}</span>
            <select
              value={current}
              disabled={disabled}
              onChange={(event) => choose(type, event.target.value)}
            >
              <option value="">{allowAll && index === firstAvailable ? t("simple.allLevel", { level: labels[type] }) : t("simple.chooseLevel", { level: labels[type] })}</option>
              {items.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </label>
        );
      })}
    </div>
  );
}
