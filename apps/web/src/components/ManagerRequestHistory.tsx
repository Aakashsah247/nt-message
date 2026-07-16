import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { ManagerRequestDetailPanel } from "./ManagerRequestDetailPanel";
import {
  listDivisionEmployeeRequests,
  listMyAccountRequests,
  type AccountRequestListFilters,
} from "../services/account-request.service";

import type {
  AccountRequestStatus,
  ManagerRequestContextResponse,
  MyAccountRequestListItem,
  ScopedAccountRequestListItem,
} from "../types/account-request";

interface ManagerRequestHistoryProps {
  accessToken: string;
  requestContext: ManagerRequestContextResponse;
  refreshKey: number;
  mode?: "SUBMITTED" | "DIVISION_EMPLOYEES";
}

interface StatusFilter {
  label: string;
  value: AccountRequestStatus | undefined;
}

const statusFilters: StatusFilter[] = [
  { label: "All", value: undefined },
  { label: "Pending", value: "PENDING_APPROVAL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Activation pending", value: "ACTIVATION_PENDING" },
  { label: "Activated", value: "ACTIVATED" },
];

const emptyFilters: AccountRequestListFilters = {
  search: "",
  departmentId: "",
  dateFrom: "",
  dateTo: "",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The account-request records could not be loaded.";
}

function formatStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusClass(status: string): string {
  return status.toLowerCase().replaceAll("_", "-");
}

function isScopedRequest(
  request: MyAccountRequestListItem | ScopedAccountRequestListItem,
): request is ScopedAccountRequestListItem {
  return "requestedBy" in request;
}

