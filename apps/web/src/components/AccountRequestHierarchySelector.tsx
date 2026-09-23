import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { AccountRequestOrgUnit } from "../types/account-request";

type FormalOrgUnitTypeCode = "DIVISION" | "DEPARTMENT" | "SECTION" | "UNIT";

const FORMAL_LEVELS: Array<{
  code: FormalOrgUnitTypeCode;
  labelKey:
    | "form.v3.division"
    | "form.v3.department"
    | "form.v3.section"
    | "form.v3.unit";
  selectKey:
    | "form.v3.selectDivision"
    | "form.v3.selectDepartment"
    | "form.v3.selectSection"
    | "form.v3.selectUnit";
}> = [
  {
    code: "DIVISION",
    labelKey: "form.v3.division",
    selectKey: "form.v3.selectDivision",
  },
  {
    code: "DEPARTMENT",
    labelKey: "form.v3.department",
    selectKey: "form.v3.selectDepartment",
  },
  {
    code: "SECTION",
    labelKey: "form.v3.section",
    selectKey: "form.v3.selectSection",
  },
  {
    code: "UNIT",
    labelKey: "form.v3.unit",
    selectKey: "form.v3.selectUnit",
  },
];

function formalLevelIndex(unit: AccountRequestOrgUnit): number {
  return FORMAL_LEVELS.findIndex(
    (level) => level.code === unit.orgUnitType?.code,
  );
}

function rootUnits(units: AccountRequestOrgUnit[]): AccountRequestOrgUnit[] {
  const ids = new Set(units.map((unit) => unit.id));
  return units.filter(
    (unit) => !unit.parentOrgUnitId || !ids.has(unit.parentOrgUnitId),
  );
}

interface AccountRequestHierarchySelectorProps {
  units: AccountRequestOrgUnit[];
  value: string;
  onChange: (orgUnitId: string) => void;
  disabled?: boolean;
}

export function AccountRequestHierarchySelector({
  units,
  value,
  onChange,
  disabled = false,
}: AccountRequestHierarchySelectorProps) {
  const { t } = useTranslation("requests");

  const { roots, startIndex, selectedByLevel } = useMemo(() => {
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const visibleRoots = rootUnits(units).filter(
      (unit) => formalLevelIndex(unit) >= 0,
    );
    const firstLevel = visibleRoots.reduce((minimum, unit) => {
      const index = formalLevelIndex(unit);
      return minimum === -1 || index < minimum ? index : minimum;
    }, -1);

    const selected = new Map<number, string>();
    const visited = new Set<string>();
    let current = value ? unitById.get(value) : undefined;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const levelIndex = formalLevelIndex(current);
      if (levelIndex >= 0) {
        selected.set(levelIndex, current.id);
      }
      current = current.parentOrgUnitId
        ? unitById.get(current.parentOrgUnitId)
        : undefined;
    }

    return {
      roots: visibleRoots,
      startIndex: firstLevel,
      selectedByLevel: selected,
    };
  }, [units, value]);

  if (startIndex < 0) {
    return null;
  }

  const selectors: Array<{
    levelIndex: number;
    options: AccountRequestOrgUnit[];
    parentId: string | null;
  }> = [];

  const rootOptions = roots.filter(
    (unit) => formalLevelIndex(unit) === startIndex,
  );
  selectors.push({ levelIndex: startIndex, options: rootOptions, parentId: null });

  let parentId = selectedByLevel.get(startIndex) ?? "";
  let parentLevelIndex = startIndex;

  while (parentId) {
    let nextSelector:
      | {
          levelIndex: number;
          options: AccountRequestOrgUnit[];
          parentId: string;
        }
      | undefined;

    for (
      let levelIndex = parentLevelIndex + 1;
      levelIndex < FORMAL_LEVELS.length;
      levelIndex += 1
    ) {
      const levelCode = FORMAL_LEVELS[levelIndex]?.code;
      const options = units.filter(
        (unit) =>
          unit.parentOrgUnitId === parentId &&
          unit.orgUnitType?.code === levelCode,
      );
      if (options.length > 0) {
        nextSelector = { levelIndex, options, parentId };
        break;
      }
    }

    if (!nextSelector) {
      break;
    }

    selectors.push(nextSelector);
    const selectedChildId =
      selectedByLevel.get(nextSelector.levelIndex) ?? "";
    if (!selectedChildId) {
      break;
    }

    parentId = selectedChildId;
    parentLevelIndex = nextSelector.levelIndex;
  }

  return (
    <>
      {selectors.map(({ levelIndex, options, parentId: selectorParentId }) => {
        const level = FORMAL_LEVELS[levelIndex];
        if (!level) return null;

        const selectedId = selectedByLevel.get(levelIndex) ?? "";
        return (
          <label key={level.code}>
            <span>{t(level.labelKey)}</span>
            <select
              value={selectedId}
              onChange={(event) => {
                const nextId = event.target.value;
                if (nextId) {
                  onChange(nextId);
                  return;
                }
                onChange(selectorParentId ?? "");
              }}
              disabled={disabled}
              required={selectorParentId === null}
            >
              <option value="">{t(level.selectKey)}</option>
              {options.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.code})
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </>
  );
}
