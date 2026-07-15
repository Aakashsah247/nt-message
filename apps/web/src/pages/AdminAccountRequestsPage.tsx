import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { AdminRequestDetailPanel } from "../components/AdminRequestDetailPanel";
import { ProtectedAvatar } from "../components/ProtectedAvatar";
import { ManagementIcon } from "../components/layout/ManagementIcon";
import { useAuth } from "../context/AuthContext";
import {
  getAdminDepartments,
  getAdminDivisions,
} from "../services/admin-account.service";
import {
  getAdminAccountRequestSummary,
  listAdminAccountRequests,
} from "../services/account-request.service";
import type {
  AccountRequestStatus,
  AdminAccountRequestListItem,
  AdminAccountRequestListQuery,
  AdminAccountRequestSummaryResponse,
} from "../types/account-request";
import type { AdminDepartment, AdminDivision } from "../types/admin-account";
import type { AccountRole } from "../types/auth";

const PAGE_SIZE = 20;
const STATUS_OPTIONS: Array<{ value: AccountRequestStatus; label: string }> = [
  { value: "PENDING_APPROVAL", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ACTIVATION_PENDING", label: "Activating" },
  { value: "ACTIVATED", label: "Activated" },
  { value: "DRAFT", label: "Draft" },
];
const VALID_STATUSES = new Set<AccountRequestStatus>(
  STATUS_OPTIONS.map((option) => option.value),
);

function parseStatus(value: string | null): AccountRequestStatus {
  return value && VALID_STATUSES.has(value as AccountRequestStatus)
    ? (value as AccountRequestStatus)
    : "PENDING_APPROVAL";
}

function formatValue(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not reviewed";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function getStatusClass(status: AccountRequestStatus): string {
  return status.toLowerCase().replaceAll("_", "-");
}

function getRequesterName(request: AdminAccountRequestListItem): string {
  return (
    request.requestedBy.employee?.empName ??
    request.requestedBy.username ??
    "Unknown requester"
  );
}

function getLifecycleText(request: AdminAccountRequestListItem): string {
  switch (request.status) {
    case "ACTIVATED":
      return "Account activation complete";
    case "ACTIVATION_PENDING":
      return "Awaiting employee activation";
    case "APPROVED":
      return "Approved; activation preparation in progress";
    case "REJECTED":
      return "Returned to requester for correction";
    case "PENDING_APPROVAL":
      return "Waiting for Super Admin review";
    case "DRAFT":
    default:
      return "Not yet submitted for review";
  }
}


function RequestEmployeeAvatar({
  request,
}: {
  request: AdminAccountRequestListItem;
}) {
  if (request.status !== "ACTIVATED") {
    return (
      <span className="admin-account-requests-page__request-avatar" aria-hidden="true">
        {request.empName.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <ProtectedAvatar
      employeeId={request.employeeId}
      officialEmail={request.officialEmail}
      displayName={request.empName}
      className="admin-account-requests-page__request-avatar"
      ariaLabel={`${request.empName} profile`}
    />
  );
}

export function AdminAccountRequestsPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get("status"));
  const selectedRequestId = searchParams.get("request");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [requestedRole, setRequestedRole] = useState<AccountRole | "">("");
  const [divisionId, setDivisionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<AdminAccountRequestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] =
    useState<AdminAccountRequestSummaryResponse | null>(null);
  const [divisions, setDivisions] = useState<AdminDivision[]>([]);
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [organizationError, setOrganizationError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    // Debouncing avoids issuing a server request for every keystroke while the
    // Super Admin is still entering an employee or requester search term.
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

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
        setOrganizationError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setOrganizationError(
          requestError instanceof Error
            ? requestError.message
            : "Organization filters could not be loaded.",
        );
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    setSummaryLoading(true);

    getAdminAccountRequestSummary(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

        setSummary(response);
      })
      .catch(() => {
        if (active) {
          setSummary(null);
        }
      })
      .finally(() => {
        if (active) {
          setSummaryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  const query = useMemo<AdminAccountRequestListQuery>(
    () => ({
      status,
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      requestedRole: requestedRole || undefined,
      divisionId: divisionId || undefined,
      departmentId: departmentId || undefined,
      // Date-only inputs are expanded to the complete local calendar day before
      // the API receives UTC timestamps, preventing midnight boundary omissions.
      dateFrom: dateFrom
        ? new Date(`${dateFrom}T00:00:00`).toISOString()
        : undefined,
      dateTo: dateTo
        ? new Date(`${dateTo}T23:59:59.999`).toISOString()
        : undefined,
    }),
    [
      dateFrom,
      dateTo,
      debouncedSearch,
      departmentId,
      divisionId,
      page,
      requestedRole,
      status,
    ],
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    setLoading(true);

    listAdminAccountRequests(accessToken, query)
      .then((response) => {
        if (!active) {
          return;
        }

        setRequests(response.data);
        setTotal(response.pagination.total);
        setTotalPages(response.pagination.totalPages);
        setLastRefreshedAt(new Date().toISOString());
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setRequests([]);
        setTotal(0);
        setTotalPages(0);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Account requests could not be loaded.",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, query, refreshKey]);

  const filteredDepartments = useMemo(
    () =>
      departments.filter(
        (department) =>
          department.isActive &&
          (!divisionId || department.division.id === divisionId),
      ),
    [departments, divisionId],
  );

  const activeFilterCount = [
    searchInput.trim(),
    requestedRole,
    divisionId,
    departmentId,
    dateFrom,
    dateTo,
  ].filter(Boolean).length;

  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, total);

  function changeStatus(nextStatus: AccountRequestStatus): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("status", nextStatus);
      next.delete("request");
      return next;
    });
  }

  function openRequest(requestId: string): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("status", status);
      next.set("request", requestId);
      return next;
    });
  }

  function closeRequest(): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("request");
      return next;
    });
  }

  function resetFilters(): void {
    setSearchInput("");
    setDebouncedSearch("");
    setRequestedRole("");
    setDivisionId("");
    setDepartmentId("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  function refreshRequests(): void {
    setRefreshKey((current) => current + 1);
  }

  return (
    <main className="management-page admin-account-requests-page">
      <header className="admin-account-requests-page__header">
        <div className="admin-account-requests-page__header-copy">
          <span>Account governance</span>
          <h1>Account Requests</h1>
          <p>
            Search, review and manage organization-wide employee and management
            account requests from one controlled workspace.
          </p>
        </div>

        <div className="admin-account-requests-page__refresh">
          <span>
            {lastRefreshedAt
              ? `Updated ${formatDate(lastRefreshedAt)}`
              : "Loading current queue"}
          </span>
          <button type="button" onClick={refreshRequests} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh requests"}
          </button>
        </div>
      </header>

      <nav
        className="admin-account-requests-page__statuses"
        aria-label="Request status"
      >
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={status === option.value ? "active" : ""}
            aria-pressed={status === option.value}
            onClick={() => changeStatus(option.value)}
          >
            <span>{option.label}</span>
            <strong>
              {summaryLoading && !summary ? "—" : summary?.counts[option.value] ?? 0}
            </strong>
          </button>
        ))}
      </nav>

      <section className="admin-account-requests-page__filters" aria-label="Request filters">
        <div className="admin-account-requests-page__filter-heading">
          <div>
            <ManagementIcon name="requests" />
            <span>
              <strong>Search and filters</strong>
              <small>Narrow the current {formatValue(status).toLowerCase()} queue.</small>
            </span>
          </div>
          <span className="admin-account-requests-page__filter-count">
            {activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}
          </span>
        </div>

        <label className="admin-account-requests-page__search">
          <span>Employee or requester</span>
          <input
            type="search"
            value={searchInput}
            placeholder="Name, employee ID, official email or requester"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>

        <label>
          <span>Requested role</span>
          <select
            value={requestedRole}
            onChange={(event) => {
              setRequestedRole(event.target.value as AccountRole | "");
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="TEAM_MANAGER">Team Manager</option>
            <option value="SENIOR_MANAGEMENT">Senior Management</option>
          </select>
        </label>

        <label>
          <span>Division</span>
          <select
            value={divisionId}
            onChange={(event) => {
              const nextDivisionId = event.target.value;
              setDivisionId(nextDivisionId);
              setPage(1);

              if (
                departmentId &&
                !departments.some(
                  (department) =>
                    department.id === departmentId &&
                    (!nextDivisionId || department.division.id === nextDivisionId),
                )
              ) {
                setDepartmentId("");
              }
            }}
          >
            <option value="">All divisions</option>
            {divisions
              .filter((division) => division.isActive)
              .map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name} ({division.code})
                </option>
              ))}
          </select>
        </label>

        <label>
          <span>Department</span>
          <select
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {filteredDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name} ({department.code})
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Submitted from</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <label>
          <span>Submitted to</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <button
          type="button"
          className="admin-account-requests-page__clear"
          onClick={resetFilters}
          disabled={activeFilterCount === 0}
        >
          Clear filters
        </button>

        {organizationError && (
          <p className="admin-account-requests-page__filter-warning" role="status">
            Organization filters are temporarily unavailable: {organizationError}
          </p>
        )}
      </section>

      <section className="admin-account-requests-page__records">
        <header>
          <div>
            <span>{formatValue(status)} queue</span>
            <h2>
              {total} request{total === 1 ? "" : "s"}
            </h2>
          </div>
          {total > 0 ? (
            <small>
              Showing {firstResult}–{lastResult} of {total}
            </small>
          ) : (
            <small>0 requests in this view</small>
          )}
        </header>

        {!accessToken && (
          <div className="admin-request-error">
            Your secure session is unavailable.
          </div>
        )}
        {error && <div className="admin-request-error">{error}</div>}
        {loading && (
          <div className="admin-account-requests-page__state">
            <span className="admin-account-requests-page__loader" aria-hidden="true" />
            Loading account requests…
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="admin-account-requests-page__empty">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>
                {activeFilterCount > 0
                  ? "No requests match these filters"
                  : `${formatValue(status)} queue is clear`}
              </strong>
              <p>
                {activeFilterCount > 0
                  ? "Clear or adjust the filters to broaden the results."
                  : "There are no requests requiring attention in this status."}
              </p>
            </div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={resetFilters}>
                Reset filters
              </button>
            )}
          </div>
        )}

        {!loading && !error && requests.length > 0 && (
          <>
            <div className="admin-account-requests-page__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Request</th>
                    <th>Organization</th>
                    <th>Requested by</th>
                    <th>Lifecycle</th>
                    <th>Submitted</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <span className="admin-account-requests-page__employee-cell">
                          <RequestEmployeeAvatar request={request} />
                          <span>
                            <strong>{request.empName}</strong>
                            <small>{request.empId}</small>
                            <small>{request.officialEmail}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <strong>{formatValue(request.requestedRole)}</strong>
                        <span>Revision {request.revisionNumber}</span>
                      </td>
                      <td>
                        <strong>{request.department?.name ?? "No department"}</strong>
                        <span>{request.division?.name ?? "No division"}</span>
                      </td>
                      <td>
                        <strong>{getRequesterName(request)}</strong>
                        <span>{formatValue(request.requestedBy.role)}</span>
                      </td>
                      <td>
                        <span
                          className={`admin-status-badge ${getStatusClass(request.status)}`}
                        >
                          {formatValue(request.status)}
                        </span>
                        <small>{getLifecycleText(request)}</small>
                      </td>
                      <td>
                        <strong>{formatDate(request.submittedAt)}</strong>
                        <span>
                          {request.reviewedAt
                            ? `Reviewed ${formatDate(request.reviewedAt)}`
                            : "Not reviewed"}
                        </span>
                      </td>
                      <td>
                        <button type="button" onClick={() => openRequest(request.id)}>
                          View details <span aria-hidden="true">→</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-account-requests-page__cards">
              {requests.map((request) => (
                <article key={request.id}>
                  <header>
                    <span className="admin-account-requests-page__mobile-identity">
                      <RequestEmployeeAvatar request={request} />
                      <span>
                        <strong>{request.empName}</strong>
                        <small>{request.empId}</small>
                      </span>
                    </span>
                    <span
                      className={`admin-status-badge ${getStatusClass(request.status)}`}
                    >
                      {formatValue(request.status)}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>Requested role</dt>
                      <dd>{formatValue(request.requestedRole)}</dd>
                    </div>
                    <div>
                      <dt>Organization</dt>
                      <dd>
                        {request.department?.name ??
                          request.division?.name ??
                          "Unassigned"}
                      </dd>
                    </div>
                    <div>
                      <dt>Requested by</dt>
                      <dd>{getRequesterName(request)}</dd>
                    </div>
                    <div>
                      <dt>Submitted</dt>
                      <dd>{formatDate(request.submittedAt)}</dd>
                    </div>
                  </dl>
                  <p>{getLifecycleText(request)}</p>
                  <button type="button" onClick={() => openRequest(request.id)}>
                    View request details <span aria-hidden="true">→</span>
                  </button>
                </article>
              ))}
            </div>
          </>
        )}

        {!loading && !error && totalPages > 1 && (
          <footer className="admin-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              ← Previous
            </button>
            <span>
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next →
            </button>
          </footer>
        )}
      </section>

      {selectedRequestId && accessToken && (
        <AdminRequestDetailPanel
          key={selectedRequestId}
          accessToken={accessToken}
          requestId={selectedRequestId}
          onRequestUpdated={refreshRequests}
          onClose={closeRequest}
        />
      )}
    </main>
  );
}
