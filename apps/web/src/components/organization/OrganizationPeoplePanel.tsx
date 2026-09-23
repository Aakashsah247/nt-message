import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  assignOrganizationMembership,
  getOrganizationPeopleActions,
  transferPrimaryOrganizationMembership,
} from "../../services/organization-v3.service";
import { flattenTree } from "../../utils/organization-v3";
import {
  normalizeOrganizationReason,
  toOptionalOrganizationIso,
} from "../../utils/organization-people";
import type {
  OrganizationOfficeDetail,
  OrganizationPeopleAvailableActions,
  OrganizationPersonSummary,
  OrganizationUnitNode,
} from "../../types/organization-v3";

interface OrganizationPeoplePanelProps {
  accessToken: string;
  office: OrganizationOfficeDetail;
  tree: OrganizationUnitNode[];
  unit: OrganizationUnitNode;
  people: OrganizationPersonSummary[];
  onChanged: (message?: string) => void;
}

type PlacementAction = "MOVE" | "ADD" | null;
type ExtraPlacementType = "SECONDARY" | "TEMPORARY";

const OFFICE_SCOPE = "__OFFICE__";

const NO_PEOPLE_ACTIONS: OrganizationPeopleAvailableActions = {
  viewMemberships: false,
  transferPrimary: false,
  assignSecondary: false,
  viewLeadership: false,
  assignLeadership: false,
  assignActing: false,
  assignDeputy: false,
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function OrganizationPeoplePanel({
  accessToken,
  office,
  tree,
  unit,
  people,
  onChanged,
}: OrganizationPeoplePanelProps) {
  const { t } = useTranslation("organization");
  const activeUnits = useMemo(
    () => flattenTree(tree).filter((item) => item.isActive),
    [tree],
  );
  const directPeople = useMemo(
    () =>
      people.filter(
        (person) => person.primaryMembership.orgUnit?.id === unit.id,
      ),
    [people, unit.id],
  );

  const [sourceActions, setSourceActions] =
    useState<OrganizationPeopleAvailableActions>(NO_PEOPLE_ACTIONS);
  const [targetActions, setTargetActions] =
    useState<OrganizationPeopleAvailableActions>(NO_PEOPLE_ACTIONS);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [action, setAction] = useState<PlacementAction>(null);
  const [targetScope, setTargetScope] = useState("");
  const [placementType, setPlacementType] =
    useState<ExtraPlacementType>("SECONDARY");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const selectedPerson = directPeople.find(
    (person) => person.employee.id === selectedEmployeeId,
  ) ?? null;
  const targetOrgUnitId =
    targetScope === OFFICE_SCOPE ? null : targetScope || null;
  const canUseCurrentAction =
    action === "MOVE"
      ? sourceActions.transferPrimary && targetActions.transferPrimary
      : action === "ADD"
        ? sourceActions.assignSecondary && targetActions.assignSecondary
        : false;

  function resetEditor(): void {
    setSelectedEmployeeId(null);
    setAction(null);
    setTargetScope("");
    setPlacementType("SECONDARY");
    setEffectiveAt("");
    setEndsAt("");
    setReason("");
    setFormError("");
    setTargetActions(NO_PEOPLE_ACTIONS);
  }

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (!active) {
        return;
      }

      setSelectedEmployeeId(null);
      setAction(null);
      setTargetScope("");
      setPlacementType("SECONDARY");
      setEffectiveAt("");
      setEndsAt("");
      setReason("");
      setFormError("");
      setSourceActions(NO_PEOPLE_ACTIONS);
      setTargetActions(NO_PEOPLE_ACTIONS);
    });

    getOrganizationPeopleActions(accessToken, office.id, unit.id)
      .then((response) => {
        if (active) {
          setSourceActions(response.availableActions);
        }
      })
      .catch(() => {
        if (active) {
          setSourceActions(NO_PEOPLE_ACTIONS);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, office.id, unit.id]);

  useEffect(() => {
    let active = true;

    if (!action || !targetScope) {
      queueMicrotask(() => {
        if (active) {
          setTargetActions(NO_PEOPLE_ACTIONS);
        }
      });

      return () => {
        active = false;
      };
    }

    getOrganizationPeopleActions(accessToken, office.id, targetOrgUnitId)
      .then((response) => {
        if (active) {
          setTargetActions(response.availableActions);
        }
      })
      .catch(() => {
        if (active) {
          setTargetActions(NO_PEOPLE_ACTIONS);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, action, office.id, targetOrgUnitId, targetScope]);

  function openAction(employeeId: string, nextAction: Exclude<PlacementAction, null>): void {
    setSelectedEmployeeId(employeeId);
    setAction(nextAction);
    setTargetScope("");
    setPlacementType("SECONDARY");
    setEffectiveAt("");
    setEndsAt("");
    setReason("");
    setFormError("");
    setTargetActions(NO_PEOPLE_ACTIONS);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedPerson || !action || !targetScope) {
      setFormError(t("people.errors.selection"));
      return;
    }

    const cleanReason = normalizeOrganizationReason(reason);
    if (cleanReason.length < 3) {
      setFormError(t("people.errors.reason"));
      return;
    }

    if (action === "ADD" && placementType === "TEMPORARY" && !endsAt) {
      setFormError(t("people.errors.temporaryEnd"));
      return;
    }

    if (!canUseCurrentAction) {
      setFormError(t("people.errors.targetNotAllowed"));
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const response =
        action === "MOVE"
          ? await transferPrimaryOrganizationMembership(accessToken, office.id, {
              employeeId: selectedPerson.employee.id,
              orgUnitId: targetOrgUnitId,
              effectiveAt: toOptionalOrganizationIso(effectiveAt),
              reason: cleanReason,
            })
          : await assignOrganizationMembership(accessToken, office.id, {
              employeeId: selectedPerson.employee.id,
              orgUnitId: targetOrgUnitId,
              membershipType: placementType,
              startsAt: toOptionalOrganizationIso(effectiveAt),
              endsAt:
                placementType === "TEMPORARY"
                  ? toOptionalOrganizationIso(endsAt)
                  : undefined,
              reason: cleanReason,
            });

      resetEditor();
      onChanged(response.message);
    } catch (requestError: unknown) {
      setFormError(getErrorMessage(requestError, t("people.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  const canMovePeople = sourceActions.transferPrimary;
  const canAddAssignment = sourceActions.assignSecondary;

  return (
    <section className="organization-unit-people organization-unit-people--managed">
      <header>
        <div>
          <span>{t("manage.peopleEyebrow")}</span>
          <h4>{t("manage.peopleTitle")}</h4>
        </div>
        <strong>{directPeople.length}</strong>
      </header>

      {directPeople.length === 0 ? (
        <p>{t("manage.noPeople")}</p>
      ) : (
        <div className="organization-unit-people__list">
          {directPeople.map((person) => (
            <article key={person.employee.id}>
              <span className="organization-person-badge" aria-hidden="true">
                {person.employee.empName.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <span className="organization-unit-person-copy">
                <strong>{person.employee.empName}</strong>
                <small>
                  {person.employee.empId}
                  {person.employee.designation
                    ? ` · ${person.employee.designation}`
                    : ""}
                </small>
              </span>
              {(canMovePeople || canAddAssignment) && (
                <span className="organization-unit-person-actions">
                  {canMovePeople && (
                    <button
                      type="button"
                      onClick={() => openAction(person.employee.id, "MOVE")}
                    >
                      {t("people.move")}
                    </button>
                  )}
                  {canAddAssignment && (
                    <button
                      type="button"
                      onClick={() => openAction(person.employee.id, "ADD")}
                    >
                      {t("people.add")}
                    </button>
                  )}
                </span>
              )}
            </article>
          ))}
        </div>
      )}

      {selectedPerson && action && (
        <form className="organization-unit-placement-editor" onSubmit={submit}>
          <header>
            <div>
              <span>{t("people.changeEyebrow")}</span>
              <strong>
                {action === "MOVE" ? t("people.moveTitle") : t("people.addTitle")}
              </strong>
              <small>
                {selectedPerson.employee.empName} · {selectedPerson.employee.empId}
              </small>
            </div>
            <button type="button" onClick={resetEditor}>
              {t("common.close")}
            </button>
          </header>

          {formError && (
            <div className="organization-editor-error" role="alert">
              {formError}
            </div>
          )}

          <div className="organization-form organization-unit-placement-form">
            {action === "ADD" && (
              <label>
                <span>{t("people.assignmentType")}</span>
                <select
                  value={placementType}
                  onChange={(event) =>
                    setPlacementType(event.target.value as ExtraPlacementType)
                  }
                  disabled={saving}
                >
                  <option value="SECONDARY">{t("people.secondary")}</option>
                  <option value="TEMPORARY">{t("people.temporary")}</option>
                </select>
              </label>
            )}

            <label>
              <span>{action === "MOVE" ? t("people.moveTo") : t("people.addTo")}</span>
              <select
                value={targetScope}
                onChange={(event) => {
                  setTargetScope(event.target.value);
                  setFormError("");
                }}
                disabled={saving}
                required
              >
                <option value="">{t("people.selectUnit")}</option>
                <option value={OFFICE_SCOPE}>{office.name} — {t("people.officeLevel")}</option>
                {activeUnits
                  .filter((item) => action !== "MOVE" || item.id !== unit.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.code})
                    </option>
                  ))}
              </select>
            </label>

            <label>
              <span>{action === "MOVE" ? t("people.moveTime") : t("people.startTime")}</span>
              <input
                type="datetime-local"
                value={effectiveAt}
                onChange={(event) => setEffectiveAt(event.target.value)}
                disabled={saving}
              />
            </label>

            {action === "ADD" && placementType === "TEMPORARY" && (
              <label>
                <span>{t("people.endTime")}</span>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                  disabled={saving}
                  required
                />
              </label>
            )}

            <label className="organization-form-wide">
              <span>{t("people.reason")}</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={250}
                disabled={saving}
                required
              />
            </label>

            {targetScope && !canUseCurrentAction && (
              <div className="organization-editor-note organization-form-wide">
                {t("people.notAllowed")}
              </div>
            )}

            <footer>
              <button
                type="button"
                className="organization-button organization-button--secondary"
                onClick={resetEditor}
                disabled={saving}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="organization-button organization-button--primary"
                disabled={saving || !targetScope || !canUseCurrentAction}
              >
                {saving
                  ? t("people.saving")
                  : action === "MOVE"
                    ? t("people.move")
                    : t("people.add")}
              </button>
            </footer>
          </div>
        </form>
      )}
    </section>
  );
}
