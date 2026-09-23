import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  createOrganizationDelegation,
  getOrganizationDelegationContext,
  getOrganizationDelegations,
  revokeOrganizationDelegation,
} from "../../services/organization-v3.service";
import {
  getOrganizationEffectiveStatus,
  normalizeOrganizationReason,
  toOptionalOrganizationIso,
} from "../../utils/organization-people";
import { flattenTree, formatOrganizationDate } from "../../utils/organization-v3";
import type {
  OrganizationDelegationCapability,
  OrganizationDelegationContextResponse,
  OrganizationDelegationRecord,
  OrganizationOfficeDetail,
  OrganizationSharedResponsibility,
  OrganizationUnitNode,
} from "../../types/organization-v3";

interface OrganizationDelegationPanelProps {
  accessToken: string;
  office: OrganizationOfficeDetail;
  tree: OrganizationUnitNode[];
}

type DelegationFilter = "CURRENT" | "UPCOMING" | "HISTORY" | "ALL";
type DelegationActionMode = "GRANT" | "REVOKE" | null;
type AccessDurationMode = "UNTIL_REVOKED" | "TEMPORARY";

const RESPONSIBILITY_KEYS: Record<OrganizationSharedResponsibility, string> = {
  "shared.organization_directory_view": "organizationDirectoryView",
  "shared.organization_management": "organizationManagement",
  "shared.work_management": "workManagement",
  "shared.work_type_management": "workTypeManagement",
  "shared.duty_roster_management": "dutyRosterManagement",
  "shared.team_management": "teamManagement",
  "shared.reports_export": "reportsExport",
  "shared.account_request_coordination": "accountRequestCoordination",
  "shared.official_communication_management": "officialCommunicationManagement",
};


const RESPONSIBILITY_DETAIL_KEYS: Record<
  OrganizationSharedResponsibility,
  { can: readonly string[]; cannot: readonly string[] }
> = {
  "shared.organization_directory_view": {
    can: ["can1", "can2", "can3"],
    cannot: ["cannot1", "cannot2", "cannot3"],
  },
  "shared.organization_management": {
    can: ["can1", "can2", "can3"],
    cannot: ["cannot1", "cannot2", "cannot3"],
  },
  "shared.work_management": {
    can: ["can1", "can2", "can3", "can4", "can5"],
    cannot: ["cannot1", "cannot2", "cannot3", "cannot4"],
  },
  "shared.work_type_management": {
    can: ["can1", "can2", "can3", "can4", "can5"],
    cannot: ["cannot1", "cannot2", "cannot3", "cannot4"],
  },
  "shared.duty_roster_management": {
    can: ["can1", "can2", "can3"],
    cannot: ["cannot1", "cannot2", "cannot3"],
  },
  "shared.team_management": {
    can: ["can1", "can2", "can3"],
    cannot: ["cannot1", "cannot2", "cannot3"],
  },
  "shared.reports_export": {
    can: ["can1", "can2", "can3", "can4"],
    cannot: ["cannot1", "cannot2", "cannot3"],
  },
  "shared.account_request_coordination": {
    can: ["can1", "can2", "can3"],
    cannot: ["cannot1", "cannot2", "cannot3", "cannot4"],
  },
  "shared.official_communication_management": {
    can: ["can1", "can2"],
    cannot: ["cannot1", "cannot2", "cannot3"],
  },
};

