import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  assignOrganizationLeadership,
  endOrganizationLeadership,
  getOrganizationLeadership,
  getOrganizationPeople,
  getOrganizationPeopleActions,
} from "../../services/organization-v3.service";
import {
  getOrganizationEffectiveStatus,
  normalizeOrganizationReason,
  toOptionalOrganizationIso,
} from "../../utils/organization-people";
import { flattenTree, formatOrganizationDate } from "../../utils/organization-v3";
import { useCurrentTime } from "../../utils/use-current-time";
import type {
  OrganizationLeadershipRecord,
  OrganizationLeadershipType,
  OrganizationOfficeDetail,
  OrganizationPeopleAvailableActions,
  OrganizationPersonSummary,
  OrganizationUnitNode,
} from "../../types/organization-v3";

interface OrganizationLeadershipPanelProps {
  accessToken: string;
  office: OrganizationOfficeDetail;
  tree: OrganizationUnitNode[];
}

type LeadershipFilter = "CURRENT" | "UPCOMING" | "HISTORY" | "ALL";
type LeadershipActionMode = "ASSIGN" | "END" | null;
type LeadershipAssignmentKind =
  | "ORG_UNIT_HEAD"
  | "TEAM_LEAD"
  | "DEPUTY"
  | "ACTING_OFFICE_HEAD"
  | "ACTING_ORG_UNIT_HEAD"
  | "ACTING_TEAM_LEAD";

const ALL_SCOPES = "__ALL__";
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

function getAssignmentScopeValue(orgUnitId: string | null): string {
  return orgUnitId ?? OFFICE_SCOPE;
}

function getLeadershipKind(
  assignment: OrganizationLeadershipRecord,
): LeadershipAssignmentKind | "OFFICE_HEAD" {
  if (!assignment.isActing) {
    return assignment.leadershipType;
  }

  if (assignment.leadershipType === "OFFICE_HEAD") {
    return "ACTING_OFFICE_HEAD";
  }

  if (assignment.leadershipType === "TEAM_LEAD") {
    return "ACTING_TEAM_LEAD";
  }

  return "ACTING_ORG_UNIT_HEAD";
}

function getAssignmentPayload(
  kind: LeadershipAssignmentKind,
): {
  leadershipType: OrganizationLeadershipType;
  isActing: boolean;
} {
  switch (kind) {
    case "ACTING_OFFICE_HEAD":
      return { leadershipType: "OFFICE_HEAD", isActing: true };
    case "ACTING_ORG_UNIT_HEAD":
      return { leadershipType: "ORG_UNIT_HEAD", isActing: true };
    case "ACTING_TEAM_LEAD":
      return { leadershipType: "TEAM_LEAD", isActing: true };
    case "DEPUTY":
      return { leadershipType: "DEPUTY", isActing: false };
    case "TEAM_LEAD":
      return { leadershipType: "TEAM_LEAD", isActing: false };
    case "ORG_UNIT_HEAD":
    default:
      return { leadershipType: "ORG_UNIT_HEAD", isActing: false };
  }
}

function canUseAssignmentKind(
  kind: LeadershipAssignmentKind,
  actions: OrganizationPeopleAvailableActions,
): boolean {
  if (kind === "DEPUTY") {
    return actions.assignDeputy;
  }

  if (kind.startsWith("ACTING_")) {
    return actions.assignActing;
  }

  return actions.assignLeadership;
}

function canEndAssignment(
  assignment: OrganizationLeadershipRecord,
  actions: OrganizationPeopleAvailableActions,
): boolean {
  if (assignment.effectiveUntil !== null) {
    return false;
  }

  if (
    assignment.leadershipType === "OFFICE_HEAD" &&
    !assignment.isActing
  ) {
    return false;
  }

  if (assignment.isActing) {
    return actions.assignActing;
  }

  if (assignment.leadershipType === "DEPUTY") {
    return actions.assignDeputy;
  }

  return actions.assignLeadership;
}

