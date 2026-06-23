import {
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  listDirectoryEmployees,
} from "../services/directory.service";

import type {
  AccountRole,
} from "../types/auth";

import type {
  DirectoryAccountStatus,
  DirectoryActivationStatus,
  DirectoryEmployee,
  DirectoryEmployeeStatus,
  DirectoryListResponse,
} from "../types/directory";

interface EmployeeDirectoryProps {
  accessToken: string;
  reloadKey?: number;
  title?: string;
  description?: string;
  onSelectEmployee?: (
    employeeId: string,
  ) => void;
}

type RoleFilter =
  | AccountRole
  | "";

type EmployeeStatusFilter =
  | DirectoryEmployeeStatus
  | "";

type AccountStatusFilter =
  | DirectoryAccountStatus
  | "";

type ActivationStatusFilter =
  | DirectoryActivationStatus
  | "";

const PAGE_SIZE = 20;

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "The employee directory could not be loaded.";
}

function formatValue(
  value: string,
): string {
  return value
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Never";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function getInitials(
  name: string,
): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part.charAt(0),
    )
    .join("")
    .toUpperCase();
}

function getStatusClass(
  value: string,
): string {
  return value
    .toLowerCase()
    .replaceAll(
      "_",
      "-",
    );
}

export function EmployeeDirectory({
  accessToken,
  reloadKey = 0,
  title = "Employee Directory",
  description =
    "Search authorized Nepal Telecom employees within your permitted organization scope.",
  onSelectEmployee,
}: EmployeeDirectoryProps) {
  const [
    response,
    setResponse,
  ] =
    useState<DirectoryListResponse | null>(
      null,
    );

  const [
    searchInput,
    setSearchInput,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    role,
    setRole,
  ] =
    useState<RoleFilter>("");

  const [
    employeeStatus,
    setEmployeeStatus,
  ] =
    useState<EmployeeStatusFilter>("");

  const [
    accountStatus,
    setAccountStatus,
  ] =
    useState<AccountStatusFilter>("");

  const [
    activationStatus,
    setActivationStatus,
  ] =
    useState<ActivationStatusFilter>("");

  const [page, setPage] =
    useState(1);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    refreshKey,
    setRefreshKey,
  ] =
    useState(0);

  useEffect(() => {
    let active = true;

    // Scope rules are enforced by the backend.
    listDirectoryEmployees(
      accessToken,
      {
        search:
          search || undefined,

        role:
          role || undefined,

        status:
          employeeStatus ||
          undefined,

        accountStatus:
          accountStatus ||
          undefined,

        activationStatus:
          activationStatus ||
          undefined,

        page,
        limit: PAGE_SIZE,
      },
    )
      .then(
        (
          directoryResponse,
        ) => {
          if (!active) {
            return;
          }

          setResponse(
            directoryResponse,
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
    accountStatus,
    activationStatus,
    employeeStatus,
    page,
    refreshKey,
    reloadKey,
    role,
    search,
  ]);

  function submitSearch(
    event:
      FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();

    setPage(1);
    setLoading(true);
    setError("");

    setSearch(
      searchInput.trim(),
    );
  }

  function clearFilters():
    void {
    setSearchInput("");
    setSearch("");
    setRole("");
    setEmployeeStatus("");
    setAccountStatus("");
    setActivationStatus("");
    setPage(1);
    setLoading(true);
    setError("");
  }

  function changeRole(
    value: RoleFilter,
  ): void {
    setRole(value);
    setPage(1);
    setLoading(true);
    setError("");
  }

  function changeEmployeeStatus(
    value:
      EmployeeStatusFilter,
  ): void {
    setEmployeeStatus(value);
    setPage(1);
    setLoading(true);
    setError("");
  }

  function changeAccountStatus(
    value:
      AccountStatusFilter,
  ): void {
    setAccountStatus(value);
    setPage(1);
    setLoading(true);
    setError("");
  }

  function changeActivationStatus(
    value:
      ActivationStatusFilter,
  ): void {
    setActivationStatus(value);
    setPage(1);
    setLoading(true);
    setError("");
  }

  function retryLoading():
    void {
    setLoading(true);
    setError("");

    setRefreshKey(
      (current) =>
        current + 1,
    );
  }

  function changePage(
    nextPage: number,
  ): void {
    const totalPages =
      response?.pagination
        .totalPages ?? 0;

    if (
      nextPage < 1 ||
      (
        totalPages > 0 &&
        nextPage > totalPages
      ) ||
      nextPage === page
    ) {
      return;
    }

    setPage(nextPage);
    setLoading(true);
    setError("");
  }

  function selectEmployee(
    employee:
      DirectoryEmployee,
  ): void {
    onSelectEmployee?.(
      employee.id,
    );
  }

  const scope =
    response?.scope;

  const employees =
    response?.data ?? [];

  const pagination =
    response?.pagination;

  const hasActiveFilters =
    Boolean(
      search ||
      role ||
      employeeStatus ||
      accountStatus ||
      activationStatus,
    );

  return (
    <section
      className="directory-card"
      aria-busy={
        loading
      }
    >
      <header className="directory-header">
        <div>
          <span>
            Organization directory
          </span>

          <h2>{title}</h2>

          <p>
            {description}
          </p>
        </div>

        <div className="directory-total">
          <span>
            Total employees
          </span>

          <strong>
            {pagination?.total ??
              0}
          </strong>
        </div>
      </header>

      {scope && (
        <section className="directory-scope">
          <div>
            <span>
              Directory scope
            </span>

            <strong>
              {formatValue(
                scope.type,
              )}
            </strong>
          </div>

          <div>
            <span>
              Division
            </span>

            <strong>
              {scope.division
                ?.name ??
                "All divisions"}
            </strong>
          </div>

          <div>
            <span>
              Department
            </span>

            <strong>
              {scope.department
                ?.name ??
                "All departments"}
            </strong>
          </div>

          <div>
            <span>
              Contact access
            </span>

            <strong>
              {formatValue(
                scope.contactVisibility,
              )}
            </strong>
          </div>
        </section>
      )}

      <form
        className="directory-search"
        onSubmit={
          submitSearch
        }
      >
        <label>
          <span>
            Search directory
          </span>

          <div>
            <input
              type="search"
              value={
                searchInput
              }
              onChange={(
                event,
              ) =>
                setSearchInput(
                  event.target.value,
                )
              }
              maxLength={100}
              placeholder="Name, employee ID, designation or department"
            />

            <button
              type="submit"
            >
              Search
            </button>
          </div>
        </label>
      </form>

      <section className="directory-filters">
        <label>
          <span>Role</span>

          <select
            value={role}
            onChange={(
              event,
            ) =>
              changeRole(
                event.target
                  .value as
                  RoleFilter,
              )
            }
          >
            <option value="">
              All roles
            </option>

            <option value="SUPER_ADMIN">
              Super Admin
            </option>

            <option value="SENIOR_MANAGEMENT">
              Senior Management
            </option>

            <option value="TEAM_MANAGER">
              Team Manager
            </option>

            <option value="EMPLOYEE">
              Employee
            </option>
          </select>
        </label>

        <label>
          <span>
            Employee status
          </span>

          <select
            value={
              employeeStatus
            }
            onChange={(
              event,
            ) =>
              changeEmployeeStatus(
                event.target
                  .value as
                  EmployeeStatusFilter,
              )
            }
          >
            <option value="">
              All statuses
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="INACTIVE">
              Inactive
            </option>
          </select>
        </label>

        <label>
          <span>
            Account status
          </span>

          <select
            value={
              accountStatus
            }
            onChange={(
              event,
            ) =>
              changeAccountStatus(
                event.target
                  .value as
                  AccountStatusFilter,
              )
            }
          >
            <option value="">
              All accounts
            </option>

            <option value="ENABLED">
              Enabled
            </option>

            <option value="DISABLED">
              Disabled
            </option>

            <option value="NO_ACCOUNT">
              No account
            </option>
          </select>
        </label>

        <label>
          <span>
            Activation
          </span>

          <select
            value={
              activationStatus
            }
            onChange={(
              event,
            ) =>
              changeActivationStatus(
                event.target
                  .value as
                  ActivationStatusFilter,
              )
            }
          >
            <option value="">
              All activation states
            </option>

            <option value="ACTIVATED">
              Activated
            </option>

            <option value="AWAITING_ACTIVATION">
              Awaiting activation
            </option>
          </select>
        </label>

        <button
          type="button"
          className="directory-clear-button"
          onClick={
            clearFilters
          }
          disabled={
            !hasActiveFilters
          }
        >
          Clear filters
        </button>
      </section>

      {error && (
        <div
          className="directory-error"
          role="alert"
        >
          <div>
            <strong>
              Directory unavailable
            </strong>

            <p>{error}</p>
          </div>

          <button
            type="button"
            onClick={
              retryLoading
            }
          >
            Try again
          </button>
        </div>
      )}

      {loading &&
        !response && (
          <div className="directory-loading">
            <div className="spinner" />

            <p>
              Loading employee
              directory...
            </p>
          </div>
        )}

      {!loading &&
        !error &&
        employees.length ===
          0 && (
          <div className="directory-empty">
            <div
              aria-hidden="true"
            >
              NT
            </div>

            <h3>
              No employees found
            </h3>

            <p>
              Change the search or
              filters and try again.
            </p>
          </div>
        )}

      {employees.length >
        0 && (
        <div className="directory-table-wrap">
          <table className="directory-table">
            <thead>
              <tr>
                <th>
                  Employee
                </th>

                <th>
                  Role
                </th>

                <th>
                  Organization
                </th>

                <th>
                  Account
                </th>

                <th>
                  Activation
                </th>

                <th>
                  Last login
                </th>
              </tr>
            </thead>

            <tbody>
              {employees.map(
                (
                  employee,
                ) => (
                  <tr
                    key={
                      employee.id
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="directory-employee-button"
                        onClick={() =>
                          selectEmployee(
                            employee,
                          )
                        }
                      >
                        <span className="directory-avatar">
                          {getInitials(
                            employee.empName,
                          )}
                        </span>

                        <span>
                          <strong>
                            {
                              employee.empName
                            }
                          </strong>

                          <small>
                            {
                              employee.empId
                            }
                          </small>

                          <small>
                            {employee.designation ??
                              "No designation"}
                          </small>
                        </span>
                      </button>
                    </td>

                    <td>
                      <span
                        className={`directory-badge role-${getStatusClass(
                          employee.role ??
                            "NO_ACCOUNT",
                        )}`}
                      >
                        {employee.role
                          ? formatValue(
                              employee.role,
                            )
                          : "No account"}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {employee.department
                          ?.name ??
                          "No department"}
                      </strong>

                      <small>
                        {employee.division
                          ?.name ??
                          "No division"}
                      </small>
                    </td>

                    <td>
                      <span
                        className={`directory-badge ${getStatusClass(
                          employee.accountStatus,
                        )}`}
                      >
                        {formatValue(
                          employee.accountStatus,
                        )}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`directory-badge ${getStatusClass(
                          employee.activationStatus,
                        )}`}
                      >
                        {formatValue(
                          employee.activationStatus,
                        )}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {formatDate(
                          employee.lastLoginAt,
                        )}
                      </strong>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination &&
        pagination.totalPages >
          1 && (
          <footer className="directory-pagination">
            <button
              type="button"
              onClick={() =>
                changePage(
                  page - 1,
                )
              }
              disabled={
                loading ||
                page <= 1
              }
            >
              Previous
            </button>

            <span>
              Page{" "}
              {pagination.page} of{" "}
              {
                pagination.totalPages
              }
            </span>

            <button
              type="button"
              onClick={() =>
                changePage(
                  page + 1,
                )
              }
              disabled={
                loading ||
                page >=
                  pagination.totalPages
              }
            >
              Next
            </button>
          </footer>
        )}
    </section>
  );
}