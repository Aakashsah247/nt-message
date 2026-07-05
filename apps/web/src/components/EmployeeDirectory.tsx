import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  listDirectoryEmployees,
} from "../services/directory.service";
import {
  createDirectoryProfilePhotoObjectUrl,
} from "../services/messaging.service";

import type {
  AccountRole,
} from "../types/auth";

import type {
  DirectoryAccountStatus,
  DirectoryActivationStatus,
  DirectoryEmployee,
  DirectoryEmployeeStatus,
  DirectoryEmploymentStatus,
  DirectoryListResponse,
  DirectoryRecordStatus,
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

type EmploymentStatusFilter =
  | DirectoryEmploymentStatus
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

function getCurrentPositionLabel(
  employee: DirectoryEmployee,
): string {
  const position =
    employee.currentPosition;

  if (!position) {
    return "No management position";
  }

  if (
    position.positionType ===
    "SENIOR_MANAGEMENT"
  ) {
    return `${position.division.name} Senior Management`;
  }

  return `${position.department?.name ?? "Department"} Team Manager`;
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
    employmentStatus,
    setEmploymentStatus,
  ] =
    useState<EmploymentStatusFilter>("");

  const [
    recordStatus,
    setRecordStatus,
  ] =
    useState<DirectoryRecordStatus>(
      "CURRENT",
    );

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

  const [profilePhotoUrls, setProfilePhotoUrls] = useState<Record<string, string>>({});
  const [profilePhotoCacheKeys, setProfilePhotoCacheKeys] = useState<Record<string, string>>({});
  const profilePhotoUrlsRef = useRef<Record<string, string>>({});

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

        employmentStatus:
          employmentStatus ||
          undefined,

        recordStatus,

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
    employmentStatus,
    page,
    refreshKey,
    reloadKey,
    recordStatus,
    role,
    search,
  ]);

  useEffect(() => {
    const employeesWithPhotos = (response?.data ?? []).filter((employee) => {
      const cacheKey = employee.profilePhotoKey ?? "__account-photo-check__";
      return profilePhotoCacheKeys[employee.id] !== cacheKey;
    });

    if (employeesWithPhotos.length === 0) {
      return;
    }

    let cancelled = false;
    const loadedUrls: string[] = [];

    // Directory avatars use protected blob URLs. Try by employee id even when the list response
    // does not include profilePhotoKey, because messaging profile photos are stored on accounts.
    void Promise.all(
      employeesWithPhotos.map(async (employee) => {
        const cacheKey = employee.profilePhotoKey ?? "__account-photo-check__";

        try {
          const url = await createDirectoryProfilePhotoObjectUrl(accessToken, employee.id);
          loadedUrls.push(url);
          return [employee.id, cacheKey, url] as const;
        } catch {
          return [employee.id, cacheKey, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        loadedUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setProfilePhotoUrls((current) => {
        const next = { ...current };

        for (const [employeeId, , url] of entries) {
          if (next[employeeId]) {
            URL.revokeObjectURL(next[employeeId]);
            delete next[employeeId];
          }

          if (url) {
            next[employeeId] = url;
          }
        }

        return next;
      });

      setProfilePhotoCacheKeys((current) => ({
        ...current,
        ...Object.fromEntries(entries.map(([employeeId, photoKey]) => [employeeId, photoKey])),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, response?.data, profilePhotoCacheKeys]);

  useEffect(() => {
    profilePhotoUrlsRef.current = profilePhotoUrls;
  }, [profilePhotoUrls]);

  useEffect(() => () => {
    Object.values(profilePhotoUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function renderDirectoryAvatar(employee: DirectoryEmployee) {
    const photoUrl = profilePhotoUrls[employee.id] ?? null;

    return (
      <span className="directory-avatar">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`${employee.empName} profile`}
          />
        ) : (
          getInitials(employee.empName)
        )}
      </span>
    );
  }

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
    setEmploymentStatus("");
    setAccountStatus("");
    setActivationStatus("");
    setPage(1);
    setLoading(true);
    setError("");
  }

  function changeRecordStatus(
    value:
      DirectoryRecordStatus,
  ): void {
    setRecordStatus(value);

    // Show all records when changing directory sections.
    setSearchInput("");
    setSearch("");
    setRole("");
    setEmployeeStatus("");
    setEmploymentStatus("");
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

  function changeEmploymentStatus(
    value:
      EmploymentStatusFilter,
  ): void {
    setEmploymentStatus(value);
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
      employmentStatus ||
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

          <h2>
            {recordStatus ===
            "ARCHIVED"
              ? "Archived Employee Records"
              : title}
          </h2>

          <p>
            {recordStatus ===
            "ARCHIVED"
              ? "Review archived Patan Branch employees and their preserved lifecycle records."
              : description}
          </p>
        </div>

        <div className="directory-total">
          <span>
            {recordStatus ===
            "ARCHIVED"
              ? "Archived records"
              : "Current records"}
          </span>

          <strong>
            {pagination?.total ??
              0}
          </strong>
        </div>
      </header>

      {scope?.role ===
        "SUPER_ADMIN" && (
        <nav
          className="directory-record-tabs"
          aria-label="Employee record sections"
        >
          <button
            type="button"
            className={
              recordStatus ===
              "CURRENT"
                ? "active"
                : ""
            }
            onClick={() =>
              changeRecordStatus(
                "CURRENT",
              )
            }
          >
            Current records
          </button>

          <button
            type="button"
            className={
              recordStatus ===
              "ARCHIVED"
                ? "active"
                : ""
            }
            onClick={() =>
              changeRecordStatus(
                "ARCHIVED",
              )
            }
          >
            Archived records
          </button>
        </nav>
      )}

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
            Employment
          </span>

          <select
            value={
              employmentStatus
            }
            onChange={(
              event,
            ) =>
              changeEmploymentStatus(
                event.target
                  .value as
                  EmploymentStatusFilter,
              )
            }
          >
            <option value="">
              All employment states
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="RESIGNED">
              Resigned
            </option>

            <option value="RETIRED">
              Retired
            </option>

            <option value="TERMINATED">
              Terminated
            </option>

            <option value="TRANSFERRED">
              Transferred
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
              {recordStatus ===
              "ARCHIVED"
                ? "No archived employees"
                : "No employees found"}
            </h3>

            <p>
              {recordStatus ===
              "ARCHIVED"
                ? "Archived employee records will appear here."
                : "Change the search or filters and try again."}
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
                  Effective role
                </th>

                <th>
                  Current position
                </th>

                <th>
                  Organization
                </th>

                <th>
                  Employment
                </th>

                <th>
                  Account
                </th>

                <th>
                  Activation
                </th>

                <th>
                  {recordStatus ===
                  "ARCHIVED"
                    ? "Archived on"
                    : "Last login"}
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
                        {renderDirectoryAvatar(employee)}

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
                          employee.effectiveRole ??
                            "NO_ACCOUNT",
                        )}`}
                      >
                        {employee.effectiveRole
                          ? formatValue(
                              employee.effectiveRole,
                            )
                          : "No account"}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {getCurrentPositionLabel(
                          employee,
                        )}
                      </strong>

                      <small>
                        {employee.currentPosition
                          ? `${formatValue(
                              employee.currentPosition.status,
                            )} position`
                          : "No current assignment"}
                      </small>
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
                          employee.employmentStatus,
                        )}`}
                      >
                        {formatValue(
                          employee.employmentStatus,
                        )}
                      </span>
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
                          recordStatus ===
                          "ARCHIVED"
                            ? employee.archivedAt
                            : employee.lastLoginAt,
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
