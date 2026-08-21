import {
  useEffect,
  useState,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type {
  FormEvent,
} from "react";

import { ProtectedAvatar } from "./ProtectedAvatar";
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
  selectedEmployeeId?: string | null;
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
  t: TFunction<"directory">,
): string {
  return error instanceof Error
    ? error.message
    : t("list.errorFallback", { ns: "directory" });
}

function fallbackFormatValue(value: string): string {
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

function formatValue(
  value: string,
  t: TFunction<"directory">,
): string {
  return t(`values.${value}`, {
    ns: "directory",
    defaultValue: fallbackFormatValue(value),
  });
}

function formatDate(
  value: string | null,
  locale: string,
  t: TFunction<"directory">,
): string {
  if (!value) {
    return t("common.never", { ns: "directory" });
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return t("common.notAvailable", { ns: "directory" });
  }

  return new Intl.DateTimeFormat(
    locale === "ne" ? "ne-NP" : "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function getStatusClass(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", "-");
}

function getCurrentPositionLabel(
  employee: DirectoryEmployee,
  t: TFunction<"directory">,
): string {
  const position = employee.currentPosition;

  if (!position) {
    return t("position.none", { ns: "directory" });
  }

  if (position.positionType === "SENIOR_MANAGEMENT") {
    return t("position.seniorManagement", {
      ns: "directory",
      division: position.division.name,
    });
  }

  return t("position.teamManager", {
    ns: "directory",
    department:
      position.department?.name ??
        t("common.department", { ns: "directory" }),
  });
}


export function EmployeeDirectory({
  accessToken,
  reloadKey = 0,
  title,
  description,
  onSelectEmployee,
  selectedEmployeeId = null,
}: EmployeeDirectoryProps) {
  const { t, i18n } = useTranslation("directory");
  const resolvedTitle = title ?? t("list.defaultTitle");
  const resolvedDescription =
    description ?? t("list.defaultDescription");
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
              t,
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
    t,
  ]);

  function renderDirectoryAvatar(employee: DirectoryEmployee) {
    return (
      <ProtectedAvatar
        employeeId={employee.id}
        photoKey={employee.profilePhotoKey}
        displayName={employee.empName}
        className="directory-avatar"
        ariaLabel={t("list.avatarAria", { name: employee.empName })}
      />
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

  const firstVisibleRecord =
    pagination &&
    pagination.total > 0
      ? (pagination.page - 1) *
          PAGE_SIZE +
        1
      : 0;

  const lastVisibleRecord =
    pagination
      ? Math.min(
          pagination.page *
            PAGE_SIZE,
          pagination.total,
        )
      : 0;

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
        <div className="directory-header__copy">
          <span>{t("list.eyebrow")}</span>

          <h2>
            {recordStatus ===
            "ARCHIVED"
              ? t("list.archivedTitle")
              : resolvedTitle}
          </h2>

          <p>
            {recordStatus ===
            "ARCHIVED"
              ? t("list.archivedDescription")
              : resolvedDescription}
          </p>
        </div>

        <div className="directory-total">
          <span
            className="directory-total__icon"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>

          <span>
            {recordStatus ===
            "ARCHIVED"
              ? t("list.archivedRecords")
              : t("list.currentRecords")}
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
          aria-label={t("list.recordSectionsAria")}
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
            {t("list.currentRecords")}
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
            {t("list.archivedRecords")}
          </button>
        </nav>
      )}

      {scope && (
        <section className="directory-scope">
          <div>
            <span>
              {t("list.scope.title")}
            </span>

            <strong>
              {formatValue(
                scope.type,
                t,
              )}
            </strong>
          </div>

          <div>
            <span>
              {t("list.scope.division")}
            </span>

            <strong>
              {scope.division
                ?.name ??
                t("list.scope.allDivisions")}
            </strong>
          </div>

          <div>
            <span>
              {t("list.scope.department")}
            </span>

            <strong>
              {scope.department
                ?.name ??
                t("list.scope.allDepartments")}
            </strong>
          </div>

          <div>
            <span>
              {t("list.scope.contactAccess")}
            </span>

            <strong>
              {formatValue(
                scope.contactVisibility,
                t,
              )}
            </strong>
          </div>
        </section>
      )}

      <section
        className="directory-toolbar"
        aria-label={t("list.toolbarAria")}
      >
        <form
          className="directory-search"
          onSubmit={
            submitSearch
          }
        >
          <label>
            <span>
              {t("list.search.label")}
            </span>

            <div className="directory-search__control">
              <span
                className="directory-search__icon"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                  />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>

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
                placeholder={t("list.search.placeholder")}
              />

              <button
                type="submit"
              >
                {t("list.search.action")}
              </button>
            </div>
          </label>
        </form>

        <section className="directory-filters">
          <label>
            <span>{t("list.filters.role")}</span>

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
                {t("list.filters.allRoles")}
              </option>

              <option value="SUPER_ADMIN">
                {t("roles.SUPER_ADMIN")}
              </option>

              <option value="SENIOR_MANAGEMENT">
                {t("roles.SENIOR_MANAGEMENT")}
              </option>

              <option value="TEAM_MANAGER">
                {t("roles.TEAM_MANAGER")}
              </option>

              <option value="EMPLOYEE">
                {t("roles.EMPLOYEE")}
              </option>
            </select>
          </label>

          <label>
            <span>
              {t("list.filters.employeeStatus")}
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
                {t("list.filters.allStatuses")}
              </option>

              <option value="ACTIVE">
                {t("values.ACTIVE")}
              </option>

              <option value="INACTIVE">
                {t("values.INACTIVE")}
              </option>
            </select>
          </label>

          <label>
            <span>
              {t("list.filters.employment")}
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
                {t("list.filters.allEmployment")}
              </option>

              <option value="ACTIVE">
                {t("values.ACTIVE")}
              </option>

              <option value="RESIGNED">
                {t("values.RESIGNED")}
              </option>

              <option value="RETIRED">
                {t("values.RETIRED")}
              </option>

              <option value="TERMINATED">
                {t("values.TERMINATED")}
              </option>

              <option value="TRANSFERRED">
                {t("values.TRANSFERRED")}
              </option>
            </select>
          </label>

          <label>
            <span>
              {t("list.filters.accountStatus")}
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
                {t("list.filters.allAccounts")}
              </option>

              <option value="ENABLED">
                {t("values.ENABLED")}
              </option>

              <option value="DISABLED">
                {t("values.DISABLED")}
              </option>

              <option value="NO_ACCOUNT">
                {t("values.NO_ACCOUNT")}
              </option>
            </select>
          </label>

          <label>
            <span>
              {t("list.filters.activation")}
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
                {t("list.filters.allActivation")}
              </option>

              <option value="ACTIVATED">
                {t("values.ACTIVATED")}
              </option>

              <option value="AWAITING_ACTIVATION">
                {t("values.AWAITING_ACTIVATION")}
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
            {t("list.filters.clear")}
          </button>
        </section>
      </section>

      {error && (
        <div
          className="directory-error"
          role="alert"
        >
          <div>
            <strong>
              {t("list.errorTitle")}
            </strong>

            <p>{error}</p>
          </div>

          <button
            type="button"
            onClick={
              retryLoading
            }
          >
            {t("common.tryAgain")}
          </button>
        </div>
      )}

      {loading &&
        !response && (
          <div className="directory-loading">
            <div className="spinner" />

            <p>
              {t("list.loading")}
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
                ? t("list.empty.archivedTitle")
                : t("list.empty.currentTitle")}
            </h3>

            <p>
              {recordStatus ===
              "ARCHIVED"
                ? t("list.empty.archivedDescription")
                : t("list.empty.currentDescription")}
            </p>
          </div>
        )}

      {employees.length >
        0 && (
        <>
          <div className="directory-results-bar">
            <div>
              <strong>
                {recordStatus ===
                "ARCHIVED"
                  ? t("list.results.archivedEmployees")
                  : t("list.results.employees")}
              </strong>

              <span>
                {t("list.results.showing", { first: firstVisibleRecord, last: lastVisibleRecord, total: pagination?.total ?? 0 })}
              </span>
            </div>

            {loading &&
              response && (
              <span
                className="directory-results-bar__updating"
                role="status"
              >
                {t("list.results.updating")}
              </span>
            )}
          </div>

          <div className="directory-table-wrap">
          <table className="directory-table">
            <caption className="sr-only">
              {t("list.table.caption")}
            </caption>

            <thead>
              <tr>
                <th>
                  {t("roles.EMPLOYEE")}
                </th>

                <th>
                  {t("list.table.effectiveRole")}
                </th>

                <th>
                  {t("list.table.currentPosition")}
                </th>

                <th>
                  {t("list.table.organization")}
                </th>

                <th>
                  {t("list.filters.employment")}
                </th>

                <th>
                  {t("list.table.account")}
                </th>

                <th>
                  {t("list.filters.activation")}
                </th>

                <th>
                  {recordStatus ===
                  "ARCHIVED"
                    ? t("list.table.archivedOn")
                    : t("list.table.lastLogin")}
                </th>

                <th
                  aria-label={t("list.table.profileActions")}
                />
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
                    className={
                      selectedEmployeeId ===
                      employee.id
                        ? "is-selected"
                        : ""
                    }
                  >
                    <td data-label={t("list.table.employee")}>
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
                              t("list.table.noDesignation")}
                          </small>
                        </span>
                      </button>
                    </td>

                    <td data-label={t("list.table.effectiveRole")}>
                      <span
                        className={`directory-badge role-${getStatusClass(
                          employee.effectiveRole ??
                            "NO_ACCOUNT",
                        )}`}
                      >
                        {employee.effectiveRole
                          ? formatValue(
                              employee.effectiveRole,
                              t,
                            )
                          : t("common.noAccount")}
                      </span>
                    </td>

                    <td data-label={t("list.table.currentPosition")}>
                      <strong>
                        {getCurrentPositionLabel(
                          employee,
                          t,
                        )}
                      </strong>

                      <small>
                        {employee.currentPosition
                          ? t("position.status", {
                              status: formatValue(
                                employee.currentPosition.status,
                                t,
                              ),
                            })
                          : t("position.noCurrentAssignment")}
                      </small>
                    </td>

                    <td data-label={t("list.table.organization")}>
                      <strong>
                        {employee.department
                          ?.name ??
                          t("list.table.noDepartment")}
                      </strong>

                      <small>
                        {employee.division
                          ?.name ??
                          t("list.table.noDivision")}
                      </small>
                    </td>

                    <td data-label={t("list.table.employment")}>
                      <span
                        className={`directory-badge ${getStatusClass(
                          employee.employmentStatus,
                        )}`}
                      >
                        {formatValue(
                          employee.employmentStatus,
                          t,
                        )}
                      </span>
                    </td>

                    <td data-label={t("list.table.account")}>
                      <span
                        className={`directory-badge ${getStatusClass(
                          employee.accountStatus,
                        )}`}
                      >
                        {formatValue(
                          employee.accountStatus,
                          t,
                        )}
                      </span>
                    </td>

                    <td data-label={t("list.table.activation")}>
                      <span
                        className={`directory-badge ${getStatusClass(
                          employee.activationStatus,
                        )}`}
                      >
                        {formatValue(
                          employee.activationStatus,
                          t,
                        )}
                      </span>
                    </td>

                    <td
                      className="directory-date"
                      data-label={
                        recordStatus ===
                        "ARCHIVED"
                          ? t("list.table.archivedOn")
                          : t("list.table.lastLogin")
                      }
                    >
                      <strong>
                        {formatDate(
                          recordStatus ===
                          "ARCHIVED"
                            ? employee.archivedAt
                            : employee.lastLoginAt,
                          i18n.language,
                          t,
                        )}
                      </strong>
                    </td>

                    <td
                      className="directory-row-action"
                      data-label={t("common.profile")}
                    >
                      <button
                        type="button"
                        aria-label={t("list.table.viewProfileAria", { name: employee.empName })}
                        onClick={() =>
                          selectEmployee(
                            employee,
                          )
                        }
                      >
                        <span>{t("common.view")}</span>
                        <span aria-hidden="true">›</span>
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          </div>
        </>
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
              {t("list.pagination.previous")}
            </button>

            <span>
              {t("list.pagination.page", { page: pagination.page, totalPages: pagination.totalPages })}
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
              {t("list.pagination.next")}
            </button>
          </footer>
        )}
    </section>
  );
}
