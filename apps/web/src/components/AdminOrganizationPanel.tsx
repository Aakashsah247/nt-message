import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type {
  FormEvent,
} from "react";

import { AdminAccountForm } from "./AdminAccountForm";

import {
  createAdminDepartment,
  createAdminDivision,
  deleteAdminDepartment,
  deleteAdminDivision,
  getAdminDepartments,
  getAdminDivisions,
  updateAdminDepartment,
  updateAdminDivision,
} from "../services/admin-account.service";

import type {
  AdminDepartment,
  AdminDivision,
  DepartmentWorkFunction,
} from "../types/admin-account";

interface AdminOrganizationPanelProps {
  accessToken: string;
}

interface DivisionForm {
  code: string;
  name: string;
}

interface DepartmentForm {
  divisionId: string;
  code: string;
  name: string;
  workFunction: DepartmentWorkFunction;
}

type OrganizationStatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type CreateTarget = "division" | "department" | null;

type DetailTarget =
  | {
      kind: "division";
      item: AdminDivision;
    }
  | {
      kind: "department";
      item: AdminDepartment;
    }
  | null;

type EditTarget =
  | {
      kind: "division";
      id: string;
      code: string;
      name: string;
      isActive: boolean;
    }
  | {
      kind: "department";
      id: string;
      divisionId: string;
      code: string;
      name: string;
      workFunction: DepartmentWorkFunction;
      isActive: boolean;
    }
  | null;

type DeleteTarget =
  | {
      kind: "division";
      id: string;
      name: string;
    }
  | {
      kind: "department";
      id: string;
      name: string;
    }
  | null;

const emptyDivision: DivisionForm = {
  code: "",
  name: "",
};

const emptyDepartment: DepartmentForm = {
  divisionId: "",
  code: "",
  name: "",
  workFunction: "GENERAL",
};

const DEPARTMENT_WORK_FUNCTIONS: DepartmentWorkFunction[] = [
  "GENERAL",
  "FIELD_OPERATIONS",
  "SALES",
  "SUPPORT",
];

function formatDepartmentWorkFunction(
  value: DepartmentWorkFunction,
  t: TFunction<"organization">,
): string {
  return t(`workFunction.${value}.label`, { ns: "organization", defaultValue: value });
}

const fieldClass =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition hover:border-blue-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100";

const labelClass =
  "grid gap-2 text-[11px] font-black uppercase tracking-wide text-slate-600";

const primaryButtonClass =
  "min-h-10 rounded-xl border-0 border-b-[3px] border-amber-400 bg-gradient-to-r from-[#073a70] via-[#075ca8] to-[#16a4df] px-4 text-xs font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

const secondaryButtonClass =
  "min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

function getErrorMessage(
  error: unknown,
  t: TFunction<"organization">,
): string {
  return error instanceof Error
    ? error.message
    : t("errors.operationFailed", { ns: "organization" });
}

function normalizeCode(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase();
}

