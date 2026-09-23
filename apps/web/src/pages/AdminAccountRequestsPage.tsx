import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { AdminRequestDetailPanel } from "../components/AdminRequestDetailPanel";
import { ProtectedAvatar } from "../components/ProtectedAvatar";
import { ManagementIcon } from "../components/layout/ManagementIcon";
import { useAuth } from "../context/AuthContext";
import {
  getAdminAccountRequestSummary,
  listAdminAccountRequests,
} from "../services/account-request.service";
import { getOrganizationOffices } from "../services/organization-v3.service";
import type {
  AccountRequestStatus,
  AdminAccountRequestListItem,
  AdminAccountRequestListQuery,
  AdminAccountRequestSummaryResponse,
} from "../types/account-request";
import type { OrganizationOfficeSummary } from "../types/organization-v3";

const PAGE_SIZE = 20;
const STATUS_OPTIONS: Array<{ value: AccountRequestStatus; labelKey: string }> = [
  { value: "PENDING_APPROVAL", labelKey: "common.pending" },
  { value: "APPROVED", labelKey: "common.approved" },
  { value: "REJECTED", labelKey: "common.rejected" },
  { value: "ACTIVATION_PENDING", labelKey: "common.activating" },
  { value: "ACTIVATED", labelKey: "common.activated" },
];
const VALID_STATUSES = new Set<AccountRequestStatus>(
  STATUS_OPTIONS.map((option) => option.value),
);

function parseStatus(value: string | null): AccountRequestStatus {
  return value && VALID_STATUSES.has(value as AccountRequestStatus)
    ? (value as AccountRequestStatus)
    : "PENDING_APPROVAL";
}

