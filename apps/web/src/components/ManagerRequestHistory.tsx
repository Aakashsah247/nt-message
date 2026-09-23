import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { ManagerRequestDetailPanel } from "./ManagerRequestDetailPanel";
import {
  listMyAccountRequests,
  type AccountRequestListFilters,
} from "../services/account-request.service";

import type {
  AccountRequestStatus,
  ManagerRequestContextResponse,
  MyAccountRequestListItem,
} from "../types/account-request";

interface ManagerRequestHistoryProps {
  accessToken: string;
  requestContext: ManagerRequestContextResponse;
  refreshKey: number;
}

interface StatusFilter {
  labelKey: string;
  value: AccountRequestStatus | undefined;
}

const statusFilters: StatusFilter[] = [
  { labelKey: "common.all", value: undefined },
  { labelKey: "common.pending", value: "PENDING_APPROVAL" },
  { labelKey: "common.approved", value: "APPROVED" },
  { labelKey: "common.rejected", value: "REJECTED" },
  { labelKey: "common.activationPending", value: "ACTIVATION_PENDING" },
  { labelKey: "common.activated", value: "ACTIVATED" },
];

const emptyFilters: AccountRequestListFilters = {
  search: "",
};

function getErrorMessage(error: unknown, t: TFunction<"requests">): string {
  return error instanceof Error
    ? error.message
    : t("history.loadError", { ns: "requests" });
}

function fallbackFormatStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatus(value: string, t: TFunction<"requests">): string {
  return t(`values.${value}`, {
    ns: "requests",
    defaultValue: fallbackFormatStatus(value),
  });
}

function formatDate(
  value: string | null,
  locale: string,
  t: TFunction<"requests">,
): string {
  if (!value) {
    return t("common.notAvailable", { ns: "requests" });
  }

  return new Intl.DateTimeFormat(
    locale === "ne" ? "ne-NP-u-ca-gregory" : "en-GB",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(value));
}

function getStatusClass(status: string): string {
  return status.toLowerCase().replaceAll("_", "-");
}

function getOrganizationRoleLabel(
  request: MyAccountRequestListItem,
  t: TFunction<"requests">,
): string {
  if (request.requestedOrganizationRole !== "ORG_UNIT_HEAD") {
    return t("form.v3.employeeRole");
  }

  const unitType = request.intendedOrgUnit?.orgUnitType?.name;
  return unitType ? `${unitType} Head` : t("form.v3.unitHeadRole");
}

export function ManagerRequestHistory({
  accessToken,
  requestContext,
  refreshKey,
}: ManagerRequestHistoryProps) {
  const { t, i18n } = useTranslation("requests");
  const [requests, setRequests] = useState<MyAccountRequestListItem[]>([]);
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

  const copy = useMemo(
    () => ({
      eyebrow: t("history.trackingEyebrow"),
      title: t("history.v3Title"),
      description: t("history.v3Description"),
    }),
    [t],
  );

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (!active) {
        return;
      }

      setLoading(true);
      setError("");
    });

    const requestPromise = listMyAccountRequests(
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
        setError(getErrorMessage(requestError, t));
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
    localRefreshKey,
    page,
    refreshKey,
    statusFilter,
    t,
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
    setError("");
    setPage(1);
    setAppliedFilters({ search: draftFilters.search?.trim() ?? "" });
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

  const activeFilterLabel = t(
    statusFilters.find((filter) => filter.value === statusFilter)?.labelKey ??
      "common.all",
  );
  const hasAdvancedFilters = Boolean(appliedFilters.search);
  const hasDraftFilters = Boolean(draftFilters.search);

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
            <small>{t("common.showingStatus")}</small>
            <span>{activeFilterLabel}</span>
            <strong>{pagination.total}</strong>
            <p>{t("common.myRequests")}</p>
          </div>
        </header>

        <nav
          className="manager-request-history__filters"
          aria-label={t("history.statusFiltersAria")}
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
                {t(filter.labelKey)}
              </button>
            );
          })}
        </nav>

        <form
          className="manager-request-history__advanced"
          onSubmit={applyFilters}
        >
          <label className="manager-request-history__search">
            <span>{t("common.searchRecords")}</span>
            <input
              type="search"
              value={draftFilters.search ?? ""}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder={t("history.searchOwnPlaceholder")}
            />
          </label>

          <div className="manager-request-history__advanced-actions">
            <button type="submit">{t("common.applyFilters")}</button>
            <button
              type="button"
              onClick={clearFilters}
              disabled={
                !hasDraftFilters && !hasAdvancedFilters && !statusFilter
              }
            >
              {t("history.clear")}
            </button>
          </div>
        </form>

        {error && (
          <div
            className="manager-request-history__state manager-request-history__state--error"
            role="alert"
          >
            <div>
              <strong>{t("history.unavailable")}</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={retryLoading}>
              {t("common.tryAgain")}
            </button>
          </div>
        )}

        {loading && requests.length === 0 && (
          <div className="manager-request-history__state">
            <div className="spinner" />
            <p>{t("history.loading")}</p>
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="manager-request-history__empty">
            <span aria-hidden="true">≡</span>
            <h3>{t("history.empty")}</h3>
            <p>
              {t("history.emptyOwn")}
            </p>
            {hasAdvancedFilters && (
              <button type="button" onClick={clearFilters}>
                {t("history.clearFilters")}
              </button>
            )}
          </div>
        )}

        {requests.length > 0 && (
          <div className="manager-request-history__table-wrap">
            <table className="manager-request-history__table">
              <thead>
                <tr>
                  <th>{t("common.employee")}</th>
                  <th>{t("form.v3.organizationRole")}</th>
                  <th>{t("common.orgUnit")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.submitted")}</th>
                  <th>{t("common.action")}</th>
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
                    <td data-label={t("common.employee")}>
                      <strong>{request.empName}</strong>
                      <span>{request.empId}</span>
                      <small>{request.officialEmail}</small>
                    </td>

                    <td data-label={t("form.v3.organizationRole")}>
                      <strong>{getOrganizationRoleLabel(request, t)}</strong>
                    </td>

                    <td data-label={t("common.orgUnit")}>
                      <strong>
                        {request.intendedOrgUnit?.name ?? t("common.notAssigned")}
                      </strong>
                      <small>{request.office?.name ?? t("common.notAssigned")}</small>
                    </td>

                    <td data-label={t("common.status")}>
                      <span
                        className={`manager-request-status manager-request-status--${getStatusClass(
                          request.status,
                        )}`}
                      >
                        {formatStatus(request.status, t)}
                      </span>
                      {request.rejectionReason && (
                        <small className="manager-request-history__reason">
                          {request.rejectionReason}
                        </small>
                      )}
                    </td>

                    <td data-label={t("common.submitted")}>
                      <strong>{formatDate(request.submittedAt, i18n.language, t)}</strong>
                    </td>

                    <td data-label={t("common.action")}>
                      <button
                        type="button"
                        className="manager-request-history__view"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRequestId(request.id);
                        }}
                      >
                        {t("history.viewDetails")}
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
              {t("history.previous")}
            </button>

            <span>
              {t("history.page", { page: pagination.page, total: pagination.totalPages })}
            </span>

            <button
              type="button"
              onClick={() => changePage(page + 1)}
              disabled={loading || page >= pagination.totalPages}
            >
              {t("history.next")}
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
          onCancelled={handleCancelled}
          onResubmitted={handleResubmitted}
        />
      )}
    </>
  );
}