function normalizeName(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function formatOrganizationDate(
  value: string | undefined,
  locale: string,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

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

function getDivisionBlockers(
  division: AdminDivision,
  t: TFunction<"organization">,
): string[] {
  const blockers: string[] = [];

  if (division._count.departments > 0) {
    blockers.push(t("blockers.departments", { ns: "organization", count: division._count.departments }));
  }

  if (division._count.employees > 0) {
    blockers.push(t("blockers.employees", { ns: "organization", count: division._count.employees }));
  }

  if (division._count.accountRequests > 0) {
    blockers.push(t("blockers.requests", { ns: "organization", count: division._count.accountRequests }));
  }

  if (division._count.managementPositions > 0) {
    blockers.push(t("blockers.positions", { ns: "organization", count: division._count.managementPositions }));
  }

  return blockers;
}

function getDepartmentBlockers(
  department: AdminDepartment,
  t: TFunction<"organization">,
): string[] {
  const blockers: string[] = [];

  if (department._count.employees > 0) {
    blockers.push(t("blockers.employees", { ns: "organization", count: department._count.employees }));
  }

  if (department._count.accountRequests > 0) {
    blockers.push(t("blockers.requests", { ns: "organization", count: department._count.accountRequests }));
  }

  if (department._count.managementPositions > 0) {
    blockers.push(t("blockers.positions", { ns: "organization", count: department._count.managementPositions }));
  }

  return blockers;
}

function getDepartmentDependencyCount(
  department: AdminDepartment,
): number {
  return (
    department._count.employees +
    department._count.accountRequests +
    department._count.managementPositions
  );
}

function getDivisionDependencyCount(
  division: AdminDivision,
): number {
  return (
    division._count.departments +
    division._count.employees +
    division._count.accountRequests +
    division._count.managementPositions
  );
}

export function AdminOrganizationPanel({
  accessToken,
}: AdminOrganizationPanelProps) {
  const { t, i18n } = useTranslation("organization");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";

  const [
    divisions,
    setDivisions,
  ] = useState<AdminDivision[]>([]);

  const [
    departments,
    setDepartments,
  ] = useState<AdminDepartment[]>([]);

  const [
    divisionForm,
    setDivisionForm,
  ] = useState<DivisionForm>(emptyDivision);

  const [
    departmentForm,
    setDepartmentForm,
  ] = useState<DepartmentForm>(emptyDepartment);

  const [
    createTarget,
    setCreateTarget,
  ] = useState<CreateTarget>(null);

  const [
    showCreateAccount,
    setShowCreateAccount,
  ] = useState(false);

  const [
    detailTarget,
    setDetailTarget,
  ] = useState<DetailTarget>(null);

  const [
    editTarget,
    setEditTarget,
  ] = useState<EditTarget>(null);

  const [
    deleteTarget,
    setDeleteTarget,
  ] = useState<DeleteTarget>(null);

  const [
    deleteConfirmation,
    setDeleteConfirmation,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingDivision,
    setSavingDivision,
  ] = useState(false);

  const [
    savingDepartment,
    setSavingDepartment,
  ] = useState(false);

  const [
    savingAction,
    setSavingAction,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    dialogError,
    setDialogError,
  ] = useState("");

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const [
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<OrganizationStatusFilter>("ALL");

  const [
    expandedDivisionId,
    setExpandedDivisionId,
  ] = useState<string | null>(null);

  const activeDivisions = useMemo(
    () => divisions.filter((division) => division.isActive),
    [divisions],
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();

  function matchesStatus(
    isActive: boolean,
  ): boolean {
    return (
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && isActive) ||
      (statusFilter === "INACTIVE" && !isActive)
    );
  }

  const filteredDepartments = useMemo(
    () =>
      departments.filter((department) => {
        const matchesSearch =
          normalizedSearch.length === 0 ||
          department.name.toLowerCase().includes(normalizedSearch) ||
          department.code.toLowerCase().includes(normalizedSearch) ||
          department.division.name.toLowerCase().includes(normalizedSearch) ||
          department.division.code.toLowerCase().includes(normalizedSearch) ||
          formatDepartmentWorkFunction(department.workFunction, t)
            .toLowerCase()
            .includes(normalizedSearch);

        return matchesSearch && matchesStatus(department.isActive);
      }),
    [departments, normalizedSearch, statusFilter, t],
  );

  const directMatchingDivisionIds = useMemo(
    () =>
      new Set(
        divisions
          .filter((division) => {
            const matchesSearch =
              normalizedSearch.length === 0 ||
              division.name.toLowerCase().includes(normalizedSearch) ||
              division.code.toLowerCase().includes(normalizedSearch);

            return matchesSearch && matchesStatus(division.isActive);
          })
          .map((division) => division.id),
      ),
    [divisions, normalizedSearch, statusFilter],
  );

  const parentDivisionIds = useMemo(
    () =>
      new Set(
        filteredDepartments.map((department) => department.division.id),
      ),
    [filteredDepartments],
  );

  // A division remains visible when one of its departments matches the filters.
  // This preserves the hierarchy instead of presenting an orphan department.
  const filteredDivisions = useMemo(
    () =>
      divisions.filter(
        (division) =>
          directMatchingDivisionIds.has(division.id) ||
          parentDivisionIds.has(division.id),
      ),
    [divisions, directMatchingDivisionIds, parentDivisionIds],
  );

  const organizationSummary = useMemo(() => {
    const activeUnits =
      divisions.filter((division) => division.isActive).length +
      departments.filter((department) => department.isActive).length;

    const protectedUnits =
      divisions.filter((division) => getDivisionBlockers(division, t).length > 0).length +
      departments.filter((department) => getDepartmentBlockers(department, t).length > 0).length;

    return {
      divisions: divisions.length,
      departments: departments.length,
      activeUnits,
      protectedUnits,
    };
  }, [departments, divisions, t]);

  const matchingUnitCount =
    directMatchingDivisionIds.size + filteredDepartments.length;

  useEffect(() => {
    let active = true;

    Promise.all([
      getAdminDivisions(accessToken),
      getAdminDepartments(accessToken),
    ])
      .then(([divisionResponse, departmentResponse]) => {
        if (!active) {
          return;
        }

        setDivisions(divisionResponse.data);
        setDepartments(departmentResponse.data);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setError(getErrorMessage(requestError, t));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  function refreshOrganization(): void {
    setLoading(true);
    setError("");
    setRefreshKey((current) => current + 1);
  }

  function clearMessages(): void {
    setError("");
    setSuccess("");
    setDialogError("");
  }

  function closeCreateDialog(): void {
    setCreateTarget(null);
    setDialogError("");
  }

  async function submitDivision(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const code = normalizeCode(divisionForm.code);
    const name = normalizeName(divisionForm.name);

    if (code.length < 2 || name.length < 2) {
      setDialogError(t("errors.invalidDivision"));
      return;
    }

    setSavingDivision(true);
    setDialogError("");
    setError("");
    setSuccess("");

    try {
      const response = await createAdminDivision(accessToken, {
        code,
        name,
      });

      setSuccess(response.message);
      setDivisionForm(emptyDivision);
      closeCreateDialog();
      refreshOrganization();
    } catch (requestError: unknown) {
      setDialogError(getErrorMessage(requestError, t));
    } finally {
      setSavingDivision(false);
    }
  }

  async function submitDepartment(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const code = normalizeCode(departmentForm.code);
    const name = normalizeName(departmentForm.name);

    if (!departmentForm.divisionId) {
      setDialogError(t("errors.selectDivision"));
      return;
    }

    if (code.length < 2 || name.length < 2) {
      setDialogError(t("errors.invalidDepartment"));
      return;
    }

    setSavingDepartment(true);
    setDialogError("");
    setError("");
    setSuccess("");

    try {
      const response = await createAdminDepartment(accessToken, {
        divisionId: departmentForm.divisionId,
        code,
        name,
        workFunction: departmentForm.workFunction,
      });

      setSuccess(response.message);
      setDepartmentForm(emptyDepartment);
      closeCreateDialog();
      refreshOrganization();
    } catch (requestError: unknown) {
      setDialogError(getErrorMessage(requestError, t));
    } finally {
      setSavingDepartment(false);
    }
  }

  function openDivisionEdit(
    division: AdminDivision,
  ): void {
    clearMessages();
    setDetailTarget(null);
    setEditTarget({
      kind: "division",
      id: division.id,
      code: division.code,
      name: division.name,
      isActive: division.isActive,
    });
  }

  function openDepartmentEdit(
    department: AdminDepartment,
  ): void {
    clearMessages();
    setDetailTarget(null);
    setEditTarget({
      kind: "department",
      id: department.id,
      divisionId: department.division.id,
      code: department.code,
      name: department.name,
      workFunction: department.workFunction,
      isActive: department.isActive,
    });
  }

  async function submitEdit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!editTarget) {
      return;
    }

    const code = normalizeCode(editTarget.code);
    const name = normalizeName(editTarget.name);

    if (code.length < 2 || name.length < 2) {
      setDialogError(t("errors.invalidUnit"));
      return;
    }

    setSavingAction(true);
    setDialogError("");
    setError("");
    setSuccess("");

    try {
      if (editTarget.kind === "division") {
        const response = await updateAdminDivision(
          accessToken,
          editTarget.id,
          {
            code,
            name,
            isActive: editTarget.isActive,
          },
        );

        setSuccess(response.message);
      } else {
        if (!editTarget.divisionId) {
          setDialogError(t("errors.selectDivision"));
          return;
        }

        const response = await updateAdminDepartment(
          accessToken,
          editTarget.id,
          {
            divisionId: editTarget.divisionId,
            code,
            name,
            workFunction: editTarget.workFunction,
            isActive: editTarget.isActive,
          },
        );

        setSuccess(response.message);
      }

      // Updating preserves the database identity and all linked history.
      setEditTarget(null);
      refreshOrganization();
    } catch (requestError: unknown) {
      setDialogError(getErrorMessage(requestError, t));
    } finally {
      setSavingAction(false);
    }
  }

  function requestDivisionDelete(
    division: AdminDivision,
  ): void {
    const blockers = getDivisionBlockers(division, t);

    if (blockers.length > 0) {
      setError(
        t("errors.deleteBlocked", { name: division.name, blockers: blockers.join(", ") }),
      );
      return;
    }

    clearMessages();
    setDetailTarget(null);
    setDeleteConfirmation("");
    setDeleteTarget({
      kind: "division",
      id: division.id,
      name: division.name,
    });
  }

  function requestDepartmentDelete(
    department: AdminDepartment,
  ): void {
    const blockers = getDepartmentBlockers(department, t);

    if (blockers.length > 0) {
      setError(
        t("errors.deleteBlocked", { name: department.name, blockers: blockers.join(", ") }),
      );
      return;
    }

    clearMessages();
    setDetailTarget(null);
    setDeleteConfirmation("");
    setDeleteTarget({
      kind: "department",
      id: department.id,
      name: department.name,
    });
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }

    if (deleteConfirmation !== "DELETE") {
      setDialogError(t("errors.confirmDelete"));
      return;
    }

    setSavingAction(true);
    setDialogError("");
    setError("");
    setSuccess("");

    try {
      // The backend remains the final authority if a dependency was added
      // after the current organization snapshot was loaded.
      const response =
        deleteTarget.kind === "division"
          ? await deleteAdminDivision(accessToken, deleteTarget.id)
          : await deleteAdminDepartment(accessToken, deleteTarget.id);

      setSuccess(response.message);
      setDeleteTarget(null);
      setDeleteConfirmation("");
      refreshOrganization();
    } catch (requestError: unknown) {
      setDialogError(getErrorMessage(requestError, t));
    } finally {
      setSavingAction(false);
    }
  }

  const detailBlockers = detailTarget
    ? detailTarget.kind === "division"
      ? getDivisionBlockers(detailTarget.item, t)
      : getDepartmentBlockers(detailTarget.item, t)
    : [];

  return (
    <section className="organization-workspace">
      <header className="organization-workspace__hero">
        <div>
          <span className="organization-eyebrow">{t("hero.eyebrow")}</span>
          <h2>{t("hero.title")}</h2>
          <p>{t("hero.description")}</p>
        </div>

        <div className="organization-workspace__hero-actions">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => {
              // Direct account creation remains an explicit Super Admin action.
              // The existing form and backend rules remain the source of truth.
              clearMessages();
              setShowCreateAccount(true);
            }}
          >
            {t("hero.createAccount")}
          </button>

          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => {
              clearMessages();
              setCreateTarget("division");
            }}
          >
            {t("hero.createDivision")}
          </button>

          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => {
              clearMessages();
              setCreateTarget("department");
            }}
            disabled={activeDivisions.length === 0}
          >
            {t("hero.createDepartment")}
          </button>

          <button
            type="button"
            className={secondaryButtonClass}
            onClick={refreshOrganization}
            disabled={loading}
          >
            {loading ? t("hero.refreshing") : t("hero.refresh")}
          </button>
        </div>
      </header>

      {success && (
        <div className="organization-feedback organization-feedback--success" role="status">
          {success}
        </div>
      )}

      {error && (
        <div className="organization-feedback organization-feedback--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>{t("common.close")}</button>
        </div>
      )}

      <section className="organization-summary-grid" aria-label={t("summary.aria")}>
        <article className="organization-summary-card organization-summary-card--blue">
          <span>{t("summary.divisions")}</span>
          <strong>{organizationSummary.divisions}</strong>
          <small>{t("summary.divisionsDetail")}</small>
        </article>

        <article className="organization-summary-card organization-summary-card--green">
          <span>{t("summary.departments")}</span>
          <strong>{organizationSummary.departments}</strong>
          <small>{t("summary.departmentsDetail")}</small>
        </article>

        <article className="organization-summary-card organization-summary-card--gold">
          <span>{t("summary.active")}</span>
          <strong>{organizationSummary.activeUnits}</strong>
          <small>{t("summary.activeDetail")}</small>
        </article>

        <article className="organization-summary-card organization-summary-card--red">
          <span>{t("summary.protected")}</span>
          <strong>{organizationSummary.protectedUnits}</strong>
          <small>{t("summary.protectedDetail")}</small>
        </article>
      </section>

      <section className="organization-control-bar" aria-label={t("filters.aria")}>
        <label>
          <span>{t("filters.search")}</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("filters.placeholder")}
          />
        </label>

        <label>
          <span>{t("filters.status")}</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as OrganizationStatusFilter)
            }
          >
            <option value="ALL">{t("filters.all")}</option>
            <option value="ACTIVE">{t("filters.active")}</option>
            <option value="INACTIVE">{t("filters.inactive")}</option>
          </select>
        </label>

        <div className="organization-control-bar__result">
          <strong>{t("filters.matching", { count: matchingUnitCount })}</strong>
        </div>

        {(searchTerm || statusFilter !== "ALL") && (
          <button
            type="button"
            className="organization-control-bar__clear"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("ALL");
            }}
          >
            {t("filters.clear")}
          </button>
        )}
      </section>

      <section className="organization-hierarchy-panel">
        <header>
          <div>
            <span>{t("hierarchy.eyebrow")}</span>
            <h3>{t("hierarchy.title")}</h3>
            <p>{t("hierarchy.description")}</p>
          </div>
        </header>

        {loading && divisions.length === 0 ? (
          <div className="organization-empty-state">
            <strong>{t("hierarchy.loadingTitle")}</strong>
            <span>{t("hierarchy.loadingDescription")}</span>
          </div>
        ) : filteredDivisions.length === 0 ? (
          <div className="organization-empty-state">
            <strong>{t("hierarchy.emptyTitle")}</strong>
            <span>{t("hierarchy.emptyDescription")}</span>
          </div>
        ) : (
          <div className="organization-hierarchy-list">
            {filteredDivisions.map((division) => {
              const childDepartments = filteredDepartments.filter(
                (department) => department.division.id === division.id,
              );
              const isExpanded = expandedDivisionId === division.id;
              const hasVisibleDepartments = childDepartments.length > 0;
              const blockerCount = getDivisionDependencyCount(division);

              return (
                <article key={division.id} className="organization-hierarchy-item">
                  <div className="organization-hierarchy-item__summary">
                    <span className="organization-hierarchy-item__badge" aria-hidden="true">
                      {division.code.slice(0, 2)}
                    </span>

                    <span className="organization-hierarchy-item__identity">
                      <strong>{division.name}</strong>
                      <small>{t("hierarchy.divisionSummary", {
                        code: division.code,
                        departments: division._count.departments,
                        employees: division._count.employees,
                      })}</small>
                    </span>

                    <span
                      className={
                        division.isActive
                          ? "organization-status organization-status--active"
                          : "organization-status"
                      }
                    >
                      {division.isActive ? t("common.active") : t("common.inactive")}
                    </span>

                    <div className="organization-hierarchy-item__row-actions">
                      <button
                        type="button"
                        className="organization-action organization-action--quiet"
                        onClick={() => setDetailTarget({ kind: "division", item: division })}
                      >
                        {t("hierarchy.manageUnit")}
                      </button>

                      <button
                        type="button"
                        className="organization-action organization-action--quiet"
                        onClick={() => openDivisionEdit(division)}
                      >
                        {t("hierarchy.edit")}
                      </button>

                      <button
                        type="button"
                        className="organization-action organization-action--toggle"
                        onClick={() =>
                          setExpandedDivisionId(isExpanded ? null : division.id)
                        }
                        aria-expanded={isExpanded}
                        aria-controls={`division-${division.id}-departments`}
                        disabled={!hasVisibleDepartments}
                      >
                        {hasVisibleDepartments
                          ? isExpanded
                            ? t("hierarchy.hideDepartments")
                            : t("hierarchy.viewDepartments", { value: childDepartments.length })
                          : normalizedSearch || statusFilter !== "ALL"
                            ? t("hierarchy.noMatchingDepartments")
                            : t("hierarchy.noDepartments")}
                      </button>
                    </div>
                  </div>

                  <div className="organization-hierarchy-item__context">
                    <span>{t("hierarchy.accountRequests", { value: division._count.accountRequests })}</span>
                    <span>{t("hierarchy.managementPositions", { value: division._count.managementPositions })}</span>
                    <span className={blockerCount > 0 ? "organization-protection-badge" : ""}>
                      {blockerCount > 0
                        ? t("hierarchy.protected", { value: blockerCount })
                        : t("hierarchy.eligible")}
                    </span>
                  </div>

                  {isExpanded && (
                    <div
                      className="organization-hierarchy-item__details"
                      id={`division-${division.id}-departments`}
                    >
                      <div className="organization-department-grid">
                        {childDepartments.map((department) => {
                          const departmentDependencies =
                            getDepartmentDependencyCount(department);

                          return (
                            <article
                              key={department.id}
                              className="organization-department-card"
                            >
                              <div className="organization-department-card__identity">
                                <strong>{department.name}</strong>
                                <small>{t("hierarchy.departmentSummary", {
                                  code: department.code,
                                  employees: department._count.employees,
                                })}</small>
                              </div>

                              <span
                                className={
                                  department.isActive
                                    ? "organization-status organization-status--active"
                                    : "organization-status"
                                }
                              >
                                {department.isActive ? t("common.active") : t("common.inactive")}
                              </span>

                              <span className="organization-department-card__protection">
                                {departmentDependencies > 0
                                  ? t("hierarchy.linkedRecords", { count: departmentDependencies })
                                  : t("hierarchy.noDependencies")}
                              </span>

                              <div className="organization-department-card__actions">
                                <button
                                  type="button"
                                  className="organization-action organization-action--quiet"
                                  onClick={() =>
                                    setDetailTarget({ kind: "department", item: department })
                                  }
                                >
                                  {t("hierarchy.manageUnit")}
                                </button>

                                <button
                                  type="button"
                                  className="organization-action organization-action--quiet"
                                  onClick={() => openDepartmentEdit(department)}
                                >
                                  {t("hierarchy.edit")}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {createTarget && (
        <div className="organization-dialog-backdrop" role="presentation">
          <section
            className="organization-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("create.dialogAria", { kind: t(`common.${createTarget}`) })}
          >
            <header>
              <div>
                <span>{t("create.eyebrow")}</span>
                <h3>
                  {createTarget === "division"
                    ? t("create.division")
                    : t("create.department")}
                </h3>
              </div>
              <button type="button" onClick={closeCreateDialog} aria-label={t("create.close")}>
                ×
              </button>
            </header>

            {createTarget === "division" ? (
              <form onSubmit={submitDivision}>
                <div className="organization-dialog__body">
                  {dialogError && (
                    <div className="organization-dialog__error" role="alert">
                      {dialogError}
                    </div>
                  )}

                  <label className={labelClass}>
                    {t("create.divisionCode")}
                    <input
                      className={fieldClass}
                      type="text"
                      value={divisionForm.code}
                      onChange={(event) => {
                        setDivisionForm((current) => ({
                          ...current,
                          code: event.target.value.toUpperCase(),
                        }));
                        setDialogError("");
                      }}
                      placeholder={t("create.divisionCodePlaceholder")}
                      maxLength={50}
                      disabled={savingDivision}
                      required
                    />
                  </label>

                  <label className={labelClass}>
                    {t("create.divisionName")}
                    <input
                      className={fieldClass}
                      type="text"
                      value={divisionForm.name}
                      onChange={(event) => {
                        setDivisionForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }));
                        setDialogError("");
                      }}
                      placeholder={t("create.divisionNamePlaceholder")}
                      maxLength={120}
                      disabled={savingDivision}
                      required
                    />
                  </label>
                </div>

                <footer>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={closeCreateDialog}
                    disabled={savingDivision}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    className={primaryButtonClass}
                    disabled={savingDivision}
                  >
                    {savingDivision ? t("create.creating") : t("create.createDivision")}
                  </button>
                </footer>
              </form>
            ) : (
              <form onSubmit={submitDepartment}>
                <div className="organization-dialog__body">
                  {dialogError && (
                    <div className="organization-dialog__error" role="alert">
                      {dialogError}
                    </div>
                  )}

                  <label className={labelClass}>
                    {t("common.divisionLabel")}
                    <select
                      className={fieldClass}
                      value={departmentForm.divisionId}
                      onChange={(event) => {
                        setDepartmentForm((current) => ({
                          ...current,
                          divisionId: event.target.value,
                        }));
                        setDialogError("");
                      }}
                      disabled={savingDepartment}
                      required
                    >
                      <option value="">{t("create.selectDivision")}</option>
                      {activeDivisions.map((division) => (
                        <option key={division.id} value={division.id}>
                          {division.name} ({division.code})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={labelClass}>
                    {t("create.departmentCode")}
                    <input
                      className={fieldClass}
                      type="text"
                      value={departmentForm.code}
                      onChange={(event) => {
                        setDepartmentForm((current) => ({
                          ...current,
                          code: event.target.value.toUpperCase(),
                        }));
                        setDialogError("");
                      }}
                      placeholder={t("create.departmentCodePlaceholder")}
                      maxLength={50}
                      disabled={savingDepartment}
                      required
                    />
                  </label>

                  <label className={labelClass}>
                    {t("create.departmentName")}
                    <input
                      className={fieldClass}
                      type="text"
                      value={departmentForm.name}
                      onChange={(event) => {
                        setDepartmentForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }));
                        setDialogError("");
                      }}
                      placeholder={t("create.departmentNamePlaceholder")}
                      maxLength={120}
                      disabled={savingDepartment}
                      required
                    />
                  </label>

                  <label className={labelClass}>
                    {t("workFunction.label")}
                    <select
                      className={fieldClass}
                      value={departmentForm.workFunction}
                      onChange={(event) => {
                        setDepartmentForm((current) => ({
                          ...current,
                          workFunction: event.target.value as DepartmentWorkFunction,
                        }));
                        setDialogError("");
                      }}
                      disabled={savingDepartment}
                    >
                      {DEPARTMENT_WORK_FUNCTIONS.map((value) => (
                        <option key={value} value={value}>
                          {t(`workFunction.${value}.label`)} — {t(`workFunction.${value}.description`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <footer>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={closeCreateDialog}
                    disabled={savingDepartment}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    className={primaryButtonClass}
                    disabled={savingDepartment}
                  >
                    {savingDepartment ? t("create.creating") : t("create.createDepartment")}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}

      {detailTarget && (
        <div className="organization-drawer-backdrop" role="presentation">
          <aside
            className="organization-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("detail.aria", { kind: t(`common.${detailTarget.kind}`) })}
          >
            <header>
              <div>
                <span>{t(`common.${detailTarget.kind}`)}</span>
                <h3>{detailTarget.item.name}</h3>
                <p>{detailTarget.item.code}</p>
              </div>
              <button type="button" onClick={() => setDetailTarget(null)} aria-label={t("detail.close")}>
                ×
              </button>
            </header>

            <div className="organization-drawer__body">
              <div className="organization-drawer__status-row">
                <span
                  className={
                    detailTarget.item.isActive
                      ? "organization-status organization-status--active"
                      : "organization-status"
                  }
                >
                  {detailTarget.item.isActive ? t("common.active") : t("common.inactive")}
                </span>
                <span className={detailBlockers.length > 0 ? "organization-protection-badge" : ""}>
                  {detailBlockers.length > 0
                    ? t("detail.deletionProtected")
                    : t("hierarchy.eligible")}
                </span>
              </div>

              {detailTarget.kind === "department" && (
                <section className="organization-drawer__section">
                  <span>{t("detail.parentDivision")}</span>
                  <strong>{detailTarget.item.division.name}</strong>
                  <small>{detailTarget.item.division.code}</small>
                </section>
              )}

              <section className="organization-drawer__metrics">
                {detailTarget.kind === "division" && (
                  <article>
                    <span>{t("summary.departments")}</span>
                    <strong>{detailTarget.item._count.departments}</strong>
                  </article>
                )}
                <article>
                  <span>{t("common.employees")}</span>
                  <strong>{detailTarget.item._count.employees}</strong>
                </article>
                <article>
                  <span>{t("common.requests")}</span>
                  <strong>{detailTarget.item._count.accountRequests}</strong>
                </article>
                <article>
                  <span>{t("common.positions")}</span>
                  <strong>{detailTarget.item._count.managementPositions}</strong>
                </article>
              </section>

              <section className="organization-drawer__section">
                <span>{t("detail.dependencyProtection")}</span>
                {detailBlockers.length > 0 ? (
                  <ul>
                    {detailBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{t("detail.noLinkedRecords")}</p>
                )}
              </section>

              {detailTarget.kind === "department" && (
                <section className="organization-drawer__section">
                  <span>{t("workFunction.label")}</span>
                  <p>{formatDepartmentWorkFunction(detailTarget.item.workFunction, t)}</p>
                </section>
              )}

              <section className="organization-drawer__dates">
                <div>
                  <span>{t("detail.created")}</span>
                  <strong>{formatOrganizationDate(detailTarget.item.createdAt, locale, t("common.notAvailable"))}</strong>
                </div>
                <div>
                  <span>{t("detail.updated")}</span>
                  <strong>{formatOrganizationDate(detailTarget.item.updatedAt, locale, t("common.notAvailable"))}</strong>
                </div>
              </section>

              <div className="organization-drawer__notice">{t("detail.notice")}</div>
            </div>

            <footer>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() =>
                  detailTarget.kind === "division"
                    ? openDivisionEdit(detailTarget.item)
                    : openDepartmentEdit(detailTarget.item)
                }
              >
                {t("detail.editUnit")}
              </button>

              <button
                type="button"
                className="organization-danger-button"
                onClick={() =>
                  detailTarget.kind === "division"
                    ? requestDivisionDelete(detailTarget.item)
                    : requestDepartmentDelete(detailTarget.item)
                }
                disabled={detailBlockers.length > 0}
                title={
                  detailBlockers.length > 0
                    ? t("detail.deleteBlocked", { blockers: detailBlockers.join(", ") })
                    : t("detail.deleteUnused")
                }
              >
                {detailBlockers.length > 0
                  ? t("detail.deleteUnavailable")
                  : t("detail.deletePermanently")}
              </button>
            </footer>
          </aside>
        </div>
      )}

      {editTarget && (
        <div className="organization-dialog-backdrop" role="presentation">
          <form
            className="organization-dialog"
            onSubmit={submitEdit}
            role="dialog"
            aria-modal="true"
            aria-label={t("edit.aria", { kind: t(`common.${editTarget.kind}`) })}
          >
            <header>
              <div>
                <span>{t("edit.eyebrow")}</span>
                <h3>{t("edit.title", { kind: t(`common.${editTarget.kind}`) })}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditTarget(null);
                  setDialogError("");
                }}
                aria-label={t("edit.close")}
              >
                ×
              </button>
            </header>

            <div className="organization-dialog__body">
              {dialogError && (
                <div className="organization-dialog__error" role="alert">
                  {dialogError}
                </div>
              )}

              {editTarget.kind === "department" && (
                <label className={labelClass}>
                  {t("common.divisionLabel")}
                  <select
                    className={fieldClass}
                    value={editTarget.divisionId}
                    onChange={(event) =>
                      setEditTarget((current) =>
                        current && current.kind === "department"
                          ? {
                              ...current,
                              divisionId: event.target.value,
                            }
                          : current,
                      )
                    }
                    disabled={savingAction}
                    required
                  >
                    {activeDivisions.map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.name} ({division.code})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className={labelClass}>
                {t("common.code")}
                <input
                  className={fieldClass}
                  type="text"
                  value={editTarget.code}
                  onChange={(event) =>
                    setEditTarget((current) =>
                      current
                        ? {
                            ...current,
                            code: event.target.value.toUpperCase(),
                          }
                        : current,
                    )
                  }
                  maxLength={50}
                  disabled={savingAction}
                  required
                />
              </label>

              <label className={labelClass}>
                {t("common.name")}
                <input
                  className={fieldClass}
                  type="text"
                  value={editTarget.name}
                  onChange={(event) =>
                    setEditTarget((current) =>
                      current
                        ? {
                            ...current,
                            name: event.target.value,
                          }
                        : current,
                    )
                  }
                  maxLength={120}
                  disabled={savingAction}
                  required
                />
              </label>

              {editTarget.kind === "department" && (
                <label className={labelClass}>
                  {t("workFunction.label")}
                  <select
                    className={fieldClass}
                    value={editTarget.workFunction}
                    onChange={(event) =>
                      setEditTarget((current) =>
                        current && current.kind === "department"
                          ? {
                              ...current,
                              workFunction: event.target.value as DepartmentWorkFunction,
                            }
                          : current,
                      )
                    }
                    disabled={savingAction}
                  >
                    {DEPARTMENT_WORK_FUNCTIONS.map((value) => (
                      <option key={value} value={value}>
                        {t(`workFunction.${value}.label`)} — {t(`workFunction.${value}.description`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className={labelClass}>
                {t("common.status")}
                <select
                  className={fieldClass}
                  value={editTarget.isActive ? "ACTIVE" : "INACTIVE"}
                  onChange={(event) =>
                    setEditTarget((current) =>
                      current
                        ? {
                            ...current,
                            isActive: event.target.value === "ACTIVE",
                          }
                        : current,
                    )
                  }
                  disabled={savingAction}
                >
                  <option value="ACTIVE">{t("filters.active")}</option>
                  <option value="INACTIVE">{t("filters.inactive")}</option>
                </select>
              </label>

              <div className="organization-dialog__notice">{t("edit.notice")}</div>
            </div>

            <footer>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setEditTarget(null);
                  setDialogError("");
                }}
                disabled={savingAction}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={savingAction}
              >
                {savingAction ? t("edit.saving") : t("edit.save")}
              </button>
            </footer>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="organization-dialog-backdrop" role="presentation">
          <section
            className="organization-dialog organization-dialog--danger"
            role="dialog"
            aria-modal="true"
            aria-label={t("delete.aria", { kind: t(`common.${deleteTarget.kind}`) })}
          >
            <header>
              <div>
                <span>{t("delete.eyebrow")}</span>
                <h3>{t("delete.title", { kind: t(`common.${deleteTarget.kind}`) })}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmation("");
                  setDialogError("");
                }}
                aria-label={t("delete.close")}
              >
                ×
              </button>
            </header>

            <div className="organization-dialog__body">
              {dialogError && (
                <div className="organization-dialog__error" role="alert">
                  {dialogError}
                </div>
              )}

              <p className="organization-dialog__copy">{t("delete.description", { name: deleteTarget.name })}</p>

              <div className="organization-dialog__notice">{t("delete.serverProtection")}</div>

              <label className={labelClass}>
                {t("delete.confirmLabel")}
                <input
                  className={fieldClass}
                  type="text"
                  value={deleteConfirmation}
                  onChange={(event) => {
                    setDeleteConfirmation(event.target.value);
                    setDialogError("");
                  }}
                  placeholder="DELETE"
                  autoComplete="off"
                  disabled={savingAction}
                />
              </label>
            </div>

            <footer>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmation("");
                  setDialogError("");
                }}
                disabled={savingAction}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="organization-danger-button"
                onClick={confirmDelete}
                disabled={savingAction || deleteConfirmation !== "DELETE"}
              >
                {savingAction ? t("delete.deleting") : t("delete.delete")}
              </button>
            </footer>
          </section>
        </div>
      )}

      {showCreateAccount && (
        <AdminAccountForm
          accessToken={accessToken}
          onClose={() => setShowCreateAccount(false)}
          onCreated={() => {
            setShowCreateAccount(false);
            refreshOrganization();
          }}
        />
      )}
    </section>
  );
}