function fallbackFormatValue(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatValue(value: string, t: TFunction<"requests">): string {
  return t(`values.${value}`, {
    ns: "requests",
    defaultValue: fallbackFormatValue(value),
  });
}

function formatDate(
  value: string | null,
  locale: string,
  t: TFunction<"requests">,
): string {
  if (!value) {
    return t("common.notReviewed", { ns: "requests" });
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? t("common.notAvailable", { ns: "requests" })
    : new Intl.DateTimeFormat(locale === "ne" ? "ne-NP-u-ca-gregory" : "en-GB", {
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

function getActivationEmailTimestamp(
  request: AdminAccountRequestListItem,
): string | null {
  return request.activationEmailSentAt ?? request.activationEmailLastAttemptAt;
}

function getRequesterName(
  request: AdminAccountRequestListItem,
  t: TFunction<"requests">,
): string {
  return (
    request.requestedBy.employee?.empName ??
    request.requestedBy.username ??
    t("common.unknownRequester", { ns: "requests" })
  );
}


function RequestEmployeeAvatar({
  request,
}: {
  request: AdminAccountRequestListItem;
}) {
  const { t } = useTranslation("requests");
  if (request.status !== "ACTIVATED") {
    return (
      <span
        className="admin-account-requests-page__request-avatar"
        aria-hidden="true"
      >
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
      ariaLabel={t("adminList.profileAria", { name: request.empName })}
    />
  );
}

export function AdminAccountRequestsPage() {
  const { t, i18n } = useTranslation("requests");
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get("status"));
  const selectedRequestId = searchParams.get("request");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [offices, setOffices] = useState<OrganizationOfficeSummary[]>([]);
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState<AdminAccountRequestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] =
    useState<AdminAccountRequestSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
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
    queueMicrotask(() => {
      setPage(1);
    });
  }, [status]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getOrganizationOffices(accessToken)
      .then((response) => {
        if (active) setOffices(response.data.filter((office) => office.isActive));
      })
      .catch(() => {
        if (active) setOffices([]);
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
    queueMicrotask(() => {
      if (active) {
        setSummaryLoading(true);
      }
    });

    getAdminAccountRequestSummary(accessToken, officeId || undefined)
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
  }, [accessToken, officeId, refreshKey]);

  const query = useMemo<AdminAccountRequestListQuery>(
    () => ({
      status,
      page,
      limit: PAGE_SIZE,
      officeId: officeId || undefined,
      search: debouncedSearch || undefined,
    }),
    [debouncedSearch, officeId, page, status],
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (active) {
        setLoading(true);
      }
    });

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
            : t("adminList.loadError"),
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
  }, [accessToken, query, refreshKey, t]);

  const activeFilterCount = [officeId, searchInput.trim()].filter(Boolean).length;

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
    setOfficeId("");
    setSearchInput("");
    setDebouncedSearch("");
    setPage(1);
  }

  function refreshRequests(): void {
    setRefreshKey((current) => current + 1);
  }

  return (
    <main className="management-page admin-account-requests-page">
      <header className="admin-account-requests-page__header">
        <div className="admin-account-requests-page__header-copy">
          <span>{t("adminList.eyebrow")}</span>
          <h1>{t("adminList.title")}</h1>
          <p>{t("adminList.description")}</p>
        </div>

        <div className="admin-account-requests-page__refresh">
          <span>
            {lastRefreshedAt
              ? t("adminList.updated", { date: formatDate(lastRefreshedAt, i18n.language, t) })
              : t("adminList.loadingQueue")}
          </span>
          <button type="button" onClick={refreshRequests} disabled={loading}>
            {loading ? t("adminList.refreshing") : t("adminList.refresh")}
          </button>
        </div>
      </header>

      <nav
        className="admin-account-requests-page__statuses"
        aria-label={t("adminList.statusAria")}
      >
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={status === option.value ? "active" : ""}
            aria-pressed={status === option.value}
            onClick={() => changeStatus(option.value)}
          >
            <span>{t(option.labelKey)}</span>
            <strong>
              {summaryLoading && !summary
                ? "—"
                : (summary?.counts[option.value] ?? 0)}
            </strong>
          </button>
        ))}
      </nav>

      <section
        className="admin-account-requests-page__filters"
        aria-label={t("adminList.filtersAria")}
      >
        <div className="admin-account-requests-page__filter-heading">
          <div>
            <ManagementIcon name="requests" />
            <span>
              <strong>{t("adminList.filtersTitle")}</strong>
              <small>
                {t("adminList.filterDescription", { status: formatValue(status, t).toLowerCase() })}
              </small>
            </span>
          </div>
          <span className="admin-account-requests-page__filter-count">
            {t("adminList.activeFilters", { count: activeFilterCount })}
          </span>
        </div>

        <label>
          <span>{t("adminList.officeFilter")}</span>
          <select
            value={officeId}
            onChange={(event) => {
              setOfficeId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("adminList.allOffices")}</option>
            {offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-account-requests-page__search">
          <span>{t("adminList.employeeOrRequester")}</span>
          <input
            type="search"
            value={searchInput}
            placeholder={t("adminList.searchPlaceholder")}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>



        <button
          type="button"
          className="admin-account-requests-page__clear"
          onClick={resetFilters}
          disabled={activeFilterCount === 0}
        >
          {t("adminList.clearFilters")}
        </button>

      </section>

      <section className="admin-account-requests-page__records">
        <header>
          <div>
            <span>{t("adminList.queue", { status: formatValue(status, t) })}</span>
            <h2>
              {t("adminList.requestCount", { count: total })}
            </h2>
          </div>
          {total > 0 ? (
            <small>
              {t("adminList.showing", { first: firstResult, last: lastResult, total })}
            </small>
          ) : (
            <small>{t("adminList.requestsInView", { count: 0 })}</small>
          )}
        </header>

        {!accessToken && (
          <div className="admin-request-error">
            {t("adminList.sessionUnavailable")}
          </div>
        )}
        {error && <div className="admin-request-error">{error}</div>}
        {loading && (
          <div className="admin-account-requests-page__state">
            <span
              className="admin-account-requests-page__loader"
              aria-hidden="true"
            />
            {t("adminList.loadingRequests")}
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="admin-account-requests-page__empty">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>
                {activeFilterCount > 0
                  ? t("adminList.emptyFilteredTitle")
                  : t("adminList.queueClear", { status: formatValue(status, t) })}
              </strong>
              <p>
                {activeFilterCount > 0
                  ? t("adminList.emptyFilteredDescription")
                  : t("adminList.emptyStatusDescription")}
              </p>
            </div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={resetFilters}>
                {t("adminList.resetFilters")}
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
                    <th>{t("adminList.tableEmployee")}</th>
                    <th>{t("common.organization")}</th>
                    <th>{t("common.requestedBy")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("common.activationEmail")}</th>
                    <th>{t("common.submitted")}</th>
                    <th aria-label={t("common.actions")} />
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
                        <strong>
                          {request.intendedOrgUnit?.name ?? t("common.notAssigned")}
                        </strong>
                        <span>
                          {request.requestedOrganizationRole === "ORG_UNIT_HEAD"
                            ? request.intendedOrgUnit?.orgUnitType?.name
                              ? `${request.intendedOrgUnit.orgUnitType.name} Head`
                              : t("form.v3.unitHeadRole")
                            : t("form.v3.employeeRole")}
                          {" · "}
                          {request.office?.name ?? t("common.notAssigned")}
                        </span>
                      </td>
                      <td>
                        <strong>{getRequesterName(request, t)}</strong>
                      </td>
                      <td>
                        <span
                          className={`admin-status-badge ${getStatusClass(request.status)}`}
                        >
                          {formatValue(request.status, t)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`activation-delivery-status activation-delivery-status--${request.activationEmailStatus.toLowerCase()}`}
                        >
                          {formatValue(request.activationEmailStatus, t)}
                        </span>
                        <small>
                          {getActivationEmailTimestamp(request)
                            ? request.activationEmailStatus === "SENT"
                              ? t("adminList.sentDate", {
                                  date: formatDate(
                                    getActivationEmailTimestamp(request),
                                    i18n.language,
                                    t,
                                  ),
                                })
                              : t("adminList.attemptedDate", {
                                  date: formatDate(
                                    getActivationEmailTimestamp(request),
                                    i18n.language,
                                    t,
                                  ),
                                })
                            : t("common.notAttempted")}
                        </small>
                      </td>
                      <td>
                        <strong>{formatDate(request.submittedAt, i18n.language, t)}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openRequest(request.id)}
                        >
                          {t("adminList.viewDetails")} <span aria-hidden="true">→</span>
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
                      {formatValue(request.status, t)}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>{t("form.v3.organizationRole")}</dt>
                      <dd>{request.requestedOrganizationRole === "ORG_UNIT_HEAD" ? (request.intendedOrgUnit?.orgUnitType?.name ? `${request.intendedOrgUnit.orgUnitType.name} Head` : t("form.v3.unitHeadRole")) : t("form.v3.employeeRole")}</dd>
                    </div>
                    <div>
                      <dt>{t("common.organization")}</dt>
                      <dd>
                        {request.intendedOrgUnit?.name ??
                          request.office?.name ??
                          t("common.notAssigned")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("common.requestedBy")}</dt>
                      <dd>{getRequesterName(request, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("common.activationEmail")}</dt>
                      <dd>
                        <span
                          className={`activation-delivery-status activation-delivery-status--${request.activationEmailStatus.toLowerCase()}`}
                        >
                          {formatValue(request.activationEmailStatus, t)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>{t("common.submitted")}</dt>
                      <dd>{formatDate(request.submittedAt, i18n.language, t)}</dd>
                    </div>
                  </dl>
                  <button type="button" onClick={() => openRequest(request.id)}>
                    {t("adminList.viewRequestDetails")} <span aria-hidden="true">→</span>
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
              {t("adminList.previous")}
            </button>
            <span>
              {t("adminList.page", { page, total: totalPages })}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              {t("adminList.next")}
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
