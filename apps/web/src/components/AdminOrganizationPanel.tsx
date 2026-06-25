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

function getDivisionBlockers(
  division: AdminDivision,
): string[] {
  const blockers: string[] = [];

  if (
    division._count.departments > 0
  ) {
    blockers.push(
      `${division._count.departments} department(s)`,
    );
  }

  if (
    division._count.employees > 0
  ) {
    blockers.push(
      `${division._count.employees} employee(s)`,
    );
  }

  if (
    division._count.accountRequests > 0
  ) {
    blockers.push(
      `${division._count.accountRequests} account request(s)`,
    );
  }

  if (
    division._count.managementPositions > 0
  ) {
    blockers.push(
      `${division._count.managementPositions} management position(s)`,
    );
  }

  return blockers;
}

function getDepartmentBlockers(
  department: AdminDepartment,
): string[] {
  const blockers: string[] = [];

  if (
    department._count.employees > 0
  ) {
    blockers.push(
      `${department._count.employees} employee(s)`,
    );
  }

  if (
    department._count.accountRequests > 0
  ) {
    blockers.push(
      `${department._count.accountRequests} account request(s)`,
    );
  }

  if (
    department._count.managementPositions > 0
  ) {
    blockers.push(
      `${department._count.managementPositions} management position(s)`,
    );
  }

  return blockers;
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
  ] = useState<DivisionForm>(
    emptyDivision,
  );

  const [
    departmentForm,
    setDepartmentForm,
  ] = useState<DepartmentForm>(
    emptyDepartment,
  );

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
    showCreateAccount,
    setShowCreateAccount,
  ] = useState(false);

  const activeDivisions =
    useMemo(
      () =>
        divisions.filter(
          (division) =>
            division.isActive,
        ),
      [divisions],
    );

  // Loads the latest organization structure.
  useEffect(() => {
    let active = true;

    Promise.all([
      getAdminDivisions(
        accessToken,
      ),

      getAdminDepartments(
        accessToken,
      ),
    ])
      .then(
        ([
          divisionResponse,
          departmentResponse,
        ]) => {
          if (!active) {
            return;
          }

          setDivisions(
            divisionResponse.data,
          );

          setDepartments(
            departmentResponse.data,
          );

          setError("");
        },
      )
      .catch(
        (requestError: unknown) => {
          if (!active) {
            return;
          }

          setError(
            getErrorMessage(
              requestError,
            ),
          );
        },
      )
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    refreshKey,
  ]);

  function refreshOrganization():
    void {
    setLoading(true);
    setError("");

    setRefreshKey(
      (current) =>
        current + 1,
    );
  }

  function clearMessages(): void {
    setError("");
    setSuccess("");
    setDialogError("");
  }

  async function submitDivision(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const code =
      normalizeCode(
        divisionForm.code,
      );

    const name =
      normalizeName(
        divisionForm.name,
      );

    if (
      code.length < 2 ||
      name.length < 2
    ) {
      setError(
        "Enter a valid division code and name.",
      );

      return;
    }

    setSavingDivision(true);
    clearMessages();

    try {
      const response =
        await createAdminDivision(
          accessToken,
          {
            code,
            name,
          },
        );

      setSuccess(
        response.message,
      );

      setDivisionForm(
        emptyDivision,
      );

      refreshOrganization();
    } catch (
      requestError: unknown
    ) {
      setError(
        getErrorMessage(
          requestError,
        ),
      );
    } finally {
      setSavingDivision(false);
    }
  }

  async function submitDepartment(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const code =
      normalizeCode(
        departmentForm.code,
      );

    const name =
      normalizeName(
        departmentForm.name,
      );

    if (
      !departmentForm.divisionId
    ) {
      setError(
        "Select a division.",
      );

      return;
    }

    if (
      code.length < 2 ||
      name.length < 2
    ) {
      setError(
        "Enter a valid department code and name.",
      );

      return;
    }

    setSavingDepartment(true);
    clearMessages();

    try {
      const response =
        await createAdminDepartment(
          accessToken,
          {
            divisionId:
              departmentForm.divisionId,

            code,
            name,
          },
        );

      setSuccess(
        response.message,
      );

      setDepartmentForm(
        emptyDepartment,
      );

      refreshOrganization();
    } catch (
      requestError: unknown
    ) {
      setError(
        getErrorMessage(
          requestError,
        ),
      );
    } finally {
      setSavingDepartment(false);
    }
  }

  function openDivisionEdit(
    division: AdminDivision,
  ): void {
    clearMessages();

    setEditTarget({
      kind: "division",
      id: division.id,
      code: division.code,
      name: division.name,
      isActive:
        division.isActive,
    });
  }

  function openDepartmentEdit(
    department: AdminDepartment,
  ): void {
    clearMessages();

    setEditTarget({
      kind: "department",
      id: department.id,
      divisionId:
        department.division.id,
      code: department.code,
      name: department.name,
      isActive:
        department.isActive,
    });
  }

  async function submitEdit(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!editTarget) {
      return;
    }

    const code =
      normalizeCode(
        editTarget.code,
      );

    const name =
      normalizeName(
        editTarget.name,
      );

    if (
      code.length < 2 ||
      name.length < 2
    ) {
      setDialogError(
        "Enter a valid code and name.",
      );

      return;
    }

    setSavingAction(true);
    setDialogError("");
    setError("");
    setSuccess("");

    try {
      if (
        editTarget.kind ===
        "division"
      ) {
        const response =
          await updateAdminDivision(
            accessToken,
            editTarget.id,
            {
              code,
              name,

              isActive:
                editTarget.isActive,
            },
          );

        setSuccess(
          response.message,
        );
      } else {
        if (
          !editTarget.divisionId
        ) {
          setDialogError(
            "Select a division.",
          );

          return;
        }

        const response =
          await updateAdminDepartment(
            accessToken,
            editTarget.id,
            {
              divisionId:
                editTarget.divisionId,

              code,
              name,

              isActive:
                editTarget.isActive,
            },
          );

        setSuccess(
          response.message,
        );
      }

      // Existing IDs keep linked records stable.
      setEditTarget(null);

      refreshOrganization();
    } catch (
      requestError: unknown
    ) {
      setDialogError(
        getErrorMessage(
          requestError,
        ),
      );
    } finally {
      setSavingAction(false);
    }
  }

  function requestDivisionDelete(
    division: AdminDivision,
  ): void {
    const blockers =
      getDivisionBlockers(
        division,
      );

    if (blockers.length > 0) {
      setError(
        `Cannot delete ${division.name}. It has ${blockers.join(", ")}. Edit or deactivate it instead.`,
      );

      return;
    }

    clearMessages();

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
    const blockers =
      getDepartmentBlockers(
        department,
      );

    if (blockers.length > 0) {
      setError(
        `Cannot delete ${department.name}. It has ${blockers.join(", ")}. Edit or deactivate it instead.`,
      );

      return;
    }

    clearMessages();

    setDeleteConfirmation("");

    setDeleteTarget({
      kind: "department",
      id: department.id,
      name: department.name,
    });
  }

  async function confirmDelete():
    Promise<void> {
    if (!deleteTarget) {
      return;
    }

    if (
      deleteConfirmation !==
      "DELETE"
    ) {
      setDialogError(
        "Type DELETE exactly to confirm permanent deletion.",
      );

      return;
    }

    setSavingAction(true);
    setDialogError("");
    setError("");
    setSuccess("");

    try {
      // The backend remains the final authority for safe deletion.
      const response =
        deleteTarget.kind ===
        "division"
          ? await deleteAdminDivision(
              accessToken,
              deleteTarget.id,
            )
          : await deleteAdminDepartment(
              accessToken,
              deleteTarget.id,
            );

      setSuccess(
        response.message,
      );

      setDeleteTarget(null);
      setDeleteConfirmation("");

      refreshOrganization();
    } catch (
      requestError: unknown
    ) {
      setDialogError(
        getErrorMessage(
          requestError,
        ),
      );
    } finally {
      setSavingAction(false);
    }
  }

  return (
    <section className="grid gap-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="text-[11px] font-black uppercase tracking-[0.1em] text-blue-700">
            Organization control
          </span>

          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
            Organization Management
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Create, edit, deactivate and safely delete Nepal Telecom divisions and departments.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() =>
              setShowCreateAccount(
                true,
              )
            }
          >
            Create account
          </button>

          <button
            type="button"
            className={secondaryButtonClass}
            onClick={
              refreshOrganization
            }
            disabled={loading}
          >
            {loading
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </div>
      </header>

      {success && (
        <div
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
          role="status"
        >
          {success}
        </div>
      )}

      {error && (
        <div
          className="flex items-start justify-between gap-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
          role="alert"
        >
          <span>
            {error}
          </span>

          <button
            type="button"
            className="shrink-0 text-xs font-black underline"
            onClick={() =>
              setError("")
            }
          >
            Close
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg shadow-blue-950/5">
          <header className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">
              Division
            </span>

            <h3 className="mt-1 text-xl font-black text-slate-900">
              Create Division
            </h3>
          </header>

          <form
            className="grid gap-4 p-5"
            onSubmit={
              submitDivision
            }
          >
            <label className={labelClass}>
              Division code

              <input
                className={fieldClass}
                type="text"
                value={
                  divisionForm.code
                }
                onChange={(
                  event,
                ) => {
                  setDivisionForm(
                    (current) => ({
                      ...current,

                      code:
                        event.target.value
                          .toUpperCase(),
                    }),
                  );

                  clearMessages();
                }}
                placeholder="Example: TECH"
                maxLength={50}
                disabled={
                  savingDivision
                }
                required
              />
            </label>

            <label className={labelClass}>
              Division name

              <input
                className={fieldClass}
                type="text"
                value={
                  divisionForm.name
                }
                onChange={(
                  event,
                ) => {
                  setDivisionForm(
                    (current) => ({
                      ...current,

                      name:
                        event.target.value,
                    }),
                  );

                  clearMessages();
                }}
                placeholder="Technical Division"
                maxLength={120}
                disabled={
                  savingDivision
                }
                required
              />
            </label>

            <button
              type="submit"
              className={primaryButtonClass}
              disabled={
                savingDivision
              }
            >
              {savingDivision
                ? "Creating..."
                : "Create division"}
            </button>
          </form>
        </article>

        <article className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg shadow-blue-950/5">
          <header className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">
              Department
            </span>

            <h3 className="mt-1 text-xl font-black text-slate-900">
              Create Department
            </h3>
          </header>

          <form
            className="grid gap-4 p-5"
            onSubmit={
              submitDepartment
            }
          >
            <label className={labelClass}>
              Division

              <select
                className={fieldClass}
                value={
                  departmentForm.divisionId
                }
                onChange={(
                  event,
                ) => {
                  setDepartmentForm(
                    (current) => ({
                      ...current,

                      divisionId:
                        event.target.value,
                    }),
                  );

                  clearMessages();
                }}
                disabled={
                  savingDepartment
                }
                required
              >
                <option value="">
                  Select division
                </option>

                {activeDivisions.map(
                  (division) => (
                    <option
                      key={
                        division.id
                      }
                      value={
                        division.id
                      }
                    >
                      {division.name} ({division.code})
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className={labelClass}>
              Department code

              <input
                className={fieldClass}
                type="text"
                value={
                  departmentForm.code
                }
                onChange={(
                  event,
                ) => {
                  setDepartmentForm(
                    (current) => ({
                      ...current,

                      code:
                        event.target.value
                          .toUpperCase(),
                    }),
                  );

                  clearMessages();
                }}
                placeholder="Example: NETWORK"
                maxLength={50}
                disabled={
                  savingDepartment
                }
                required
              />
            </label>

            <label className={labelClass}>
              Department name

              <input
                className={fieldClass}
                type="text"
                value={
                  departmentForm.name
                }
                onChange={(
                  event,
                ) => {
                  setDepartmentForm(
                    (current) => ({
                      ...current,

                      name:
                        event.target.value,
                    }),
                  );

                  clearMessages();
                }}
                placeholder="Network Department"
                maxLength={120}
                disabled={
                  savingDepartment
                }
                required
              />
            </label>

            <button
              type="submit"
              className={primaryButtonClass}
              disabled={
                savingDepartment ||
                activeDivisions.length ===
                  0
              }
            >
              {savingDepartment
                ? "Creating..."
                : "Create department"}
            </button>
          </form>
        </article>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg shadow-blue-950/5">
          <header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                Divisions
              </span>

              <h3 className="mt-1 text-xl font-black text-slate-900">
                Division List
              </h3>
            </div>

            <strong className="grid h-11 min-w-11 place-items-center rounded-xl bg-blue-700 px-3 text-white">
              {divisions.length}
            </strong>
          </header>

          {loading &&
          divisions.length === 0 ? (
            <div className="grid min-h-40 place-items-center text-sm text-slate-500">
              Loading divisions...
            </div>
          ) : divisions.length ===
            0 ? (
            <div className="grid min-h-40 place-items-center text-sm text-slate-500">
              No divisions created.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {divisions.map(
                (division) => {
                  const blockers =
                    getDivisionBlockers(
                      division,
                    );

                  const deleteAllowed =
                    blockers.length === 0;

                  return (
                    <div
                      key={
                        division.id
                      }
                      className="grid gap-4 p-4 transition hover:bg-blue-50/60"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <strong className="block truncate text-sm font-black text-slate-900">
                            {division.name}
                          </strong>

                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            {division.code}
                          </span>
                        </div>

                        <span
                          className={
                            division.isActive
                              ? "rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700"
                              : "rounded-full bg-slate-200 px-3 py-1 text-[10px] font-black uppercase text-slate-600"
                          }
                        >
                          {division.isActive
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                        <span className="rounded-lg bg-slate-100 px-2 py-2 text-center font-bold text-slate-600">
                          {division._count.departments} departments
                        </span>

                        <span className="rounded-lg bg-slate-100 px-2 py-2 text-center font-bold text-slate-600">
                          {division._count.employees} employees
                        </span>

                        <span className="rounded-lg bg-slate-100 px-2 py-2 text-center font-bold text-slate-600">
                          {division._count.accountRequests} requests
                        </span>

                        <span className="rounded-lg bg-slate-100 px-2 py-2 text-center font-bold text-slate-600">
                          {division._count.managementPositions} positions
                        </span>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          className="min-h-9 flex-1 rounded-lg border border-blue-300 bg-blue-50 px-3 text-xs font-black text-blue-700 transition hover:bg-blue-100"
                          onClick={() =>
                            openDivisionEdit(
                              division,
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="min-h-9 flex-1 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          onClick={() =>
                            requestDivisionDelete(
                              division,
                            )
                          }
                          disabled={
                            !deleteAllowed
                          }
                          title={
                            deleteAllowed
                              ? "Delete this unused division"
                              : `Cannot delete: ${blockers.join(", ")}`
                          }
                        >
                          {deleteAllowed
                            ? "Delete"
                            : "Delete unavailable"}
                        </button>
                      </div>

                      {!deleteAllowed && (
                        <p className="m-0 text-[10px] leading-4 text-amber-700">
                          Delete blocked: {blockers.join(", ")}. Use Edit to deactivate this division.
                        </p>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </article>

        <article className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-lg shadow-blue-950/5">
          <header className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                Departments
              </span>

              <h3 className="mt-1 text-xl font-black text-slate-900">
                Department List
              </h3>
            </div>

            <strong className="grid h-11 min-w-11 place-items-center rounded-xl bg-blue-700 px-3 text-white">
              {departments.length}
            </strong>
          </header>

          {loading &&
          departments.length ===
            0 ? (
            <div className="grid min-h-40 place-items-center text-sm text-slate-500">
              Loading departments...
            </div>
          ) : departments.length ===
            0 ? (
            <div className="grid min-h-40 place-items-center text-sm text-slate-500">
              No departments created.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {departments.map(
                (department) => {
                  const blockers =
                    getDepartmentBlockers(
                      department,
                    );

                  const deleteAllowed =
                    blockers.length === 0;

                  return (
                    <div
                      key={
                        department.id
                      }
                      className="grid gap-4 p-4 transition hover:bg-blue-50/60"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <strong className="block truncate text-sm font-black text-slate-900">
                            {department.name}
                          </strong>

                          <span className="mt-1 block text-xs font-bold text-slate-500">
                            {department.code} · {department.division.name}
                          </span>
                        </div>

                        <span
                          className={
                            department.isActive
                              ? "rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700"
                              : "rounded-full bg-slate-200 px-3 py-1 text-[10px] font-black uppercase text-slate-600"
                          }
                        >
                          {department.isActive
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <span className="rounded-lg bg-slate-100 px-2 py-2 text-center font-bold text-slate-600">
                          {department._count.employees} employees
                        </span>

                        <span className="rounded-lg bg-slate-100 px-2 py-2 text-center font-bold text-slate-600">
                          {department._count.accountRequests} requests
                        </span>

                        <span className="rounded-lg bg-slate-100 px-2 py-2 text-center font-bold text-slate-600">
                          {department._count.managementPositions} positions
                        </span>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          className="min-h-9 flex-1 rounded-lg border border-blue-300 bg-blue-50 px-3 text-xs font-black text-blue-700 transition hover:bg-blue-100"
                          onClick={() =>
                            openDepartmentEdit(
                              department,
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="min-h-9 flex-1 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          onClick={() =>
                            requestDepartmentDelete(
                              department,
                            )
                          }
                          disabled={
                            !deleteAllowed
                          }
                          title={
                            deleteAllowed
                              ? "Delete this unused department"
                              : `Cannot delete: ${blockers.join(", ")}`
                          }
                        >
                          {deleteAllowed
                            ? "Delete"
                            : "Delete unavailable"}
                        </button>
                      </div>

                      {!deleteAllowed && (
                        <p className="m-0 text-[10px] leading-4 text-amber-700">
                          Delete blocked: {blockers.join(", ")}. Use Edit to deactivate this department.
                        </p>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </article>
      </div>

      {editTarget && (
        <div
          className="fixed inset-0 z-[1100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget &&
              !savingAction
            ) {
              setEditTarget(null);
              setDialogError("");
            }
          }}
        >
          <form
            className="my-8 w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl"
            onSubmit={
              submitEdit
            }
          >
            <header className="flex items-start justify-between gap-4 border-b-[3px] border-red-500 bg-gradient-to-r from-[#042f5d] via-[#073a70] to-[#075ca8] px-6 py-5 text-white">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
                  Organization editor
                </span>

                <h3 className="mt-1 text-xl font-black">
                  Edit {editTarget.kind}
                </h3>
              </div>

              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/30 bg-white/10 text-xl"
                onClick={() => {
                  setEditTarget(null);
                  setDialogError("");
                }}
                disabled={
                  savingAction
                }
                aria-label="Close edit form"
              >
                ×
              </button>
            </header>

            <div className="grid gap-4 p-6">
              {dialogError && (
                <div
                  className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
                  role="alert"
                >
                  {dialogError}
                </div>
              )}

              {editTarget.kind ===
                "department" && (
                <label className={labelClass}>
                  Division

                  <select
                    className={fieldClass}
                    value={
                      editTarget.divisionId
                    }
                    onChange={(
                      event,
                    ) =>
                      setEditTarget(
                        (current) =>
                          current?.kind ===
                          "department"
                            ? {
                                ...current,

                                divisionId:
                                  event.target.value,
                              }
                            : current,
                      )
                    }
                    disabled={
                      savingAction
                    }
                    required
                  >
                    {activeDivisions.map(
                      (division) => (
                        <option
                          key={
                            division.id
                          }
                          value={
                            division.id
                          }
                        >
                          {division.name} ({division.code})
                        </option>
                      ),
                    )}
                  </select>

                  <small className="normal-case tracking-normal text-slate-500">
                    Moving a used department will be blocked by the backend.
                  </small>
                </label>
              )}

              <label className={labelClass}>
                Code

                <input
                  className={fieldClass}
                  type="text"
                  value={
                    editTarget.code
                  }
                  onChange={(
                    event,
                  ) =>
                    setEditTarget(
                      (current) =>
                        current
                          ? {
                              ...current,

                              code:
                                event.target.value
                                  .toUpperCase(),
                            }
                          : current,
                    )
                  }
                  maxLength={50}
                  disabled={
                    savingAction
                  }
                  required
                />
              </label>

              <label className={labelClass}>
                Name

                <input
                  className={fieldClass}
                  type="text"
                  value={
                    editTarget.name
                  }
                  onChange={(
                    event,
                  ) =>
                    setEditTarget(
                      (current) =>
                        current
                          ? {
                              ...current,

                              name:
                                event.target.value,
                            }
                          : current,
                    )
                  }
                  maxLength={120}
                  disabled={
                    savingAction
                  }
                  required
                />
              </label>

              <label className={labelClass}>
                Status

                <select
                  className={fieldClass}
                  value={
                    editTarget.isActive
                      ? "ACTIVE"
                      : "INACTIVE"
                  }
                  onChange={(
                    event,
                  ) =>
                    setEditTarget(
                      (current) =>
                        current
                          ? {
                              ...current,

                              isActive:
                                event.target.value ===
                                "ACTIVE",
                            }
                          : current,
                    )
                  }
                  disabled={
                    savingAction
                  }
                >
                  <option value="ACTIVE">
                    Active
                  </option>

                  <option value="INACTIVE">
                    Inactive
                  </option>
                </select>
              </label>

              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                Deactivation preserves employees, requests, positions and history. Permanent deletion is only for completely unused records.
              </div>
            </div>

            <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setEditTarget(null);
                  setDialogError("");
                }}
                disabled={
                  savingAction
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className={primaryButtonClass}
                disabled={
                  savingAction
                }
              >
                {savingAction
                  ? "Saving..."
                  : "Save changes"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[1100] grid place-items-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm"
          role="presentation"
        >
          <section
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-red-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${deleteTarget.kind}`}
          >
            <header className="border-b-[3px] border-red-600 bg-gradient-to-r from-red-800 to-red-600 px-6 py-5 text-white">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
                Permanent deletion
              </span>

              <h3 className="mt-1 text-xl font-black">
                Delete {deleteTarget.kind}
              </h3>
            </header>

            <div className="grid gap-4 p-6">
              {dialogError && (
                <div
                  className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
                  role="alert"
                >
                  {dialogError}
                </div>
              )}

              <p className="m-0 text-sm leading-6 text-slate-700">
                You are permanently deleting{" "}
                <strong>
                  {deleteTarget.name}
                </strong>
                . This action cannot be undone.
              </p>

              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                The server will reject deletion if another employee, department, request or management position started using this record.
              </div>

              <label className={labelClass}>
                Type DELETE to confirm

                <input
                  className={fieldClass}
                  type="text"
                  value={
                    deleteConfirmation
                  }
                  onChange={(
                    event,
                  ) => {
                    setDeleteConfirmation(
                      event.target.value,
                    );

                    setDialogError("");
                  }}
                  placeholder="DELETE"
                  autoComplete="off"
                  disabled={
                    savingAction
                  }
                />
              </label>
            </div>

            <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmation("");
                  setDialogError("");
                }}
                disabled={
                  savingAction
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="min-h-10 rounded-xl border-0 bg-red-600 px-5 text-xs font-black text-white shadow-lg transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={
                  confirmDelete
                }
                disabled={
                  savingAction ||
                  deleteConfirmation !==
                    "DELETE"
                }
              >
                {savingAction
                  ? "Deleting..."
                  : "Delete permanently"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {showCreateAccount && (
        <AdminAccountForm
          accessToken={
            accessToken
          }
          onClose={() =>
            setShowCreateAccount(
              false,
            )
          }
          onCreated={() => {
            setShowCreateAccount(
              false,
            );

            refreshOrganization();
          }}
        />
      )}
    </section>
  );
}