const CAPABILITY_KEYS: Record<OrganizationDelegationCapability, string> = {
  "organization.view": "organizationView",
  "organization.create_unit": "organizationCreateUnit",
  "organization.rename_unit": "organizationRenameUnit",
  "organization.move_unit": "organizationMoveUnit",
  "organization.deactivate_unit": "organizationDeactivateUnit",
  "membership.view": "membershipView",
  "membership.transfer_internal": "membershipTransferInternal",
  "membership.assign_secondary": "membershipAssignSecondary",
  "leadership.view": "leadershipView",
  "leadership.assign": "leadershipAssign",
  "leadership.assign_acting": "leadershipAssignActing",
  "leadership.assign_deputy": "leadershipAssignDeputy",
  "users.request_create": "usersRequestCreate",
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function delegationStatus(
  permission: OrganizationDelegationRecord,
): "CURRENT" | "UPCOMING" | "HISTORY" {
  if (permission.revokedAt) {
    return "HISTORY";
  }

  return getOrganizationEffectiveStatus(
    permission.effectiveFrom,
    permission.effectiveUntil,
  );
}

export function OrganizationDelegationPanel({
  accessToken,
  office,
  tree,
}: OrganizationDelegationPanelProps) {
  const { t, i18n } = useTranslation("organization");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  const allUnits = useMemo(() => flattenTree(tree), [tree]);
  const activeUnits = useMemo(
    () => allUnits.filter((unit) => unit.isActive),
    [allUnits],
  );

  const [records, setRecords] = useState<OrganizationDelegationRecord[]>([]);
  const [context, setContext] = useState<OrganizationDelegationContextResponse | null>(null);
  const [filter, setFilter] = useState<DelegationFilter>("CURRENT");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionMode, setActionMode] = useState<DelegationActionMode>(null);
  const [selectedPermissionId, setSelectedPermissionId] = useState<string | null>(null);
  const [scopeOrgUnitId, setScopeOrgUnitId] = useState("");
  const [includeDescendants, setIncludeDescendants] = useState(false);
  const [capability, setCapability] = useState<OrganizationSharedResponsibility | "">("");
  const [granteeAccountId, setGranteeAccountId] = useState("");
  const [canRedelegate, setCanRedelegate] = useState(false);
  const [durationMode, setDurationMode] = useState<AccessDurationMode>("UNTIL_REVOKED");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [reason, setReason] = useState("");
  const [revokeEffectiveAt, setRevokeEffectiveAt] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingContext, setLoadingContext] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const selectedPermission = useMemo(
    () => records.find((record) => record.id === selectedPermissionId) ?? null,
    [records, selectedPermissionId],
  );

  const capabilityLabel = useCallback(
    (value: string): string => {
      const responsibilityKey =
        RESPONSIBILITY_KEYS[value as OrganizationSharedResponsibility];
      if (responsibilityKey) {
        return t(`delegation.responsibilities.${responsibilityKey}.title`);
      }
      const key = CAPABILITY_KEYS[value as OrganizationDelegationCapability];
      if (key) {
        return t(`delegation.capabilities.${key}`);
      }

      return value
        .split(/[._]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    },
    [t],
  );

  const selectedCandidate = useMemo(
    () => context?.candidates.find((candidate) => candidate.accountId === granteeAccountId) ?? null,
    [context?.candidates, granteeAccountId],
  );

  const selectedScope = useMemo(
    () => activeUnits.find((unit) => unit.id === scopeOrgUnitId) ?? null,
    [activeUnits, scopeOrgUnitId],
  );

  const responsibilityKey = capability
    ? RESPONSIBILITY_KEYS[capability]
    : null;

  const responsibilityDetailKeys = capability
    ? RESPONSIBILITY_DETAIL_KEYS[capability]
    : null;
  const responsibilityCan =
    responsibilityKey && responsibilityDetailKeys
      ? responsibilityDetailKeys.can.map((item) =>
          t(`delegation.responsibilities.${responsibilityKey}.${item}`),
        )
      : [];
  const responsibilityCannot =
    responsibilityKey && responsibilityDetailKeys
      ? responsibilityDetailKeys.cannot.map((item) =>
          t(`delegation.responsibilities.${responsibilityKey}.${item}`),
        )
      : [];

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredRecords = useMemo(
    () => records.filter((record) => {
      const status = delegationStatus(record);
      if (filter !== "ALL" && status !== filter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const capabilityName = capabilityLabel(record.capability);

      return [
        record.grantee.employee?.empName ?? record.grantee.username,
        record.grantee.employee?.empId ?? "",
        record.orgUnit?.name ?? office.name,
        record.orgUnit?.code ?? office.code,
        record.capability,
        capabilityName,
        record.grantedBy.username,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    }),
    [capabilityLabel, filter, normalizedSearch, office.code, office.name, records],
  );

  const currentCount = records.filter((record) => delegationStatus(record) === "CURRENT").length;
  const upcomingCount = records.filter((record) => delegationStatus(record) === "UPCOMING").length;
  const historyCount = records.filter((record) => delegationStatus(record) === "HISTORY").length;


  function resetGrantForm(): void {
    setScopeOrgUnitId("");
    setIncludeDescendants(false);
    setCapability("");
    setGranteeAccountId("");
    setCanRedelegate(false);
    setDurationMode("UNTIL_REVOKED");
    setEffectiveFrom("");
    setEffectiveUntil("");
    setReason("");
    setFormError("");
  }

  function closeAction(): void {
    setActionMode(null);
    setSelectedPermissionId(null);
    setRevokeEffectiveAt("");
    setRevokeReason("");
    resetGrantForm();
  }

  function refreshDelegations(message?: string): void {
    if (message) {
      setSuccess(message);
    }
    setError("");
    closeAction();
    setRefreshVersion((current) => current + 1);
  }

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
      }
    });

    getOrganizationDelegations(accessToken, office.id)
      .then((response) => {
        if (active) {
          setRecords(response.data);
          setError("");
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getErrorMessage(requestError, t("delegation.errors.load")));
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

    queueMicrotask(() => {
      if (active) {
        setLoadingContext(true);
      }
    });

    getOrganizationDelegationContext(
      accessToken,
      office.id,
      scopeOrgUnitId || null,
      includeDescendants,
    )
      .then((response) => {
        if (!active) {
          return;
        }

        setContext(response);
        setCapability((current) =>
          current && response.availableResponsibilities.includes(current)
            ? current
            : "",
        );
      })
      .catch((requestError: unknown) => {
        if (active) {
          const message = getErrorMessage(
            requestError,
            t("delegation.errors.context"),
          );
          setContext(null);
          setError(message);
          setFormError(message);
        }
      })
      .finally(() => {
        if (active) {
          setLoadingContext(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, includeDescendants, office.id, refreshVersion, scopeOrgUnitId, t]);

  async function submitGrant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const cleanReason = normalizeOrganizationReason(reason);
    if (cleanReason.length < 3) {
      setFormError(t("delegation.errors.reason"));
      return;
    }

    if (!capability || !granteeAccountId) {
      setFormError(t("delegation.errors.selection"));
      return;
    }

    if (!context?.availableResponsibilities.includes(capability)) {
      setFormError(t("delegation.errors.scope"));
      return;
    }

    if (durationMode === "TEMPORARY" && !effectiveUntil) {
      setFormError(t("delegation.errors.temporaryEnd"));
      return;
    }

    const fromIso = toOptionalOrganizationIso(effectiveFrom);
    const untilIso =
      durationMode === "TEMPORARY"
        ? toOptionalOrganizationIso(effectiveUntil)
        : undefined;
    if (
      fromIso &&
      untilIso &&
      new Date(untilIso).getTime() <= new Date(fromIso).getTime()
    ) {
      setFormError(t("delegation.errors.period"));
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const response = await createOrganizationDelegation(
        accessToken,
        office.id,
        {
          granteeAccountId,
          capability,
          orgUnitId: scopeOrgUnitId || null,
          includeDescendants: Boolean(scopeOrgUnitId) && includeDescendants,
          canRedelegate,
          effectiveFrom: fromIso,
          effectiveUntil: untilIso,
          reason: cleanReason,
        },
      );
      refreshDelegations(response.message);
    } catch (requestError: unknown) {
      setFormError(getErrorMessage(requestError, t("delegation.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  async function submitRevoke(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedPermission?.availableActions.revoke) {
      setFormError(t("delegation.errors.revokeNotAllowed"));
      return;
    }

    const cleanReason = normalizeOrganizationReason(revokeReason);
    if (cleanReason.length < 3) {
      setFormError(t("delegation.errors.reason"));
      return;
    }

    const effectiveAt = toOptionalOrganizationIso(revokeEffectiveAt);
    if (effectiveAt && new Date(effectiveAt).getTime() > Date.now() + 60_000) {
      setFormError(t("delegation.errors.futureRevoke"));
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const response = await revokeOrganizationDelegation(
        accessToken,
        office.id,
        selectedPermission.id,
        {
          effectiveAt,
          reason: cleanReason,
        },
      );
      refreshDelegations(response.message);
    } catch (requestError: unknown) {
      setFormError(getErrorMessage(requestError, t("delegation.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  function openGrant(): void {
    resetGrantForm();
    setActionMode("GRANT");
    setSelectedPermissionId(null);
    setSuccess("");
  }

  function openRevoke(permissionId: string): void {
    setActionMode("REVOKE");
    setSelectedPermissionId(permissionId);
    setRevokeEffectiveAt("");
    setRevokeReason("");
    setFormError("");
    setSuccess("");
  }

  return (
    <section className="organization-delegation-workspace">
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

      <section className="organization-people-toolbar organization-delegation-toolbar">
        <div>
          <span>{t("delegation.eyebrow")}</span>
          <h3>{t("delegation.title")}</h3>
          <p>{t("delegation.description")}</p>
        </div>
        {context?.hasDelegationAuthority && (
          <button
            type="button"
            className="organization-button organization-button--primary"
            onClick={openGrant}
          >
            {t("delegation.grant")}
          </button>
        )}
      </section>

      {!loadingContext && context && !context.hasDelegationAuthority && (
        <div className="organization-readonly-note">
          <strong>{t("delegation.readonlyTitle")}</strong>
          <span>{t("delegation.readonlyDescription")}</span>
        </div>
      )}

      <section className="organization-summary-grid" aria-label={t("delegation.summaryAria")}>
        <article className="organization-summary-card">
          <span>{t("delegation.current")}</span>
          <strong>{currentCount}</strong>
          <small>{t("delegation.currentDetail")}</small>
        </article>
        <article className="organization-summary-card">
          <span>{t("delegation.upcoming")}</span>
          <strong>{upcomingCount}</strong>
          <small>{t("delegation.upcomingDetail")}</small>
        </article>
        <article className="organization-summary-card">
          <span>{t("delegation.history")}</span>
          <strong>{historyCount}</strong>
          <small>{t("delegation.historyDetail")}</small>
        </article>
        <article className="organization-summary-card">
          <span>{t("delegation.visible")}</span>
          <strong>{records.length}</strong>
          <small>{t("delegation.visibleDetail")}</small>
        </article>
      </section>

      <section className="organization-control-bar organization-delegation-filters" aria-label={t("delegation.filtersAria")}>
        <label>
          <span>{t("delegation.search")}</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("delegation.searchPlaceholder")}
          />
        </label>
        <label>
          <span>{t("delegation.status")}</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as DelegationFilter)}
          >
            <option value="CURRENT">{t("delegation.filters.CURRENT")}</option>
            <option value="UPCOMING">{t("delegation.filters.UPCOMING")}</option>
            <option value="HISTORY">{t("delegation.filters.HISTORY")}</option>
            <option value="ALL">{t("delegation.filters.ALL")}</option>
          </select>
        </label>
        <div className="organization-control-bar__result">
          <strong>{t("delegation.matching", { count: filteredRecords.length })}</strong>
          <span>{office.name}</span>
        </div>
      </section>

      {actionMode === "GRANT" && (
        <section className="organization-inline-editor organization-delegation-editor">
          <header>
            <div>
              <span>{t("delegation.actionEyebrow")}</span>
              <h4>{t("delegation.grantTitle")}</h4>
            </div>
            <button type="button" className="organization-editor-close" onClick={closeAction}>
              {t("common.close")}
            </button>
          </header>

          {formError && <div className="organization-editor-error" role="alert">{formError}</div>}

          <form className="organization-form" onSubmit={submitGrant}>
            <label>
              <span>{t("delegation.scope")}</span>
              <select
                value={scopeOrgUnitId}
                onChange={(event) => {
                  const nextScopeOrgUnitId = event.target.value;
                  setScopeOrgUnitId(nextScopeOrgUnitId);
                  setIncludeDescendants(
                    capability === "shared.work_type_management" &&
                      Boolean(nextScopeOrgUnitId),
                  );
                }}
                disabled={saving}
              >
                <option value="">{office.name} — {t("delegation.officeScope")}</option>
                {activeUnits
                  .filter(
                    (unit) =>
                      capability !== "shared.work_type_management" ||
                      unit.orgUnitType.code === "DIVISION",
                  )
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>
                  ))}
              </select>
            </label>

            <label>
              <span>{t("delegation.responsibility")}</span>
              <select
                value={capability}
                onChange={(event) => {
                  const nextCapability = event.target.value as
                    | OrganizationSharedResponsibility
                    | "";
                  setCapability(nextCapability);
                  if (
                    nextCapability === "shared.work_type_management" &&
                    scopeOrgUnitId
                  ) {
                    setIncludeDescendants(true);
                  }
                }}
                disabled={saving || loadingContext || (context?.availableResponsibilities.length ?? 0) === 0}
                required
              >
                <option value="">{loadingContext ? t("delegation.checkingScope") : t("delegation.selectResponsibility")}</option>
                {context?.availableResponsibilities.map((item) => (
                  <option key={item} value={item}>{capabilityLabel(item)}</option>
                ))}
              </select>
            </label>

            <label>
              <span>{t("delegation.employee")}</span>
              <select
                value={granteeAccountId}
                onChange={(event) => setGranteeAccountId(event.target.value)}
                disabled={saving || loadingContext || (context?.candidates.length ?? 0) === 0}
                required
              >
                <option value="">{t("delegation.selectEmployee")}</option>
                {context?.candidates.map((candidate) => (
                  <option key={candidate.accountId} value={candidate.accountId}>
                    {candidate.empName} ({candidate.empId}) — {candidate.primaryOrgUnit?.name ?? office.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{t("delegation.effectiveFrom")}</span>
              <input
                type="datetime-local"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                disabled={saving}
              />
            </label>

            <fieldset className="organization-delegation-duration organization-form-wide">
              <legend>{t("delegation.accessDuration")}</legend>
              <label>
                <input
                  type="radio"
                  name="access-duration"
                  value="UNTIL_REVOKED"
                  checked={durationMode === "UNTIL_REVOKED"}
                  onChange={() => {
                    setDurationMode("UNTIL_REVOKED");
                    setEffectiveUntil("");
                  }}
                  disabled={saving}
                />
                <span>{t("delegation.untilRevoked")}</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="access-duration"
                  value="TEMPORARY"
                  checked={durationMode === "TEMPORARY"}
                  onChange={() => setDurationMode("TEMPORARY")}
                  disabled={saving}
                />
                <span>{t("delegation.temporaryCoverage")}</span>
              </label>
            </fieldset>

            {durationMode === "TEMPORARY" && (
              <label>
                <span>{t("delegation.effectiveUntil")}</span>
                <input
                  type="datetime-local"
                  value={effectiveUntil}
                  onChange={(event) => setEffectiveUntil(event.target.value)}
                  disabled={saving}
                  required
                />
              </label>
            )}

            <label className="organization-delegation-check">
              <input
                type="checkbox"
                checked={includeDescendants}
                onChange={(event) => setIncludeDescendants(event.target.checked)}
                disabled={saving || !scopeOrgUnitId || capability === "shared.work_type_management"}
              />
              <span>{t("delegation.includeDescendants")}</span>
            </label>

            <label className="organization-form-wide">
              <span>{t("delegation.reason")}</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                disabled={saving}
                required
              />
            </label>

            <details className="organization-delegation-advanced organization-form-wide">
              <summary>{t("delegation.advancedOptions")}</summary>
              <label className="organization-delegation-check">
                <input
                  type="checkbox"
                  checked={canRedelegate}
                  onChange={(event) => setCanRedelegate(event.target.checked)}
                  disabled={saving}
                />
                <span>{t("delegation.allowRedelegation")}</span>
              </label>
              <p>{t("delegation.redelegationHelp")}</p>
            </details>

            {!loadingContext && context?.availableResponsibilities.length === 0 && (
              <div className="organization-editor-note organization-form-wide">
                {t("delegation.noResponsibilityForScope")}
              </div>
            )}

            {capability && granteeAccountId && (
              <section className="organization-delegation-access-summary organization-form-wide" aria-label={t("delegation.accessSummary")}>
                <div className="organization-delegation-access-summary__title">
                  <span>{t("delegation.accessSummary")}</span>
                  <strong>{capabilityLabel(capability)}</strong>
                </div>
                <dl>
                  <div><dt>{t("delegation.employee")}</dt><dd>{selectedCandidate?.empName ?? "—"}</dd></div>
                  <div><dt>{t("delegation.responsibility")}</dt><dd>{capabilityLabel(capability)}</dd></div>
                  <div><dt>{t("delegation.scope")}</dt><dd>{selectedScope?.name ?? office.name}</dd></div>
                  <div><dt>{t("delegation.coverage")}</dt><dd>{selectedScope ? (includeDescendants ? t("delegation.scopeWithDescendants", { scope: selectedScope.name }) : selectedScope.name) : office.name}</dd></div>
                  <div><dt>{t("delegation.duration")}</dt><dd>{durationMode === "TEMPORARY" ? `${effectiveFrom ? formatOrganizationDate(effectiveFrom, locale, t("delegation.now")) : t("delegation.now")} → ${effectiveUntil ? formatOrganizationDate(effectiveUntil, locale, t("delegation.endRequired")) : t("delegation.endRequired")}` : t("delegation.untilRevoked")}</dd></div>
                  <div><dt>{t("delegation.canRedelegate")}</dt><dd>{canRedelegate ? t("delegation.yes") : t("delegation.no")}</dd></div>
                </dl>
                <div className="organization-delegation-access-summary__permissions">
                  <div>
                    <strong>{t("delegation.canDo")}</strong>
                    <ul>{responsibilityCan.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  <div>
                    <strong>{t("delegation.cannotDo")}</strong>
                    <ul>{responsibilityCannot.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
              </section>
            )}

            <footer>
              <button type="button" className="organization-button organization-button--secondary" onClick={closeAction} disabled={saving}>
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="organization-button organization-button--primary"
                disabled={saving || loadingContext || !capability || !granteeAccountId || (durationMode === "TEMPORARY" && !effectiveUntil)}
              >
                {saving ? t("delegation.saving") : t("delegation.grant")}
              </button>
            </footer>
          </form>
        </section>
      )}

      {actionMode === "REVOKE" && selectedPermission && (
        <section className="organization-inline-editor organization-delegation-editor">
          <header>
            <div>
              <span>{t("delegation.actionEyebrow")}</span>
              <h4>{t("delegation.revokeTitle")}</h4>
            </div>
            <button type="button" className="organization-editor-close" onClick={closeAction}>
              {t("common.close")}
            </button>
          </header>

          {formError && <div className="organization-editor-error" role="alert">{formError}</div>}

          <form className="organization-form" onSubmit={submitRevoke}>
            <div className="organization-editor-note organization-form-wide">
              {t("delegation.revokeNotice", {
                person: selectedPermission.grantee.employee?.empName ?? selectedPermission.grantee.username,
                capability: capabilityLabel(selectedPermission.capability),
              })}
            </div>
            <label>
              <span>{t("delegation.revokeAt")}</span>
              <input
                type="datetime-local"
                value={revokeEffectiveAt}
                onChange={(event) => setRevokeEffectiveAt(event.target.value)}
                disabled={saving}
              />
            </label>
            <label className="organization-form-wide">
              <span>{t("delegation.reason")}</span>
              <input
                value={revokeReason}
                onChange={(event) => setRevokeReason(event.target.value)}
                maxLength={500}
                disabled={saving}
                required
              />
            </label>
            <footer>
              <button type="button" className="organization-button organization-button--secondary" onClick={closeAction} disabled={saving}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="organization-button organization-button--danger" disabled={saving}>
                {saving ? t("delegation.saving") : t("delegation.revoke")}
              </button>
            </footer>
          </form>
        </section>
      )}

      <section className="organization-delegation-list-panel">
        <header>
          <div>
            <span>{t("delegation.recordsEyebrow")}</span>
            <h4>{t("delegation.recordsTitle")}</h4>
          </div>
          <span>{t("delegation.matching", { count: filteredRecords.length })}</span>
        </header>

        {loading ? (
          <div className="organization-empty-state"><strong>{t("delegation.loading")}</strong></div>
        ) : filteredRecords.length === 0 ? (
          <div className="organization-empty-state">
            <strong>{t("delegation.empty")}</strong>
            <span>{t("delegation.emptyDescription")}</span>
          </div>
        ) : (
          <div className="organization-delegation-list">
            {filteredRecords.map((record) => {
              const status = delegationStatus(record);
              const granteeName = record.grantee.employee?.empName ?? record.grantee.username;
              const granteeId = record.grantee.employee?.empId ?? record.grantee.username;
              return (
                <article key={record.id} className="organization-delegation-card">
                  <div className="organization-delegation-person">
                    <span className="organization-person-avatar" aria-hidden="true">
                      {granteeName.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{granteeName}</strong>
                      <small>{granteeId}</small>
                    </span>
                  </div>

                  <div className="organization-delegation-capability">
                    <span>{t("delegation.capability")}</span>
                    <strong>{capabilityLabel(record.capability)}</strong>
                    <small>{record.orgUnit?.name ?? office.name}</small>
                  </div>

                  <div className="organization-delegation-period">
                    <span>{t("delegation.period")}</span>
                    <strong>{formatOrganizationDate(record.effectiveFrom, locale, t("common.notAvailable"))}</strong>
                    <small>
                      {record.effectiveUntil
                        ? t("delegation.until", { date: formatOrganizationDate(record.effectiveUntil, locale, t("common.notAvailable")) })
                        : t("delegation.openEnded")}
                    </small>
                  </div>

                  <div className="organization-delegation-flags">
                    <span className={`organization-delegation-state is-${status.toLowerCase()}`}>
                      {record.revokedAt ? t("delegation.revoked") : t(`delegation.filters.${status}`)}
                    </span>
                    {record.includeDescendants && <small>{t("delegation.descendantsBadge")}</small>}
                    {record.canRedelegate && <small>{t("delegation.redelegationBadge")}</small>}
                  </div>

                  <div className="organization-delegation-reason">
                    <span>{t("delegation.reason")}</span>
                    <p>{record.grantReason}</p>
                    <small>{t("delegation.grantedBy", { user: record.grantedBy.username })}</small>
                    {record.revokeReason && <small>{t("delegation.revokedReason", { reason: record.revokeReason })}</small>}
                  </div>

                  {record.availableActions.revoke && (
                    <button type="button" onClick={() => openRevoke(record.id)}>
                      {t("delegation.revoke")}
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