export function OrganizationLeadershipPanel({
  accessToken,
  office,
  tree,
}: OrganizationLeadershipPanelProps) {
  const { t, i18n } = useTranslation("organization");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  const allUnits = useMemo(() => flattenTree(tree), [tree]);
  const activeUnits = useMemo(
    () => allUnits.filter((unit) => unit.isActive),
    [allUnits],
  );

  const [people, setPeople] = useState<OrganizationPersonSummary[]>([]);
  const [assignments, setAssignments] = useState<OrganizationLeadershipRecord[]>([]);
  const [scopeValue, setScopeValue] = useState(ALL_SCOPES);
  const [scopeActions, setScopeActions] =
    useState<OrganizationPeopleAvailableActions>(NO_PEOPLE_ACTIONS);
  const [filter, setFilter] = useState<LeadershipFilter>("CURRENT");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionMode, setActionMode] = useState<LeadershipActionMode>(null);
  const [assignmentKind, setAssignmentKind] =
    useState<LeadershipAssignmentKind>("ORG_UNIT_HEAD");
  const [employeeId, setEmployeeId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [reason, setReason] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const selectedScopeId =
    scopeValue === ALL_SCOPES || scopeValue === OFFICE_SCOPE
      ? null
      : scopeValue;
  const selectedScopeUnit = selectedScopeId
    ? allUnits.find((unit) => unit.id === selectedScopeId) ?? null
    : null;
  const isSpecificScope = scopeValue !== ALL_SCOPES;

  const availableKinds = useMemo(() => {
    if (!isSpecificScope) {
      return [] as LeadershipAssignmentKind[];
    }

    const kinds: LeadershipAssignmentKind[] = [];

    if (scopeValue === OFFICE_SCOPE) {
      if (scopeActions.assignActing) {
        kinds.push("ACTING_OFFICE_HEAD");
      }
      if (scopeActions.assignDeputy) {
        kinds.push("DEPUTY");
      }
      return kinds;
    }

    if (scopeActions.assignLeadership) {
      kinds.push("ORG_UNIT_HEAD");
    }

    if (scopeActions.assignActing) {
      kinds.push("ACTING_ORG_UNIT_HEAD");
    }

    if (scopeActions.assignDeputy) {
      kinds.push("DEPUTY");
    }

    return kinds;
  }, [isSpecificScope, scopeActions, scopeValue]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const currentTime = useCurrentTime();
  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      if (
        scopeValue !== ALL_SCOPES &&
        getAssignmentScopeValue(assignment.orgUnitId) !== scopeValue
      ) {
        return false;
      }

      const effectiveStatus = getOrganizationEffectiveStatus(
        assignment.effectiveFrom,
        assignment.effectiveUntil,
        currentTime,
      );

      if (filter !== "ALL" && effectiveStatus !== filter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const kind = getLeadershipKind(assignment);
      return [
        assignment.employee.empName,
        assignment.employee.empId,
        assignment.employee.designation ?? "",
        assignment.orgUnit?.name ?? office.name,
        assignment.orgUnit?.code ?? office.code,
        t(`leadership.kinds.${kind}`),
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [
    assignments,
    currentTime,
    filter,
    normalizedSearch,
    office.code,
    office.name,
    scopeValue,
    t,
  ]);

  const currentCount = assignments.filter(
    (assignment) =>
      getOrganizationEffectiveStatus(
        assignment.effectiveFrom,
        assignment.effectiveUntil,
      ) === "CURRENT",
  ).length;
  const actingCount = assignments.filter(
    (assignment) =>
      assignment.isActing &&
      getOrganizationEffectiveStatus(
        assignment.effectiveFrom,
        assignment.effectiveUntil,
      ) !== "HISTORY",
  ).length;
  const deputyCount = assignments.filter(
    (assignment) =>
      assignment.leadershipType === "DEPUTY" &&
      getOrganizationEffectiveStatus(
        assignment.effectiveFrom,
        assignment.effectiveUntil,
      ) !== "HISTORY",
  ).length;

  function resetAction(): void {
    setActionMode(null);
    setSelectedAssignmentId(null);
    setEmployeeId("");
    setEffectiveFrom("");
    setEffectiveUntil("");
    setReason("");
    setFormError("");
  }

  function refreshLeadership(message?: string): void {
    if (message) {
      setSuccess(message);
    }
    setError("");
    resetAction();
    setRefreshVersion((current) => current + 1);
  }

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
      }
    });

    Promise.all([
      getOrganizationLeadership(accessToken, office.id),
      getOrganizationPeople(accessToken, office.id),
    ])
      .then(([leadershipResponse, peopleResponse]) => {
        if (!active) {
          return;
        }

        setAssignments(leadershipResponse.data);
        setPeople(peopleResponse.data);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getErrorMessage(requestError, t("leadership.errors.load")));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, office.id, refreshVersion, t]);

  useEffect(() => {
    let active = true;

    if (!isSpecificScope) {
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        setScopeActions(NO_PEOPLE_ACTIONS);
        resetAction();
      });

      return () => {
        active = false;
      };
    }

    queueMicrotask(() => {
      if (!active) {
        return;
      }

      setScopeActions(NO_PEOPLE_ACTIONS);
      resetAction();
    });

    getOrganizationPeopleActions(accessToken, office.id, selectedScopeId)
      .then((response) => {
        if (!active) {
          return;
        }

        setScopeActions(response.availableActions);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getErrorMessage(requestError, t("leadership.errors.actions")));
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, isSpecificScope, office.id, selectedScopeId, t]);

  useEffect(() => {
    if (availableKinds.length === 0) {
      return;
    }

    if (!availableKinds.includes(assignmentKind)) {
      const nextAssignmentKind = availableKinds[0];
      queueMicrotask(() => {
        setAssignmentKind(nextAssignmentKind);
      });
    }
  }, [assignmentKind, availableKinds]);

  async function submitAssignment(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!isSpecificScope || !employeeId || availableKinds.length === 0) {
      setFormError(t("leadership.errors.selection"));
      return;
    }

    const cleanReason = normalizeOrganizationReason(reason);
    if (cleanReason.length < 3) {
      setFormError(t("leadership.errors.reason"));
      return;
    }

    if (!availableKinds.includes(assignmentKind)) {
      setFormError(t("leadership.errors.scope"));
      return;
    }

    const payload = getAssignmentPayload(assignmentKind);
    if (!canUseAssignmentKind(assignmentKind, scopeActions)) {
      setFormError(t("leadership.errors.scope"));
      return;
    }

    if (payload.isActing && !effectiveUntil) {
      setFormError(t("leadership.errors.actingEnd"));
      return;
    }

    const orgUnitId =
      assignmentKind === "ACTING_OFFICE_HEAD"
        ? null
        : selectedScopeId;

    setSaving(true);
    setFormError("");

    try {
      const response = await assignOrganizationLeadership(
        accessToken,
        office.id,
        {
          employeeId,
          orgUnitId,
          leadershipType: payload.leadershipType,
          isActing: payload.isActing,
          effectiveFrom: toOptionalOrganizationIso(effectiveFrom),
          effectiveUntil: payload.isActing
            ? toOptionalOrganizationIso(effectiveUntil)
            : undefined,
          reason: cleanReason,
        },
      );

      refreshLeadership(response.message);
    } catch (requestError: unknown) {
      setFormError(getErrorMessage(requestError, t("leadership.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  async function submitEnd(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const assignment = assignments.find(
      (item) => item.id === selectedAssignmentId,
    );

    if (!assignment || !canEndAssignment(assignment, scopeActions)) {
      setFormError(t("leadership.errors.scope"));
      return;
    }

    const cleanReason = normalizeOrganizationReason(reason);
    if (cleanReason.length < 3) {
      setFormError(t("leadership.errors.reason"));
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const response = await endOrganizationLeadership(
        accessToken,
        office.id,
        assignment.id,
        {
          effectiveAt: toOptionalOrganizationIso(effectiveFrom),
          reason: cleanReason,
        },
      );

      refreshLeadership(response.message);
    } catch (requestError: unknown) {
      setFormError(getErrorMessage(requestError, t("leadership.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  function openAssignment(): void {
    if (availableKinds.length === 0) {
      return;
    }

    resetAction();
    setAssignmentKind(availableKinds[0]);
    setActionMode("ASSIGN");
  }

  function openEnd(assignment: OrganizationLeadershipRecord): void {
    resetAction();
    setSelectedAssignmentId(assignment.id);
    setActionMode("END");
  }

  return (
    <section className="organization-leadership-workspace">
      {success && (
        <div className="organization-feedback organization-feedback--success" role="status">
          <span>{success}</span>
          <button type="button" onClick={() => setSuccess("")}>{t("common.close")}</button>
        </div>
      )}

      {error && (
        <div className="organization-feedback organization-feedback--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>{t("common.close")}</button>
        </div>
      )}

      <section className="organization-leadership-toolbar">
        <div>
          <span>{t("leadership.eyebrow")}</span>
          <h3>{t("leadership.title")}</h3>
          <p>{t("leadership.description")}</p>
        </div>

        <div className="organization-leadership-toolbar__controls">
          <label>
            <span>{t("leadership.scope")}</span>
            <select
              value={scopeValue}
              onChange={(event) => setScopeValue(event.target.value)}
            >
              <option value={ALL_SCOPES}>{t("leadership.allVisible")}</option>
              <option value={OFFICE_SCOPE}>{office.name} — {t("leadership.officeScope")}</option>
              {activeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.code})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t("leadership.status")}</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as LeadershipFilter)}
            >
              <option value="CURRENT">{t("leadership.filters.CURRENT")}</option>
              <option value="UPCOMING">{t("leadership.filters.UPCOMING")}</option>
              <option value="HISTORY">{t("leadership.filters.HISTORY")}</option>
              <option value="ALL">{t("leadership.filters.ALL")}</option>
            </select>
          </label>

          <label>
            <span>{t("leadership.search")}</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t("leadership.searchPlaceholder")}
            />
          </label>
        </div>
      </section>

      <section className="organization-leadership-summary" aria-label={t("leadership.summaryAria")}>
        <article>
          <span>{t("leadership.current")}</span>
          <strong>{currentCount}</strong>
        </article>
        <article>
          <span>{t("leadership.acting")}</span>
          <strong>{actingCount}</strong>
        </article>
        <article>
          <span>{t("leadership.deputies")}</span>
          <strong>{deputyCount}</strong>
        </article>
        <article>
          <span>{t("leadership.visibleRecords")}</span>
          <strong>{assignments.length}</strong>
        </article>
      </section>

      {isSpecificScope && (
        <section className="organization-leadership-scope-note">
          <div>
            <span>{t("leadership.selectedScope")}</span>
            <strong>{selectedScopeUnit?.name ?? office.name}</strong>
            <small>
              {selectedScopeUnit?.orgUnitType.name ?? t("leadership.officeScope")}
            </small>
          </div>
          {availableKinds.length > 0 ? (
            <button
              type="button"
              className="organization-button organization-button--primary"
              onClick={openAssignment}
            >
              {t("leadership.assign")}
            </button>
          ) : (
            <span className="organization-unit-readonly">
              {t("leadership.readonlyScope")}
            </span>
          )}
        </section>
      )}

      {actionMode && (
        <section className="organization-inline-editor organization-leadership-editor">
          <header>
            <div>
              <span>{t("leadership.actionEyebrow")}</span>
              <h4>
                {actionMode === "ASSIGN"
                  ? t("leadership.assignTitle")
                  : t("leadership.endTitle")}
              </h4>
            </div>
            <button
              type="button"
              className="organization-editor-close"
              onClick={resetAction}
            >
              {t("common.close")}
            </button>
          </header>

          {formError && (
            <div className="organization-editor-error" role="alert">
              {formError}
            </div>
          )}

          {actionMode === "ASSIGN" ? (
            <form className="organization-form" onSubmit={submitAssignment}>
              <label>
                <span>{t("leadership.role")}</span>
                <select
                  value={assignmentKind}
                  onChange={(event) =>
                    setAssignmentKind(event.target.value as LeadershipAssignmentKind)
                  }
                  disabled={saving}
                >
                  {availableKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`leadership.kinds.${kind}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>{t("leadership.employee")}</span>
                <select
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                  disabled={saving}
                  required
                >
                  <option value="">{t("leadership.selectEmployee")}</option>
                  {people.map((person) => (
                    <option key={person.employee.id} value={person.employee.id}>
                      {person.employee.empName} ({person.employee.empId})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>{t("leadership.effectiveFrom")}</span>
                <input
                  type="datetime-local"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  disabled={saving}
                />
              </label>

              {getAssignmentPayload(assignmentKind).isActing && (
                <label>
                  <span>{t("leadership.effectiveUntil")}</span>
                  <input
                    type="datetime-local"
                    value={effectiveUntil}
                    onChange={(event) => setEffectiveUntil(event.target.value)}
                    disabled={saving}
                    required
                  />
                </label>
              )}

              <label className="organization-form-wide">
                <span>{t("leadership.reason")}</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  disabled={saving}
                  required
                />
              </label>

              {assignmentKind === "DEPUTY" && (
                <div className="organization-editor-note organization-form-wide">
                  {t("leadership.deputyNotice")}
                </div>
              )}

              {getAssignmentPayload(assignmentKind).isActing && (
                <div className="organization-editor-note organization-form-wide">
                  {t("leadership.actingNotice")}
                </div>
              )}

              <footer>
                <button
                  type="button"
                  className="organization-button organization-button--secondary"
                  onClick={resetAction}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="organization-button organization-button--primary"
                  disabled={saving || !employeeId || availableKinds.length === 0}
                >
                  {saving ? t("leadership.saving") : t("leadership.assign")}
                </button>
              </footer>
            </form>
          ) : (
            <form className="organization-form" onSubmit={submitEnd}>
              <label>
                <span>{t("leadership.effectiveAt")}</span>
                <input
                  type="datetime-local"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="organization-form-wide">
                <span>{t("leadership.reason")}</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  disabled={saving}
                  required
                />
              </label>
              <div className="organization-editor-note organization-form-wide">
                {t("leadership.endNotice")}
              </div>
              <footer>
                <button
                  type="button"
                  className="organization-button organization-button--secondary"
                  onClick={resetAction}
                  disabled={saving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="organization-button organization-button--danger"
                  disabled={saving}
                >
                  {saving ? t("leadership.saving") : t("leadership.end")}
                </button>
              </footer>
            </form>
          )}
        </section>
      )}

      <section className="organization-leadership-list-panel">
        <header>
          <div>
            <span>{t("leadership.recordsEyebrow")}</span>
            <h4>{t("leadership.recordsTitle")}</h4>
          </div>
          <span>{t("leadership.matching", { count: filteredAssignments.length })}</span>
        </header>

        {loading ? (
          <div className="organization-empty-state">
            <strong>{t("leadership.loading")}</strong>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="organization-empty-state">
            <strong>{t("leadership.empty")}</strong>
            <span>{t("leadership.emptyDescription")}</span>
          </div>
        ) : (
          <div className="organization-leadership-list">
            {filteredAssignments.map((assignment) => {
              const effectiveStatus = getOrganizationEffectiveStatus(
                assignment.effectiveFrom,
                assignment.effectiveUntil,
              );
              const kind = getLeadershipKind(assignment);
              const assignmentInSelectedScope =
                isSpecificScope &&
                getAssignmentScopeValue(assignment.orgUnitId) === scopeValue;
              const canEnd =
                assignmentInSelectedScope &&
                canEndAssignment(assignment, scopeActions);
              const protectedOfficeHead =
                assignment.leadershipType === "OFFICE_HEAD" &&
                !assignment.isActing;

              return (
                <article key={assignment.id} className="organization-leadership-card">
                  <div className="organization-leadership-card__identity">
                    <span className="organization-type-chip">
                      {t(`leadership.kinds.${kind}`)}
                    </span>
                    <strong>{assignment.employee.empName}</strong>
                    <small>
                      {assignment.employee.empId}
                      {assignment.employee.designation
                        ? ` · ${assignment.employee.designation}`
                        : ""}
                    </small>
                  </div>

                  <div className="organization-leadership-card__scope">
                    <span>{t("leadership.scope")}</span>
                    <strong>{assignment.orgUnit?.name ?? office.name}</strong>
                    <small>
                      {assignment.orgUnit?.orgUnitType.name ?? t("leadership.officeScope")}
                    </small>
                  </div>

                  <div className="organization-leadership-card__period">
                    <span>{t("leadership.period")}</span>
                    <strong>
                      {formatOrganizationDate(
                        assignment.effectiveFrom,
                        locale,
                        t("common.notAvailable"),
                      )}
                    </strong>
                    <small>
                      {assignment.effectiveUntil
                        ? t("leadership.until", {
                            date: formatOrganizationDate(
                              assignment.effectiveUntil,
                              locale,
                              t("common.notAvailable"),
                            ),
                          })
                        : t("leadership.openEnded")}
                    </small>
                  </div>

                  <div className="organization-leadership-card__status">
                    <span className={`organization-leadership-state is-${effectiveStatus.toLowerCase()}`}>
                      {t(`leadership.filters.${effectiveStatus}`)}
                    </span>
                    {protectedOfficeHead && (
                      <small>{t("leadership.protectedOfficeHead")}</small>
                    )}
                    {assignment.isActing && (
                      <small>{t("leadership.scheduledEnd")}</small>
                    )}
                  </div>

                  <div className="organization-leadership-card__reason">
                    <span>{t("leadership.reason")}</span>
                    <p>{assignment.assignmentReason || t("common.notAvailable")}</p>
                  </div>

                  {canEnd && (
                    <button
                      type="button"
                      onClick={() => openEnd(assignment)}
                    >
                      {t("leadership.end")}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

    </section>
  );
}
