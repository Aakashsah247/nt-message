import {
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import { AdminAccountForm } from "./AdminAccountForm";

import {
  createAdminDepartment,
  createAdminDivision,
  getAdminDepartments,
  getAdminDivisions,
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

const emptyDivision: DivisionForm = {
  code: "",
  name: "",
};

const emptyDepartment: DepartmentForm = {
  divisionId: "",
  code: "",
  name: "",
};

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "The organization operation could not be completed.";
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
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const [
    showCreateAccount,
    setShowCreateAccount,
  ] = useState(false);

  // Loads the latest organization structure from the backend.
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
        (
          requestError:
            unknown,
        ) => {
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

  function updateDivision(
    field: keyof DivisionForm,
    value: string,
  ): void {
    setDivisionForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );

    setError("");
    setSuccess("");
  }

  function updateDepartment(
    field:
      keyof DepartmentForm,
    value: string,
  ): void {
    setDepartmentForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );

    setError("");
    setSuccess("");
  }

  async function submitDivision(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const code =
      divisionForm.code
        .trim()
        .toUpperCase();

    const name =
      divisionForm.name
        .trim()
        .replace(
          /\s+/g,
          " ",
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
    setError("");
    setSuccess("");

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
      requestError:
        unknown
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
      departmentForm.code
        .trim()
        .toUpperCase();

    const name =
      departmentForm.name
        .trim()
        .replace(
          /\s+/g,
          " ",
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
    setError("");
    setSuccess("");

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
      requestError:
        unknown
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

  return (
    <section className="org-panel">
      <header className="org-head">
        <div>
          <span>
            Organization control
          </span>

          <h2>
            Organization Management
          </h2>

          <p>
            Create and review Nepal Telecom divisions and departments.
          </p>
        </div>

        <button
          type="button"
          className="org-create"
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
          className="org-refresh"
          onClick={
            refreshOrganization
          }
          disabled={loading}
        >
          {loading
            ? "Refreshing..."
            : "Refresh"}
        </button>
      </header>

      {success && (
        <div
          className="org-ok"
          role="status"
        >
          {success}
        </div>
      )}

      {error && (
        <div
          className="org-err"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="org-grid">
        <article className="org-card">
          <header>
            <span>
              Division
            </span>

            <h3>
              Create Division
            </h3>
          </header>

          <form
            className="org-form"
            onSubmit={
              submitDivision
            }
          >
            <label>
              <span>
                Division code
              </span>

              <input
                type="text"
                value={
                  divisionForm.code
                }
                onChange={(
                  event,
                ) =>
                  updateDivision(
                    "code",
                    event.target.value
                      .toUpperCase(),
                  )
                }
                placeholder="Example: TECH"
                maxLength={50}
                disabled={
                  savingDivision
                }
                required
              />
            </label>

            <label>
              <span>
                Division name
              </span>

              <input
                type="text"
                value={
                  divisionForm.name
                }
                onChange={(
                  event,
                ) =>
                  updateDivision(
                    "name",
                    event.target.value,
                  )
                }
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
              className="org-save"
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

        <article className="org-card">
          <header>
            <span>
              Department
            </span>

            <h3>
              Create Department
            </h3>
          </header>

          <form
            className="org-form"
            onSubmit={
              submitDepartment
            }
          >
            <label>
              <span>
                Division
              </span>

              <select
                value={
                  departmentForm.divisionId
                }
                onChange={(
                  event,
                ) =>
                  updateDepartment(
                    "divisionId",
                    event.target.value,
                  )
                }
                disabled={
                  savingDepartment
                }
                required
              >
                <option value="">
                  Select division
                </option>

                {divisions
                  .filter(
                    (division) =>
                      division.isActive,
                  )
                  .map(
                    (
                      division,
                    ) => (
                      <option
                        key={
                          division.id
                        }
                        value={
                          division.id
                        }
                      >
                        {
                          division.name
                        } (
                        {
                          division.code
                        })
                      </option>
                    ),
                  )}
              </select>
            </label>

            <label>
              <span>
                Department code
              </span>

              <input
                type="text"
                value={
                  departmentForm.code
                }
                onChange={(
                  event,
                ) =>
                  updateDepartment(
                    "code",
                    event.target.value
                      .toUpperCase(),
                  )
                }
                placeholder="Example: NETWORK"
                maxLength={50}
                disabled={
                  savingDepartment
                }
                required
              />
            </label>

            <label>
              <span>
                Department name
              </span>

              <input
                type="text"
                value={
                  departmentForm.name
                }
                onChange={(
                  event,
                ) =>
                  updateDepartment(
                    "name",
                    event.target.value,
                  )
                }
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
              className="org-save"
              disabled={
                savingDepartment ||
                divisions.length ===
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

      <div className="org-lists">
        <article className="org-list">
          <header>
            <div>
              <span>
                Divisions
              </span>

              <h3>
                Division List
              </h3>
            </div>

            <strong>
              {divisions.length}
            </strong>
          </header>

          {loading &&
          divisions.length === 0 ? (
            <div className="org-empty">
              Loading divisions...
            </div>
          ) : divisions.length === 0 ? (
            <div className="org-empty">
              No divisions created.
            </div>
          ) : (
            <div className="org-items">
              {divisions.map(
                (
                  division,
                ) => (
                  <div
                    key={
                      division.id
                    }
                    className="org-item"
                  >
                    <div>
                      <strong>
                        {
                          division.name
                        }
                      </strong>

                      <span>
                        {
                          division.code
                        }
                      </span>
                    </div>

                    <small
                      className={
                        division.isActive
                          ? "active"
                          : ""
                      }
                    >
                      {division.isActive
                        ? "Active"
                        : "Inactive"}
                    </small>
                  </div>
                ),
              )}
            </div>
          )}
        </article>

        <article className="org-list">
          <header>
            <div>
              <span>
                Departments
              </span>

              <h3>
                Department List
              </h3>
            </div>

            <strong>
              {departments.length}
            </strong>
          </header>

          {loading &&
          departments.length ===
            0 ? (
            <div className="org-empty">
              Loading departments...
            </div>
          ) : departments.length ===
            0 ? (
            <div className="org-empty">
              No departments created.
            </div>
          ) : (
            <div className="org-items">
              {departments.map(
                (
                  department,
                ) => (
                  <div
                    key={
                      department.id
                    }
                    className="org-item"
                  >
                    <div>
                      <strong>
                        {
                          department.name
                        }
                      </strong>

                      <span>
                        {
                          department.code
                        }
                        {" · "}
                        {
                          department.division
                            .name
                        }
                      </span>
                    </div>

                    <small
                      className={
                        department.isActive
                          ? "active"
                          : ""
                      }
                    >
                      {department.isActive
                        ? "Active"
                        : "Inactive"}
                    </small>
                  </div>
                ),
              )}
            </div>
          )}
        </article>
      </div>
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