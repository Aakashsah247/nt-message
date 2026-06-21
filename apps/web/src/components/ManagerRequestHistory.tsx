import { useEffect, useState } from "react";

import { ManagerRequestDetailPanel } from "./ManagerRequestDetailPanel";

import { listMyAccountRequests } from "../services/account-request.service";

import type {
  AccountRequestStatus,
  ManagerRequestContextResponse,
  MyAccountRequestListItem,
  MyAccountRequestListResponse,
} from "../types/account-request";

interface ManagerRequestHistoryProps {
  accessToken: string;

  requestContext: ManagerRequestContextResponse;

  refreshKey: number;
}

interface StatusFilter {
  label: string;

  value: AccountRequestStatus | undefined;
}

const statusFilters: StatusFilter[] = [
  {
    label: "All",
    value: undefined,
  },
  {
    label: "Pending",
    value: "PENDING_APPROVAL",
  },
  {
    label: "Approved",
    value: "APPROVED",
  },
  {
    label: "Rejected",
    value: "REJECTED",
  },
  {
    label: "Activation pending",
    value: "ACTIVATION_PENDING",
  },
  {
    label: "Activated",
    value: "ACTIVATED",
  },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Your request history could not be loaded.";
}

function formatStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRole(value: string): string {
  return formatStatus(value);
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

export function ManagerRequestHistory({
  accessToken,
  requestContext,
  refreshKey,
}: ManagerRequestHistoryProps) {
  const [response, setResponse] = useState<MyAccountRequestListResponse | null>(
    null,
  );

  const [statusFilter, setStatusFilter] = useState<
    AccountRequestStatus | undefined
  >(undefined);

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    listMyAccountRequests(accessToken, statusFilter, page, 10)
      .then((result) => {
        if (!active) {
          return;
        }

        setResponse(result);

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
  }, [accessToken, localRefreshKey, page, refreshKey, statusFilter]);

  function changeStatus(status: AccountRequestStatus | undefined): void {
    if (status === statusFilter) {
      return;
    }

    setLoading(true);
    setError("");
    setPage(1);
    setStatusFilter(status);
  }

  function changePage(nextPage: number): void {
    if (nextPage < 1 || nextPage === page) {
      return;
    }

    setLoading(true);
    setError("");
    setPage(nextPage);
  }

  function retryLoading(): void {
    setLoading(true);
    setError("");

    setLocalRefreshKey((current) => current + 1);
  }

  function openRequest(request: MyAccountRequestListItem): void {
    setSelectedRequestId(request.id);
  }

  function handleResubmitted(newRequestId: string): void {
    setStatusFilter("PENDING_APPROVAL");

    setPage(1);

    setLoading(true);

    setSelectedRequestId(newRequestId);

    setLocalRefreshKey((current) => current + 1);
  }

  const pagination = response?.pagination;

  const hasRequests = Boolean(response?.data.length);

  return (
    <>
      <article className="manager-history-card" aria-busy={loading}>
        <header className="manager-history-header">
          <div>
            <span>Request tracking</span>

            <h2>My request history</h2>

            <p>
              Review the approval, rejection, activation and resubmission status
              of requests created by your account.
            </p>
          </div>

          <div className="manager-history-total">
            <span>Total requests</span>

            <strong>{pagination?.total ?? 0}</strong>
          </div>
        </header>

        <nav
          className="manager-history-filters"
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

        {error && (
          <div className="manager-history-error" role="alert">
            <div>
              <strong>Request history unavailable</strong>

              <p>{error}</p>
            </div>

            <button type="button" onClick={retryLoading}>
              Try again
            </button>
          </div>
        )}

        {loading && !response && (
          <div className="manager-history-loading">
            <div className="spinner" />

            <p>Loading your requests...</p>
          </div>
        )}

        {!loading && !error && !hasRequests && (
          <div className="manager-history-empty">
            <div aria-hidden="true">≡</div>

            <h3>No requests found</h3>

            <p>There are no account requests in this status.</p>
          </div>
        )}

        {response && hasRequests && (
          <div className="manager-history-table-wrap">
            <table className="manager-history-table">
              <thead>
                <tr>
                  <th>Employee</th>

                  <th>Role</th>

                  <th>Department</th>

                  <th>Status</th>

                  <th>Submitted</th>
                </tr>
              </thead>

              <tbody>
                {response.data.map((request) => (
                  <tr
                    key={request.id}
                    className="manager-history-row"
                    tabIndex={0}
                    role="button"
                    onClick={() => openRequest(request)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();

                        openRequest(request);
                      }
                    }}
                  >
                    <td>
                      <strong>{request.empName}</strong>

                      <span>{request.empId}</span>

                      <small>{request.officialEmail}</small>
                    </td>

                    <td>
                      <strong>{formatRole(request.requestedRole)}</strong>

                      <small>Revision {request.revisionNumber}</small>
                    </td>

                    <td>
                      <strong>
                        {request.department?.name ?? "Not assigned"}
                      </strong>

                      <small>{request.division?.name ?? "Not assigned"}</small>
                    </td>

                    <td>
                      <span
                        className={`manager-status ${getStatusClass(
                          request.status,
                        )}`}
                      >
                        {formatStatus(request.status)}
                      </span>

                      {request.rejectionReason && (
                        <small className="manager-history-reason">
                          {request.rejectionReason}
                        </small>
                      )}
                    </td>

                    <td>
                      <strong>{formatDate(request.submittedAt)}</strong>

                      <small>Updated {formatDate(request.updatedAt)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <footer className="manager-history-pagination">
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
          onClose={() => setSelectedRequestId(null)}
          onResubmitted={handleResubmitted}
        />
      )}
    </>
  );
}
