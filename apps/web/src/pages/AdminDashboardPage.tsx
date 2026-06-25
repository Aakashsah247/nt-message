import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { AdminRequestDetailPanel } from "../components/AdminRequestDetailPanel";
import { DirectoryButton } from "../components/DirectoryButton";
import { ManagementPositionsButton } from "../components/ManagementPositionsButton";
import { AdminOrganizationPanel } from "../components/AdminOrganizationPanel";

import { useAuth } from "../context/AuthContext";
import { listAdminAccountRequests } from "../services/account-request.service";

import type {
  AccountRequestStatus,
  AdminAccountRequestListItem,
} from "../types/account-request";



interface StatusOption {
  status: AccountRequestStatus;
  label: string;
  description: string;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS: StatusOption[] = [
  {
    status: "PENDING_APPROVAL",
    label: "Pending",
    description: "Requests waiting for review",
  },
  {
    status: "APPROVED",
    label: "Approved",
    description: "Approved employee identities",
  },
  {
    status: "REJECTED",
    label: "Rejected",
    description: "Requests returned for correction",
  },
  {
    status: "ACTIVATION_PENDING",
    label: "Activating",
    description: "Users completing OTP activation",
  },
  {
    status: "ACTIVATED",
    label: "Activated",
    description: "Fully activated accounts",
  },
  {
    status: "DRAFT",
    label: "Draft",
    description: "Requests not yet submitted",
  },
];

const initialCounts: Record<AccountRequestStatus, number> = {
  DRAFT: 0,
  PENDING_APPROVAL: 0,
  APPROVED: 0,
  REJECTED: 0,
  ACTIVATION_PENDING: 0,
  ACTIVATED: 0,
};

const initialPagination: PaginationState = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Account requests could not be loaded.";
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatus(status: AccountRequestStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusClass(status: AccountRequestStatus): string {
  return status.toLowerCase().replaceAll("_", "-");
}

function formatDate(value: string | null): string {
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getRequesterName(request: AdminAccountRequestListItem): string {
  return (
    request.requestedBy.employee?.empName ??
    request.requestedBy.username ??
    "Unknown requester"
  );
}

type AdminView =
  | "requests"
  | "organization";

export function AdminDashboardPage() {
  const navigate = useNavigate();

  const { account, accessToken, logout } = useAuth();

  // Controls the main Super Admin workspace.
  const [view, setView] =
  useState<AdminView>("requests");

  const [selectedStatus, setSelectedStatus] =
    useState<AccountRequestStatus>("PENDING_APPROVAL");

  const [requests, setRequests] = useState<AdminAccountRequestListItem[]>([]);

  const [counts, setCounts] = useState(initialCounts);

  const [pagination, setPagination] =
    useState<PaginationState>(initialPagination);

  const [loading, setLoading] = useState(true);

  const [countsLoading, setCountsLoading] = useState(true);

  const [error, setError] = useState("");

  const [loggingOut, setLoggingOut] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const selectedOption = useMemo(
    () =>
      STATUS_OPTIONS.find((option) => option.status === selectedStatus) ??
      STATUS_OPTIONS[0],
    [selectedStatus],
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;

    listAdminAccountRequests(
      accessToken,
      selectedStatus,
      pagination.page,
      PAGE_SIZE,
    )
      .then((response) => {
        if (!active) {
          return;
        }

        setRequests(response.data);

        setPagination(response.pagination);

        setError("");
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
  }, [accessToken, selectedStatus, pagination.page, refreshKey]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;

    Promise.all(
      STATUS_OPTIONS.map(async (option) => {
        const response = await listAdminAccountRequests(
          accessToken,
          option.status,
          1,
          1,
        );

        return [option.status, response.pagination.total] as const;
      }),
    )
      .then((entries) => {
        if (!active) {
          return;
        }

        setCounts(
          Object.fromEntries(entries) as Record<AccountRequestStatus, number>,
        );
      })
      .catch(() => {
        if (active) {
          setCounts(initialCounts);
        }
      })
      .finally(() => {
        if (active) {
          setCountsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  function selectStatus(status: AccountRequestStatus): void {
    if (status === selectedStatus) {
      return;
    }

    setSelectedStatus(status);

    setPagination((current) => ({
      ...current,
      page: 1,
    }));

    setError("");
    setLoading(true);
  }

  function changePage(page: number): void {
    if (
      page < 1 ||
      (pagination.totalPages > 0 && page > pagination.totalPages)
    ) {
      return;
    }

    setPagination((current) => ({
      ...current,
      page,
    }));

    setLoading(true);
    setError("");
  }

  function refreshRequests(): void {
    setLoading(true);
    setCountsLoading(true);
    setError("");

    setRefreshKey((current) => current + 1);
  }

  async function handleLogout(): Promise<void> {
    setLoggingOut(true);

    try {
      await logout();

      navigate("/login", {
        replace: true,
      });
    } finally {
      setLoggingOut(false);
    }
  }
// Super Admin can open the organization-wide directory from the header.
  return (
    <main className="admin-dashboard-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <div className="admin-logo">
            <img src="/nt-logo.png" alt="Nepal Telecom" />
          </div>

          <div>
            <strong>NT Message</strong>

            <span>Super Admin Portal</span>
          </div>
        </div>

        <div className="admin-account">
          <div>
            <span>Signed in as</span>

            <strong>{account?.username ?? "Super Admin"}</strong>
          </div>

          <div className="admin-header-actions">
<ManagementPositionsButton />

<DirectoryButton />
            <button

            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            >
            {loggingOut
            ? "Signing out..."
            : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <section className="admin-dashboard-content">
        <nav
          className="admin-tabs"
          aria-label="Super Admin sections"
        >
        <button
          type="button"
          className={
            view === "requests" ? "active": ""
          }
          onClick={() =>
            setView("requests")
          }
        >
          <span>01</span>
          Account Requests
        </button>

        <button
          type="button"
          className={
            view === "organization"
            ? "active"
            : ""
          }
          onClick={() => {
            setSelectedRequestId(null);

            setView(
              "organization",
            );
          }}
        >
          <span>02</span>

          Organization Management
        </button>
        </nav>
        {view === "requests" && (
          <div className="admin-view">

        <div className="admin-page-heading">
          <div>
            <span className="admin-eyebrow">Account governance</span>

            <h1>Account Requests</h1>

            <p>
              Review employee and management account requests submitted across
              Nepal Telecom.
            </p>
          </div>

          <button
            className="admin-refresh-button"
            type="button"
            onClick={refreshRequests}
            disabled={loading || countsLoading}
          >
            {loading ? "Refreshing..." : "Refresh requests"}
          </button>
        </div>

        <section
          className="admin-summary-grid"
          aria-label="Account request summary"
        >
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.status}
              type="button"
              className={
                selectedStatus === option.status
                  ? "admin-summary-card active"
                  : "admin-summary-card"
              }
              onClick={() => selectStatus(option.status)}
            >
              <span>{option.label}</span>

              <strong>{countsLoading ? "—" : counts[option.status]}</strong>

              <small>{option.description}</small>
            </button>
          ))}
        </section>

        <section className="admin-request-panel">
          <header className="admin-request-panel-header">
            <div>
              <h2>{selectedOption.label} requests</h2>

              <p>{selectedOption.description}</p>
            </div>

            <div className="admin-request-total">
              <span>Total records</span>

              <strong>{pagination.total}</strong>
            </div>
          </header>

          <nav
            className="admin-status-filters"
            aria-label="Request status filters"
          >
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.status}
                type="button"
                className={selectedStatus === option.status ? "active" : ""}
                onClick={() => selectStatus(option.status)}
              >
                {option.label}

                <span>{counts[option.status]}</span>
              </button>
            ))}
          </nav>

          {!accessToken && (
            <div className="admin-request-error" role="alert">
              Your secure session is not available. Sign in again.
            </div>
          )}

          {error && (
            <div className="admin-request-error" role="alert">
              <span>{error}</span>

              <button type="button" onClick={refreshRequests}>
                Try again
              </button>
            </div>
          )}

          {loading && (
            <div className="admin-request-loading">
              <div className="spinner" />

              <p>Loading account requests...</p>
            </div>
          )}

          {!loading && !error && requests.length === 0 && (
            <div className="admin-request-empty">
              <div aria-hidden="true">✓</div>

              <h3>No {selectedOption.label} requests</h3>

              <p>There are currently no account requests in this status.</p>
            </div>
          )}

          {!loading && !error && requests.length > 0 && (
            <div className="admin-table-scroll">
              <table className="admin-request-table">
                <thead>
                  <tr>
                    <th>Employee</th>

                    <th>Requested role</th>

                    <th>Organization</th>

                    <th>Requested by</th>

                    <th>Submitted</th>

                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {requests.map((request) => (
                    <tr
                      key={request.id}
                      className="admin-request-row"
                      role="button"
                      tabIndex={0}
                      aria-label={`View request for ${request.empName}`}
                      onClick={() => setSelectedRequestId(request.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();

                          setSelectedRequestId(request.id);
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

                        <span>Revision {request.revisionNumber}</span>
                      </td>

                      <td>
                        <strong>
                          {request.department?.name ?? "No department"}
                        </strong>

                        <span>{request.division?.name ?? "No division"}</span>
                      </td>

                      <td>
                        <strong>{getRequesterName(request)}</strong>

                        <span>{formatRole(request.requestedBy.role)}</span>
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
                        <span
                          className={`admin-status-badge ${getStatusClass(
                            request.status,
                          )}`}
                        >
                          {formatStatus(request.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && pagination.totalPages > 1 && (
            <footer className="admin-pagination">
              <button
                type="button"
                onClick={() => changePage(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                Previous
              </button>

              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                type="button"
                onClick={() => changePage(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next
              </button>
            </footer>
          )}
        </section>
       </div>
     )}
     {view === "organization" &&
     accessToken && (
      <AdminOrganizationPanel accessToken={ accessToken } />
     )}

      </section>
      {selectedRequestId && accessToken && (
        <AdminRequestDetailPanel
          key={selectedRequestId}
          accessToken={accessToken}
          requestId={selectedRequestId}
          onRequestUpdated={refreshRequests}
          onClose={() => setSelectedRequestId(null)}
        />
      )}
</main>
  );
}
