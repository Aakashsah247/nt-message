import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  assignOrganizationMembership,
  endOrganizationMembership,
  getEmployeeOrganizationMemberships,
  getOrganizationPeople,
  getOrganizationPeopleActions,
  transferPrimaryOrganizationMembership,
} from "../../services/organization-v3.service";
import { flattenTree, formatOrganizationDate } from "../../utils/organization-v3";
import type {
  OrganizationMembershipRecord,
  OrganizationOfficeDetail,
  OrganizationPeopleAvailableActions,
  OrganizationPersonSummary,
  OrganizationUnitNode,
} from "../../types/organization-v3";

interface OrganizationPeoplePanelProps {
  accessToken: string;
  office: OrganizationOfficeDetail;
  tree: OrganizationUnitNode[];
}

type PeopleActionMode = "TRANSFER" | "ASSIGN" | "END" | null;

type SupplementalMembershipType = "SECONDARY" | "TEMPORARY";

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

function toOptionalIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeReason(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getScopeKey(orgUnitId: string | null): string {
  return orgUnitId ?? "__OFFICE__";
}

export function OrganizationPeoplePanel({
  accessToken,
  office,
  tree,
}: OrganizationPeoplePanelProps) {
  const { t, i18n } = useTranslation("organization");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  const allUnits = useMemo(() => flattenTree(tree), [tree]);
  const activeUnits = useMemo(
    () => allUnits.filter((unit) => unit.isActive),
    [allUnits],
  );

  const [people, setPeople] = useState<OrganizationPersonSummary[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembershipRecord[]>([]);
  const [selectedActions, setSelectedActions] =
    useState<OrganizationPeopleAvailableActions>(NO_PEOPLE_ACTIONS);
  const [scopeActions, setScopeActions] =
    useState<Record<string, OrganizationPeopleAvailableActions>>({});
  const [targetActions, setTargetActions] =
    useState<OrganizationPeopleAvailableActions>(NO_PEOPLE_ACTIONS);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionMode, setActionMode] = useState<PeopleActionMode>(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [targetOrgUnitId, setTargetOrgUnitId] = useState("");
  const [membershipType, setMembershipType] =
    useState<SupplementalMembershipType>("SECONDARY");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const selectedPerson = useMemo(
    () => people.find((person) => person.employee.id === selectedEmployeeId) ?? null,
    [people, selectedEmployeeId],
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredPeople = useMemo(
    () => people.filter((person) => {
      if (!normalizedSearch) {
        return true;
      }

      const unit = person.primaryMembership.orgUnit;
      return [
        person.employee.empName,
        person.employee.empId,
        person.employee.designation ?? "",
        unit?.name ?? office.name,
        unit?.code ?? office.code,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    }),
    [normalizedSearch, office.code, office.name, people],
  );

  const activeMemberships = memberships.filter((membership) => membership.endsAt === null);
  const supplementalMemberships = activeMemberships.filter(
    (membership) => membership.membershipType !== "PRIMARY",
  );
  const targetOrgUnitIdValue = targetOrgUnitId || null;
  const targetCanTransfer = targetActions.transferPrimary;
  const targetCanAssign = targetActions.assignSecondary;

  function resetAction(): void {
    setActionMode(null);
    setSelectedMembershipId(null);
    setTargetOrgUnitId("");
    setMembershipType("SECONDARY");
    setEffectiveAt("");
    setEndsAt("");
    setReason("");
    setFormError("");
    setTargetActions(NO_PEOPLE_ACTIONS);
  }

  function refreshPeople(message?: string): void {
    if (message) {
      setSuccess(message);
    }
    setError("");
    resetAction();
    setRefreshVersion((current) => current + 1);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);

    getOrganizationPeople(accessToken, office.id)
      .then((response) => {
        if (!active) {
          return;
        }

        setPeople(response.data);
        setSelectedEmployeeId((current) =>
          current && response.data.some((item) => item.employee.id === current)
            ? current
            : response.data[0]?.employee.id ?? null,
        );
        setError("");
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getErrorMessage(requestError, t("people.errors.load")));
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
    if (!selectedPerson) {
      setMemberships([]);
      setSelectedActions(NO_PEOPLE_ACTIONS);
      setScopeActions({});
      return;
    }

    let active = true;
    const currentScope = selectedPerson.primaryMembership.orgUnitId;
    setLoadingMemberships(true);
    setMemberships([]);
    setScopeActions({});

    Promise.all([
      getOrganizationPeopleActions(accessToken, office.id, currentScope),
      getEmployeeOrganizationMemberships(
        accessToken,
        office.id,
        selectedPerson.employee.id,
      ).catch(() => null),
    ])
      .then(async ([actionsResponse, membershipsResponse]) => {
        if (!active) {
          return;
        }

        setSelectedActions(actionsResponse.availableActions);

        if (!actionsResponse.availableActions.viewMemberships || !membershipsResponse) {
          setMemberships([]);
          return;
        }

        setMemberships(membershipsResponse.data);

        const openSupplementalScopes = Array.from(
          new Set(
            membershipsResponse.data
              .filter(
                (membership) =>
                  membership.endsAt === null && membership.membershipType !== "PRIMARY",
              )
              .map((membership) => membership.orgUnitId),
          ),
        );

        const actionEntries = await Promise.all(
          openSupplementalScopes.map(async (orgUnitId) => {
            const response = await getOrganizationPeopleActions(
              accessToken,
              office.id,
              orgUnitId,
            );
            return [getScopeKey(orgUnitId), response.availableActions] as const;
          }),
        );

        if (active) {
          setScopeActions(Object.fromEntries(actionEntries));
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getErrorMessage(requestError, t("people.errors.detail")));
        }
      })
      .finally(() => {
        if (active) {
          setLoadingMemberships(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, office.id, refreshVersion, selectedPerson, t]);

  useEffect(() => {
    if (!actionMode || (actionMode !== "TRANSFER" && actionMode !== "ASSIGN")) {
      setTargetActions(NO_PEOPLE_ACTIONS);
      return;
    }

    let active = true;
    getOrganizationPeopleActions(accessToken, office.id, targetOrgUnitIdValue)
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
  }, [accessToken, actionMode, office.id, targetOrgUnitIdValue]);

  async function submitTransfer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedPerson) {
      return;
    }

    const cleanReason = normalizeReason(reason);
    if (cleanReason.length < 3) {
      setFormError(t("people.errors.reason"));
      return;
    }

    if (!selectedActions.transferPrimary || !targetCanTransfer) {
      setFormError(t("people.errors.targetNotAllowed"));
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const response = await transferPrimaryOrganizationMembership(
        accessToken,
        office.id,
        {
          employeeId: selectedPerson.employee.id,
          orgUnitId: targetOrgUnitIdValue,
          effectiveAt: toOptionalIso(effectiveAt),
          reason: cleanReason,
        },
      );
      refreshPeople(response.message);
    } catch (requestError: unknown) {
      setFormError(getErrorMessage(requestError, t("people.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedPerson) {
      return;
    }

    const cleanReason = normalizeReason(reason);
    if (cleanReason.length < 3) {
      setFormError(t("people.errors.reason"));
      return;
    }
    if (membershipType === "TEMPORARY" && !endsAt) {
      setFormError(t("people.errors.temporaryEnd"));
      return;
    }
    if (!selectedActions.assignSecondary || !targetCanAssign) {
      setFormError(t("people.errors.targetNotAllowed"));
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const response = await assignOrganizationMembership(
        accessToken,
        office.id,
        {
          employeeId: selectedPerson.employee.id,
          orgUnitId: targetOrgUnitIdValue,
          membershipType,
          startsAt: toOptionalIso(effectiveAt),
          endsAt: membershipType === "TEMPORARY" ? toOptionalIso(endsAt) : undefined,
          reason: cleanReason,
        },
      );
      refreshPeople(response.message);
    } catch (requestError: unknown) {
      setFormError(getErrorMessage(requestError, t("people.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  async function submitEnd(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const membership = memberships.find((item) => item.id === selectedMembershipId);
    if (!membership) {
      return;
    }

    const cleanReason = normalizeReason(reason);
    if (cleanReason.length < 3) {
      setFormError(t("people.errors.reason"));
      return;
    }

    const actions = scopeActions[getScopeKey(membership.orgUnitId)] ?? NO_PEOPLE_ACTIONS;
    if (!actions.assignSecondary) {
      setFormError(t("people.errors.targetNotAllowed"));
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      const response = await endOrganizationMembership(
        accessToken,
        office.id,
        membership.id,
        {
          effectiveAt: toOptionalIso(effectiveAt),
          reason: cleanReason,
        },
      );
      refreshPeople(response.message);
    } catch (requestError: unknown) {
      setFormError(getErrorMessage(requestError, t("people.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  function openEndMembership(membershipId: string): void {
    setActionMode("END");
    setSelectedMembershipId(membershipId);
    setEffectiveAt("");
    setReason("");
    setFormError("");
  }

  return (
    <section className="organization-people-workspace">
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

      <section className="organization-people-toolbar">
        <div>
          <span>{t("people.eyebrow")}</span>
          <h3>{t("people.title")}</h3>
          <p>{t("people.description")}</p>
        </div>
        <label>
          <span>{t("people.search")}</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("people.searchPlaceholder")}
          />
        </label>
      </section>

      <div className="organization-people-layout">
        <section className="organization-people-list-panel">
          <header>
            <strong>{t("people.listTitle")}</strong>
            <span>{t("people.matching", { count: filteredPeople.length })}</span>
          </header>

          {loading ? (
            <div className="organization-empty-state">
              <strong>{t("people.loading")}</strong>
            </div>
          ) : filteredPeople.length === 0 ? (
            <div className="organization-empty-state">
              <strong>{t("people.empty")}</strong>
              <span>{t("people.emptyDescription")}</span>
            </div>
          ) : (
            <div className="organization-people-list">
              {filteredPeople.map((person) => {
                const placement = person.primaryMembership.orgUnit;
                const selected = person.employee.id === selectedEmployeeId;
                return (
                  <button
                    key={person.employee.id}
                    type="button"
                    className={selected ? "organization-person-row is-selected" : "organization-person-row"}
                    onClick={() => {
                      setSelectedEmployeeId(person.employee.id);
                      setSuccess("");
                      resetAction();
                    }}
                  >
                    <span className="organization-person-avatar" aria-hidden="true">
                      {person.employee.empName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="organization-person-identity">
                      <strong>{person.employee.empName}</strong>
                      <small>{person.employee.empId}</small>
                    </span>
                    <span className="organization-person-placement">
                      <strong>{placement?.name ?? office.name}</strong>
                      <small>{placement?.orgUnitType.name ?? t("people.officePlacement")}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="organization-person-detail-panel">
          {!selectedPerson ? (
            <div className="organization-empty-state">
              <strong>{t("people.selectTitle")}</strong>
              <span>{t("people.selectDescription")}</span>
            </div>
          ) : (
            <>
              <header className="organization-person-detail-header">
                <div>
                  <span>{t("people.profileEyebrow")}</span>
                  <h3>{selectedPerson.employee.empName}</h3>
                  <p>{selectedPerson.employee.designation || t("common.notAvailable")}</p>
                </div>
                <span className="organization-type-chip">{selectedPerson.employee.empId}</span>
              </header>

              <dl className="organization-detail-facts organization-person-facts">
                <div>
                  <dt>{t("people.primaryPlacement")}</dt>
                  <dd>{selectedPerson.primaryMembership.orgUnit?.name ?? office.name}</dd>
                </div>
                <div>
                  <dt>{t("people.placementType")}</dt>
                  <dd>{selectedPerson.primaryMembership.orgUnit?.orgUnitType.name ?? t("people.officePlacement")}</dd>
                </div>
                <div>
                  <dt>{t("people.activation")}</dt>
                  <dd>{selectedPerson.employee.isActivated ? t("people.activated") : t("people.awaitingActivation")}</dd>
                </div>
                <div>
                  <dt>{t("people.account")}</dt>
                  <dd>{selectedPerson.employee.account?.isEnabled ? t("people.enabled") : t("people.unavailable")}</dd>
                </div>
              </dl>

              {(selectedActions.transferPrimary || selectedActions.assignSecondary) && (
                <div className="organization-action-strip organization-people-actions">
                  {selectedActions.transferPrimary && (
                    <button type="button" onClick={() => {
                      resetAction();
                      setActionMode("TRANSFER");
                    }}>
                      {t("people.transferPrimary")}
                    </button>
                  )}
                  {selectedActions.assignSecondary && (
                    <button type="button" onClick={() => {
                      resetAction();
                      setActionMode("ASSIGN");
                    }}>
                      {t("people.addPlacement")}
                    </button>
                  )}
                </div>
              )}

              {!selectedActions.viewMemberships ? (
                <div className="organization-unit-readonly">{t("people.membershipReadonly")}</div>
              ) : loadingMemberships ? (
                <div className="organization-empty-state"><strong>{t("people.loadingHistory")}</strong></div>
              ) : (
                <section className="organization-membership-history">
                  <header>
                    <div>
                      <span>{t("people.historyEyebrow")}</span>
                      <h4>{t("people.historyTitle")}</h4>
                    </div>
                    <span>{t("people.activePlacements", { count: activeMemberships.length })}</span>
                  </header>

                  {memberships.length === 0 ? (
                    <div className="organization-empty-state"><strong>{t("people.noHistory")}</strong></div>
                  ) : (
                    <div className="organization-membership-list">
                      {memberships.map((membership) => {
                        const canEnd =
                          membership.membershipType !== "PRIMARY" &&
                          membership.endsAt === null &&
                          (scopeActions[getScopeKey(membership.orgUnitId)]?.assignSecondary ?? false);
                        return (
                          <article key={membership.id} className="organization-membership-card">
                            <div>
                              <span className="organization-type-chip">{t(`people.membershipTypes.${membership.membershipType}`)}</span>
                              <strong>{membership.orgUnit?.name ?? office.name}</strong>
                              <small>{membership.orgUnit?.orgUnitType.name ?? t("people.officePlacement")}</small>
                            </div>
                            <div className="organization-membership-dates">
                              <span>{t("people.started")}</span>
                              <strong>{formatOrganizationDate(membership.startsAt, locale, t("common.notAvailable"))}</strong>
                              <span>{t("people.ended")}</span>
                              <strong>{membership.endsAt ? formatOrganizationDate(membership.endsAt, locale, t("common.notAvailable")) : t("people.current")}</strong>
                            </div>
                            <div className="organization-membership-reason">
                              <span>{t("people.reason")}</span>
                              <p>{membership.assignmentReason || t("common.notAvailable")}</p>
                            </div>
                            {canEnd && (
                              <button type="button" onClick={() => openEndMembership(membership.id)}>
                                {t("people.endPlacement")}
                              </button>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {actionMode && (
                <section className="organization-inline-editor organization-people-editor">
                  <header>
                    <div>
                      <span>{t("people.actionEyebrow")}</span>
                      <h4>
                        {actionMode === "TRANSFER"
                          ? t("people.transferTitle")
                          : actionMode === "ASSIGN"
                            ? t("people.assignTitle")
                            : t("people.endTitle")}
                      </h4>
                    </div>
                    <button type="button" className="organization-editor-close" onClick={resetAction}>
                      {t("common.close")}
                    </button>
                  </header>

                  {formError && <div className="organization-editor-error" role="alert">{formError}</div>}

                  {actionMode === "TRANSFER" && (
                    <form className="organization-form" onSubmit={submitTransfer}>
                      <label>
                        <span>{t("people.targetPlacement")}</span>
                        <select value={targetOrgUnitId} onChange={(event) => setTargetOrgUnitId(event.target.value)} disabled={saving}>
                          <option value="">{office.name} — {t("people.officePlacement")}</option>
                          {activeUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>{t("people.effectiveAt")}</span>
                        <input type="datetime-local" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} disabled={saving} />
                      </label>
                      <label className="organization-form-wide">
                        <span>{t("people.reason")}</span>
                        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={saving} required />
                      </label>
                      {!targetCanTransfer && <div className="organization-editor-note organization-form-wide">{t("people.targetScopeNotice")}</div>}
                      <footer>
                        <button type="button" className="organization-button organization-button--secondary" onClick={resetAction} disabled={saving}>{t("common.cancel")}</button>
                        <button type="submit" className="organization-button organization-button--primary" disabled={saving || !targetCanTransfer}>{saving ? t("people.saving") : t("people.transfer")}</button>
                      </footer>
                    </form>
                  )}

                  {actionMode === "ASSIGN" && (
                    <form className="organization-form" onSubmit={submitAssignment}>
                      <label>
                        <span>{t("people.membershipType")}</span>
                        <select value={membershipType} onChange={(event) => setMembershipType(event.target.value as SupplementalMembershipType)} disabled={saving}>
                          <option value="SECONDARY">{t("people.membershipTypes.SECONDARY")}</option>
                          <option value="TEMPORARY">{t("people.membershipTypes.TEMPORARY")}</option>
                        </select>
                      </label>
                      <label>
                        <span>{t("people.targetPlacement")}</span>
                        <select value={targetOrgUnitId} onChange={(event) => setTargetOrgUnitId(event.target.value)} disabled={saving}>
                          <option value="">{office.name} — {t("people.officePlacement")}</option>
                          {activeUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>{t("people.startsAt")}</span>
                        <input type="datetime-local" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} disabled={saving} />
                      </label>
                      {membershipType === "TEMPORARY" && (
                        <label>
                          <span>{t("people.endsAt")}</span>
                          <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} disabled={saving} required />
                        </label>
                      )}
                      <label className="organization-form-wide">
                        <span>{t("people.reason")}</span>
                        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={saving} required />
                      </label>
                      {!targetCanAssign && <div className="organization-editor-note organization-form-wide">{t("people.targetScopeNotice")}</div>}
                      <footer>
                        <button type="button" className="organization-button organization-button--secondary" onClick={resetAction} disabled={saving}>{t("common.cancel")}</button>
                        <button type="submit" className="organization-button organization-button--primary" disabled={saving || !targetCanAssign}>{saving ? t("people.saving") : t("people.assign")}</button>
                      </footer>
                    </form>
                  )}

                  {actionMode === "END" && (
                    <form className="organization-form" onSubmit={submitEnd}>
                      <label>
                        <span>{t("people.effectiveAt")}</span>
                        <input type="datetime-local" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} disabled={saving} />
                      </label>
                      <label className="organization-form-wide">
                        <span>{t("people.reason")}</span>
                        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={saving} required />
                      </label>
                      <div className="organization-editor-note organization-form-wide">{t("people.endNotice")}</div>
                      <footer>
                        <button type="button" className="organization-button organization-button--secondary" onClick={resetAction} disabled={saving}>{t("common.cancel")}</button>
                        <button type="submit" className="organization-button organization-button--danger" disabled={saving}>{saving ? t("people.saving") : t("people.endPlacement")}</button>
                      </footer>
                    </form>
                  )}
                </section>
              )}
            </>
          )}
        </section>
      </div>

      {supplementalMemberships.length > 0 && (
        <div className="organization-people-footnote">
          {t("people.secondarySummary", { count: supplementalMemberships.length })}
        </div>
      )}
    </section>
  );
}