export function ManagerRequestHistory({
  accessToken,
  requestContext,
  refreshKey,
  mode = "SUBMITTED",
}: ManagerRequestHistoryProps) {
  const [requests, setRequests] = useState<
    Array<MyAccountRequestListItem | ScopedAccountRequestListItem>
  >([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [statusFilter, setStatusFilter] = useState<
    AccountRequestStatus | undefined
  >(undefined);
  const [draftFilters, setDraftFilters] =
    useState<AccountRequestListFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<AccountRequestListFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );

  const isDivisionEmployeeView = mode === "DIVISION_EMPLOYEES";
  const isSeniorManagement = requestContext.role === "SENIOR_MANAGEMENT";

  const copy = useMemo(() => {
    if (isDivisionEmployeeView) {
      return {
        eyebrow: "Division oversight",
        title: "Employee Requests Under My Division",
        description:
          "Read-only visibility of Employee requests submitted by Team Managers inside your assigned division.",
      };
    }

    if (isSeniorManagement) {
      return {
        eyebrow: "Request tracking",
        title: "My Team Manager Requests",
        description:
          "Create, correct and track Team Manager requests that you submitted for departments in your division.",
      };
    }

    return {
      eyebrow: "Request tracking",
      title: "My Employee Requests",
      description:
        "Create, correct and track Employee requests that you submitted for your assigned department.",
    };
  }, [isDivisionEmployeeView, isSeniorManagement]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const requestPromise = isDivisionEmployeeView
      ? listDivisionEmployeeRequests(
          accessToken,
          statusFilter,
          page,
          10,
          appliedFilters,
        )
      : listMyAccountRequests(
          accessToken,
          statusFilter,
          page,
          10,
          appliedFilters,
        );

    requestPromise
      .then((result) => {
        if (!active) {
          return;
        }

        setRequests(result.data);
        setPagination(result.pagination);
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setRequests([]);
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
  }, [
    accessToken,
    appliedFilters,
    isDivisionEmployeeView,
    localRefreshKey,
    page,
    refreshKey,
    statusFilter,
  ]);

  function changeStatus(status: AccountRequestStatus | undefined): void {
    if (status === statusFilter) {
      return;
    }

    setPage(1);
    setStatusFilter(status);
  }

  function changePage(nextPage: number): void {
    if (nextPage < 1 || nextPage === page) {
      return;
    }

    setPage(nextPage);
  }

  function retryLoading(): void {
    setLocalRefreshKey((current) => current + 1);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (
      draftFilters.dateFrom &&
      draftFilters.dateTo &&
      draftFilters.dateFrom > draftFilters.dateTo
    ) {
      setError("The start date cannot be after the end date.");
      return;
    }

    setError("");
    setPage(1);
    setAppliedFilters({
      ...draftFilters,
      // Convert the manager's local calendar boundaries to UTC before calling the API.
      dateFrom: draftFilters.dateFrom
        ? new Date(`${draftFilters.dateFrom}T00:00:00`).toISOString()
        : "",
      dateTo: draftFilters.dateTo
        ? new Date(`${draftFilters.dateTo}T23:59:59.999`).toISOString()
        : "",
    });
  }

  function clearFilters(): void {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setStatusFilter(undefined);
    setPage(1);
    setError("");
  }

  function handleCancelled(): void {
    setLocalRefreshKey((current) => current + 1);
  }

  function handleResubmitted(newRequestId: string): void {
    setStatusFilter("PENDING_APPROVAL");
    setPage(1);
    setSelectedRequestId(newRequestId);
    setLocalRefreshKey((current) => current + 1);
  }

  const activeFilterLabel =
    statusFilters.find((filter) => filter.value === statusFilter)?.label ??
    "All";
  const hasAdvancedFilters = Boolean(
    appliedFilters.search ||
      appliedFilters.departmentId ||
      appliedFilters.dateFrom ||
      appliedFilters.dateTo,
  );
  const hasDraftFilters = Boolean(
    draftFilters.search ||
      draftFilters.departmentId ||
      draftFilters.dateFrom ||
      draftFilters.dateTo,
  );

  return (
    <>
      <article className="manager-request-history" aria-busy={loading}>
        <header className="manager-request-history__header">
          <div>
            <span>{copy.eyebrow}</span>
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
          </div>

          <div className="manager-request-history__total">
            <small>Showing status</small>
            <span>{activeFilterLabel}</span>
            <strong>{pagination.total}</strong>
            <p>{isDivisionEmployeeView ? "Visible requests" : "My requests"}</p>
          </div>
        </header>

        <nav
          className="manager-request-history__filters"
          aria-label="Request status filters"
        >
          {statusFilters.map((filter) => {
            const active = filter.value === statusFilter;

            return (
              <button
                key={filter.value ?? "ALL"}
                type="button"
                className={active ? "active" : ""}
                aria-pressed={active}
                onClick={() => changeStatus(filter.value)}
              >
                {filter.label}
              </button>
            );
          })}
        </nav>

        <form
          className="manager-request-history__advanced"
          onSubmit={applyFilters}
        >
          <label className="manager-request-history__search">
            <span>Search records</span>
            <input
              type="search"
              value={draftFilters.search ?? ""}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder={
                isDivisionEmployeeView
                  ? "Employee, ID, email or Team Manager"
                  : "Employee name, ID or official email"
              }
            />
          </label>

          {isSeniorManagement && (
            <label>
              <span>Department</span>
              <select
                value={draftFilters.departmentId ?? ""}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    departmentId: event.target.value,
                  }))
                }
              >
                <option value="">All departments</option>
                {requestContext.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span>From</span>
            <input
              type="date"
              value={draftFilters.dateFrom ?? ""}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>To</span>
            <input
              type="date"
              value={draftFilters.dateTo ?? ""}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
            />
          </label>

          <div className="manager-request-history__advanced-actions">
            <button type="submit">Apply filters</button>
            <button
              type="button"
              onClick={clearFilters}
              disabled={
                !hasDraftFilters && !hasAdvancedFilters && !statusFilter
              }
            >
              Clear
            </button>
          </div>
        </form>

        {error && (
          <div
            className="manager-request-history__state manager-request-history__state--error"
            role="alert"
          >
            <div>
              <strong>Request history unavailable</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={retryLoading}>
              Try again
            </button>
          </div>
        )}

        {loading && requests.length === 0 && (
          <div className="manager-request-history__state">
            <div className="spinner" />
            <p>Loading authorized requests...</p>
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="manager-request-history__empty">
            <span aria-hidden="true">≡</span>
            <h3>No matching requests</h3>
            <p>
              {isDivisionEmployeeView
                ? "Employee requests submitted by Team Managers under your division will appear here."
                : "Requests submitted by your account will appear here."}
            </p>
            {hasAdvancedFilters && (
              <button type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {requests.length > 0 && (
          <div className="manager-request-history__table-wrap">
            <table className="manager-request-history__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Department</th>
                  {isDivisionEmployeeView && <th>Requested by</th>}
                  <th>Status</th>
                  <th>Activation email</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {requests.map((request) => (
                  <tr
                    key={request.id}
                    className={
                      selectedRequestId === request.id
                        ? "manager-request-history__row manager-request-history__row--selected"
                        : "manager-request-history__row"
                    }
                  >
                    <td data-label="Employee">
                      <strong>{request.empName}</strong>
                      <span>{request.empId}</span>
                      <small>{request.officialEmail}</small>
                    </td>

                    <td data-label="Role">
                      <strong>{formatStatus(request.requestedRole)}</strong>
                      <small>Revision {request.revisionNumber}</small>
                    </td>

                    <td data-label="Department">
                      <strong>
                        {request.department?.name ?? "Not assigned"}
                      </strong>
                      <small>{request.division?.name ?? "Not assigned"}</small>
                    </td>

                    {isDivisionEmployeeView && (
                      <td data-label="Requested by">
                        <strong>
                          {isScopedRequest(request)
                            ? (request.requestedBy.employee?.empName ??
                              "Team Manager")
                            : "Team Manager"}
                        </strong>
                        <small>
                          {isScopedRequest(request)
                            ? (request.requestedBy.employee?.empId ??
                              "Authorized requester")
                            : "Authorized requester"}
                        </small>
                      </td>
                    )}

                    <td data-label="Status">
                      <span
                        className={`manager-request-status manager-request-status--${getStatusClass(
                          request.status,
                        )}`}
                      >
                        {formatStatus(request.status)}
                      </span>
                      {request.rejectionReason && (
                        <small className="manager-request-history__reason">
                          {request.rejectionReason}
                        </small>
                      )}
                    </td>

                    <td data-label="Activation email">
                      <strong
                        className={`activation-delivery-status activation-delivery-status--${request.activationEmailStatus.toLowerCase()}`}
                      >
                        {formatStatus(request.activationEmailStatus)}
                      </strong>
                      <small>
                        {request.activationEmailSentAt
                          ? `Sent ${formatDate(request.activationEmailSentAt)}`
                          : request.activationEmailLastAttemptAt
                            ? `Attempted ${formatDate(
                                request.activationEmailLastAttemptAt,
                              )}`
                            : "Not attempted"}
                      </small>
                    </td>

                    <td data-label="Submitted">
                      <strong>{formatDate(request.submittedAt)}</strong>
                      <small>Updated {formatDate(request.updatedAt)}</small>
                    </td>

                    <td data-label="Action">
                      <button
                        type="button"
                        className="manager-request-history__view"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRequestId(request.id);
                        }}
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <footer className="manager-request-history__pagination">
            <button
              type="button"
              onClick={() => changePage(page - 1)}
              disabled={loading || page <= 1}
            >
              Previous
            </button>

            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <button
              type="button"
              onClick={() => changePage(page + 1)}
              disabled={loading || page >= pagination.totalPages}
            >
              Next
            </button>
          </footer>
        )}
      </article>

      {selectedRequestId && (
        <ManagerRequestDetailPanel
          accessToken={accessToken}
          requestId={selectedRequestId}
          requestContext={requestContext}
          readOnly={isDivisionEmployeeView}
          onClose={() => setSelectedRequestId(null)}
          onCancelled={handleCancelled}
          onResubmitted={handleResubmitted}
        />
      )}
    </>
  );
}
