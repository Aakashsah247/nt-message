import {
  useEffect,
  useMemo,
  useState,
} from "react";

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
};

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
): string {
  return error instanceof Error
    ? error.message
    : "The organization operation could not be completed.";
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
  value?: string,
): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getDivisionBlockers(
  division: AdminDivision,
): string[] {
  const blockers: string[] = [];

  if (division._count.departments > 0) {
    blockers.push(`${division._count.departments} department(s)`);
  }

  if (division._count.employees > 0) {
    blockers.push(`${division._count.employees} employee(s)`);
  }

  if (division._count.accountRequests > 0) {
    blockers.push(`${division._count.accountRequests} account request(s)`);
  }

  if (division._count.managementPositions > 0) {
    blockers.push(`${division._count.managementPositions} management position(s)`);
  }

  return blockers;
}

function getDepartmentBlockers(
  department: AdminDepartment,
): string[] {
  const blockers: string[] = [];

  if (department._count.employees > 0) {
    blockers.push(`${department._count.employees} employee(s)`);
  }

  if (department._count.accountRequests > 0) {
    blockers.push(`${department._count.accountRequests} account request(s)`);
  }

  if (department._count.managementPositions > 0) {
    blockers.push(`${department._count.managementPositions} management position(s)`);
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
          department.division.code.toLowerCase().includes(normalizedSearch);

        return matchesSearch && matchesStatus(department.isActive);
      }),
    [departments, normalizedSearch, statusFilter],
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
      divisions.filter((division) => getDivisionBlockers(division).length > 0).length +
      departments.filter((department) => getDepartmentBlockers(department).length > 0).length;

    return {
      divisions: divisions.length,
      departments: departments.length,
      activeUnits,
      protectedUnits,
    };
  }, [departments, divisions]);

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

        setError(getErrorMessage(requestError));
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
      setDialogError("Enter a valid division code and name.");
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
      setDialogError(getErrorMessage(requestError));
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
      setDialogError("Select a division.");
      return;
    }

    if (code.length < 2 || name.length < 2) {
      setDialogError("Enter a valid department code and name.");
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
      });

      setSuccess(response.message);
      setDepartmentForm(emptyDepartment);
      closeCreateDialog();
      refreshOrganization();
    } catch (requestError: unknown) {
      setDialogError(getErrorMessage(requestError));
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
      setDialogError("Enter a valid code and name.");
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
          setDialogError("Select a division.");
          return;
        }

        const response = await updateAdminDepartment(
          accessToken,
          editTarget.id,
          {
            divisionId: editTarget.divisionId,
            code,
            name,
            isActive: editTarget.isActive,
          },
        );

        setSuccess(response.message);
      }

      // Updating preserves the database identity and all linked history.
      setEditTarget(null);
      refreshOrganization();
    } catch (requestError: unknown) {
      setDialogError(getErrorMessage(requestError));
    } finally {
      setSavingAction(false);
    }
  }

  function requestDivisionDelete(
    division: AdminDivision,
  ): void {
    const blockers = getDivisionBlockers(division);

    if (blockers.length > 0) {
      setError(
        `Cannot delete ${division.name}. It has ${blockers.join(", ")}. Edit or deactivate it instead.`,
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
    const blockers = getDepartmentBlockers(department);

    if (blockers.length > 0) {
      setError(
        `Cannot delete ${department.name}. It has ${blockers.join(", ")}. Edit or deactivate it instead.`,
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
      setDialogError("Type DELETE exactly to confirm permanent deletion.");
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
      setDialogError(getErrorMessage(requestError));
    } finally {
      setSavingAction(false);
    }
  }

  const detailBlockers = detailTarget
    ? detailTarget.kind === "division"
      ? getDivisionBlockers(detailTarget.item)
      : getDepartmentBlockers(detailTarget.item)
    : [];

  return (
    <section className="organization-workspace">
      <header className="organization-workspace__hero">
        <div>
          <span className="organization-eyebrow">Organization control</span>
          <h2>Organization Management</h2>
          <p>
            Maintain Nepal Telecom divisions and departments with protected,
            dependency-aware administration.
          </p>
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
            Create account
          </button>

          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => {
              clearMessages();
              setCreateTarget("division");
            }}
          >
            Create division
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
            Create department
          </button>

          <button
            type="button"
            className={secondaryButtonClass}
            onClick={refreshOrganization}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
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
          <button type="button" onClick={() => setError("")}>Close</button>
        </div>
      )}

      <section className="organization-summary-grid" aria-label="Organization summary">
        <article className="organization-summary-card organization-summary-card--blue">
          <span>Divisions</span>
          <strong>{organizationSummary.divisions}</strong>
          <small>Top-level organization units</small>
        </article>

        <article className="organization-summary-card organization-summary-card--green">
          <span>Departments</span>
          <strong>{organizationSummary.departments}</strong>
          <small>Operational units across divisions</small>
        </article>

        <article className="organization-summary-card organization-summary-card--gold">
          <span>Active units</span>
          <strong>{organizationSummary.activeUnits}</strong>
          <small>Divisions and departments currently enabled</small>
        </article>

        <article className="organization-summary-card organization-summary-card--red">
          <span>Deletion-protected units</span>
          <strong>{organizationSummary.protectedUnits}</strong>
          <small>Units that contain linked organization records</small>
        </article>
      </section>

      <section className="organization-control-bar" aria-label="Organization filters">
        <label>
          <span>Search organization</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Division, department or code"
          />
        </label>

        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as OrganizationStatusFilter)
            }
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>

        <div className="organization-control-bar__result">
          <strong>{matchingUnitCount}</strong>
          <span>matching units</span>
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
            Clear filters
          </button>
        )}
      </section>

      <section className="organization-hierarchy-panel">
        <header>
          <div>
            <span>Organization hierarchy</span>
            <h3>Division and department structure</h3>
            <p>
              Use the explicit controls to view departments or manage a unit.
              The row itself is not clickable, and destructive actions stay inside the management drawer.
            </p>
          </div>
        </header>

        {loading && divisions.length === 0 ? (
          <div className="organization-empty-state">
            <strong>Loading organization structure</strong>
            <span>Please wait while the latest organization units are loaded.</span>
          </div>
        ) : filteredDivisions.length === 0 ? (
          <div className="organization-empty-state">
            <strong>No matching organization units</strong>
            <span>Change the search or status filter to view divisions and departments.</span>
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
                      <small>
                        {division.code} · {division._count.departments} departments · {division._count.employees} employees
                      </small>
                    </span>

                    <span
                      className={
                        division.isActive
                          ? "organization-status organization-status--active"
                          : "organization-status"
                      }
                    >
                      {division.isActive ? "Active" : "Inactive"}
                    </span>

                    <div className="organization-hierarchy-item__row-actions">
                      <button
                        type="button"
                        className="organization-action organization-action--quiet"
                        onClick={() => setDetailTarget({ kind: "division", item: division })}
                      >
                        Manage unit
                      </button>

                      <button
                        type="button"
                        className="organization-action organization-action--quiet"
                        onClick={() => openDivisionEdit(division)}
                      >
                        Edit
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
                            ? "Hide departments ↑"
                            : `View departments (${childDepartments.length}) ↓`
                          : normalizedSearch || statusFilter !== "ALL"
                            ? "No matching departments"
                            : "No departments"}
                      </button>
                    </div>
                  </div>

                  <div className="organization-hierarchy-item__context">
                    <span>
                      <strong>{division._count.accountRequests}</strong> account requests
                    </span>
                    <span>
                      <strong>{division._count.managementPositions}</strong> management positions
                    </span>
                    <span className={blockerCount > 0 ? "organization-protection-badge" : ""}>
                      {blockerCount > 0
                        ? `Protected by ${blockerCount} linked records`
                        : "Eligible for deletion"}
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
                                <small>
                                  {department.code} · {department._count.employees} employees
                                </small>
                              </div>

                              <span
                                className={
                                  department.isActive
                                    ? "organization-status organization-status--active"
                                    : "organization-status"
                                }
                              >
                                {department.isActive ? "Active" : "Inactive"}
                              </span>

                              <span className="organization-department-card__protection">
                                {departmentDependencies > 0
                                  ? `${departmentDependencies} linked records`
                                  : "No dependencies"}
                              </span>

                              <div className="organization-department-card__actions">
                                <button
                                  type="button"
                                  className="organization-action organization-action--quiet"
                                  onClick={() =>
                                    setDetailTarget({ kind: "department", item: department })
                                  }
                                >
                                  Manage unit
                                </button>

                                <button
                                  type="button"
                                  className="organization-action organization-action--quiet"
                                  onClick={() => openDepartmentEdit(department)}
                                >
                                  Edit
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
            aria-label={`Create ${createTarget}`}
          >
            <header>
              <div>
                <span>Create organization unit</span>
                <h3>
                  {createTarget === "division"
                    ? "Create Division"
                    : "Create Department"}
                </h3>
              </div>
              <button type="button" onClick={closeCreateDialog} aria-label="Close create dialog">
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
                    Division code
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
                      placeholder="Example: TECH"
                      maxLength={50}
                      disabled={savingDivision}
                      required
                    />
                  </label>

                  <label className={labelClass}>
                    Division name
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
                      placeholder="Technical Division"
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
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={primaryButtonClass}
                    disabled={savingDivision}
                  >
                    {savingDivision ? "Creating..." : "Create division"}
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
                    Division
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
                      <option value="">Select division</option>
                      {activeDivisions.map((division) => (
                        <option key={division.id} value={division.id}>
                          {division.name} ({division.code})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={labelClass}>
                    Department code
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
                      placeholder="Example: NETWORK"
                      maxLength={50}
                      disabled={savingDepartment}
                      required
                    />
                  </label>

                  <label className={labelClass}>
                    Department name
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
                      placeholder="Network Department"
                      maxLength={120}
                      disabled={savingDepartment}
                      required
                    />
                  </label>
                </div>

                <footer>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={closeCreateDialog}
                    disabled={savingDepartment}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={primaryButtonClass}
                    disabled={savingDepartment}
                  >
                    {savingDepartment ? "Creating..." : "Create department"}
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
            aria-label={`${detailTarget.kind} details`}
          >
            <header>
              <div>
                <span>{detailTarget.kind}</span>
                <h3>{detailTarget.item.name}</h3>
                <p>{detailTarget.item.code}</p>
              </div>
              <button type="button" onClick={() => setDetailTarget(null)} aria-label="Close details">
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
                  {detailTarget.item.isActive ? "Active" : "Inactive"}
                </span>
                <span className={detailBlockers.length > 0 ? "organization-protection-badge" : ""}>
                  {detailBlockers.length > 0
                    ? "Deletion protected"
                    : "Eligible for deletion"}
                </span>
              </div>

              {detailTarget.kind === "department" && (
                <section className="organization-drawer__section">
                  <span>Parent division</span>
                  <strong>{detailTarget.item.division.name}</strong>
                  <small>{detailTarget.item.division.code}</small>
                </section>
              )}

              <section className="organization-drawer__metrics">
                {detailTarget.kind === "division" && (
                  <article>
                    <span>Departments</span>
                    <strong>{detailTarget.item._count.departments}</strong>
                  </article>
                )}
                <article>
                  <span>Employees</span>
                  <strong>{detailTarget.item._count.employees}</strong>
                </article>
                <article>
                  <span>Requests</span>
                  <strong>{detailTarget.item._count.accountRequests}</strong>
                </article>
                <article>
                  <span>Positions</span>
                  <strong>{detailTarget.item._count.managementPositions}</strong>
                </article>
              </section>

              <section className="organization-drawer__section">
                <span>Dependency protection</span>
                {detailBlockers.length > 0 ? (
                  <ul>
                    {detailBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No linked records currently prevent permanent deletion.</p>
                )}
              </section>

              <section className="organization-drawer__dates">
                <div>
                  <span>Created</span>
                  <strong>{formatOrganizationDate(detailTarget.item.createdAt)}</strong>
                </div>
                <div>
                  <span>Last updated</span>
                  <strong>{formatOrganizationDate(detailTarget.item.updatedAt)}</strong>
                </div>
              </section>

              <div className="organization-drawer__notice">
                Deactivation preserves employees, requests, positions and history.
                Permanent deletion is only available for a completely unused unit.
              </div>
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
                Edit unit
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
                    ? `Cannot delete: ${detailBlockers.join(", ")}`
                    : "Delete this unused organization unit"
                }
              >
                {detailBlockers.length > 0
                  ? "Delete unavailable"
                  : "Delete permanently"}
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
            aria-label={`Edit ${editTarget.kind}`}
          >
            <header>
              <div>
                <span>Organization maintenance</span>
                <h3>Edit {editTarget.kind}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditTarget(null);
                  setDialogError("");
                }}
                aria-label="Close edit dialog"
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
                  Division
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
                Code
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
                Name
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

              <label className={labelClass}>
                Status
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
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>

              <div className="organization-dialog__notice">
                Deactivation is the safe option for a unit that already contains
                employees, account requests, management positions or history.
              </div>
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
                Cancel
              </button>
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={savingAction}
              >
                {savingAction ? "Saving..." : "Save changes"}
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
            aria-label={`Delete ${deleteTarget.kind}`}
          >
            <header>
              <div>
                <span>Permanent deletion</span>
                <h3>Delete {deleteTarget.kind}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmation("");
                  setDialogError("");
                }}
                aria-label="Close delete dialog"
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

              <p className="organization-dialog__copy">
                You are permanently deleting <strong>{deleteTarget.name}</strong>.
                This action cannot be undone.
              </p>

              <div className="organization-dialog__notice">
                The server will reject deletion if another record started using
                this unit after the current organization snapshot was loaded.
              </div>

              <label className={labelClass}>
                Type DELETE to confirm
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
                Cancel
              </button>
              <button
                type="button"
                className="organization-danger-button"
                onClick={confirmDelete}
                disabled={savingAction || deleteConfirmation !== "DELETE"}
              >
                {savingAction ? "Deleting..." : "Delete permanently"}
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
