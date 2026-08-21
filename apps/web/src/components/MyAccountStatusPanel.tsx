import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { getOwnAccountStatus } from "../services/account-request.service";

import type {
  AccountRequestStatus,
  OwnAccountStatusResponse,
} from "../types/account-request";

interface MyAccountStatusPanelProps {
  accessToken: string;
  compact?: boolean;
}

interface TimelineStep {
  key: string;
  label: string;
  complete: boolean;
  current: boolean;
}

const STATUS_ORDER: AccountRequestStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVATION_PENDING",
  "ACTIVATED",
];

function fallbackFormatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLabel(value: string, t: TFunction<"requests">): string {
  return t(`values.${value}`, {
    ns: "requests",
    defaultValue: fallbackFormatLabel(value),
  });
}

function formatDate(
  value: string | null,
  locale: string,
  t: TFunction<"requests">,
): string {
  if (!value) {
    return t("myStatus.notRecorded", { ns: "requests" });
  }

  return new Intl.DateTimeFormat(
    locale === "ne" ? "ne-NP-u-ca-gregory" : "en-GB",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(value));
}

function getErrorMessage(error: unknown, t: TFunction<"requests">): string {
  return error instanceof Error
    ? error.message
    : t("myStatus.loadError", { ns: "requests" });
}

function buildTimeline(
  response: OwnAccountStatusResponse,
  t: TFunction<"requests">,
): TimelineStep[] {
  const requestStatus = response.accountRequest?.status;
  const effectiveStatus = response.account.employee?.isActivated
    ? "ACTIVATED"
    : requestStatus;

  if (effectiveStatus === "DRAFT") {
    return [
      {
        key: "DRAFT",
        label: t("myStatus.draftPrepared", { ns: "requests" }),
        complete: false,
        current: true,
      },
      ...STATUS_ORDER.map((status) => ({
        key: status,
        label: formatLabel(status, t),
        complete: false,
        current: false,
      })),
    ];
  }

  if (effectiveStatus === "REJECTED") {
    return [
      {
        key: "PENDING_APPROVAL",
        label: t("myStatus.pendingApproval", { ns: "requests" }),
        complete: true,
        current: false,
      },
      {
        key: "REJECTED",
        label: t("common.rejected", { ns: "requests" }),
        complete: false,
        current: true,
      },
    ];
  }

  const activeIndex = effectiveStatus
    ? STATUS_ORDER.indexOf(effectiveStatus)
    : -1;

  return STATUS_ORDER.map((status, index) => ({
    key: status,
    label: formatLabel(status, t),
    complete: effectiveStatus === "ACTIVATED" || index < activeIndex,
    current: index === activeIndex,
  }));
}

export function MyAccountStatusPanel({
  accessToken,
  compact = false,
}: MyAccountStatusPanelProps) {
  const { t, i18n } = useTranslation("requests");
  const [response, setResponse] = useState<OwnAccountStatusResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      setError(t("myStatus.sessionUnavailable"));
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    getOwnAccountStatus(accessToken)
      .then((result) => {
        if (active) {
          setResponse(result);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setResponse(null);
          setError(getErrorMessage(requestError, t));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey, t]);

  const timeline = useMemo(
    () => (response ? buildTimeline(response, t) : []),
    [response, t],
  );

  if (loading) {
    return (
      <section className="my-account-status my-account-status--state" aria-busy="true">
        <div className="spinner" />
        <div>
          <strong>{t("myStatus.loading")}</strong>
          <p>{t("myStatus.loadingDescription")}</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="my-account-status my-account-status--state" role="alert">
        <div>
          <strong>{t("myStatus.unavailable")}</strong>
          <p>{error}</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
          {t("common.tryAgain")}
        </button>
      </section>
    );
  }

  if (!response) {
    return null;
  }

  const { account, accountRequest } = response;
  const employee = account.employee;
  const statusLabel = !account.isEnabled
    ? t("myStatus.disabled")
    : employee?.isActivated
      ? t("common.activated")
      : accountRequest
        ? formatLabel(accountRequest.status, t)
        : t("myStatus.accountCreated");
  const statusClass = statusLabel.toLowerCase().replaceAll(" ", "-");

  return (
    <article
      className={compact
        ? "my-account-status my-account-status--compact"
        : "my-account-status"}
    >
      <header className="my-account-status__header">
        <div>
          <span>{t("myStatus.eyebrow")}</span>
          <h2>{t("myStatus.title")}</h2>
          <p>{t("myStatus.description")}</p>
        </div>

        <div className={`my-account-status__badge my-account-status__badge--${statusClass}`}>
          <span aria-hidden="true" />
          {statusLabel}
        </div>
      </header>

      <section className="my-account-status__identity">
        <div className="my-account-status__avatar" aria-hidden="true">
          {(employee?.empName ?? account.username ?? "NT").charAt(0).toUpperCase()}
        </div>
        <div>
          <span>{employee?.empId ?? t("myStatus.administrativeAccount")}</span>
          <h3>{employee?.empName ?? account.username ?? t("myStatus.ntAccount")}</h3>
          <p>{employee?.officialEmail ?? account.username ?? t("myStatus.noIdentifier")}</p>
        </div>
        <dl>
          <div>
            <dt>{t("common.role")}</dt>
            <dd>{formatLabel(account.role, t)}</dd>
          </div>
          <div>
            <dt>{t("common.designation")}</dt>
            <dd>{employee?.designation ?? t("common.notAssigned")}</dd>
          </div>
        </dl>
      </section>

      <section className="my-account-status__facts" aria-label={t("myStatus.factsAria")}>
        <div>
          <span>{t("common.division")}</span>
          <strong>{employee?.division?.name ?? t("common.notAssigned")}</strong>
          <small>{employee?.division?.code ?? "—"}</small>
        </div>
        <div>
          <span>{t("common.department")}</span>
          <strong>{employee?.departmentUnit?.name ?? t("common.notAssigned")}</strong>
          <small>{employee?.departmentUnit?.code ?? "—"}</small>
        </div>
        <div>
          <span>{t("myStatus.employment")}</span>
          <strong>{formatLabel(employee?.employmentStatus ?? "ACTIVE", t)}</strong>
          <small>{formatLabel(employee?.status ?? "ACTIVE", t)}</small>
        </div>
        <div>
          <span>{t("myStatus.lastLogin")}</span>
          <strong>{formatDate(account.lastLoginAt, i18n.language, t)}</strong>
          <small>{t("myStatus.secureActivity")}</small>
        </div>
      </section>

      {accountRequest ? (
        <>
          <section className="my-account-status__request-summary">
            <div>
              <span>{t("common.requestedBy")}</span>
              <strong>
                {accountRequest.requestedBy.employee?.empName ??
                  formatLabel(accountRequest.requestedBy.role, t)}
              </strong>
              <small>
                {accountRequest.requestedBy.employee?.empId ?? t("common.authorizedRequester")}
              </small>
            </div>
            <div>
              <span>{t("common.requestedRole")}</span>
              <strong>{formatLabel(accountRequest.requestedRole, t)}</strong>
              <small>{t("myStatus.revision", { number: accountRequest.revisionNumber })}</small>
            </div>
            <div>
              <span>{t("common.submitted")}</span>
              <strong>{formatDate(accountRequest.submittedAt, i18n.language, t)}</strong>
              <small>{t("myStatus.reviewedDate", { date: formatDate(accountRequest.reviewedAt, i18n.language, t) })}</small>
            </div>
          </section>

          <ol className="my-account-status__timeline" aria-label={t("myStatus.timelineAria")}>
            {timeline.map((step) => (
              <li
                key={step.key}
                className={step.current
                  ? "current"
                  : step.complete
                    ? "complete"
                    : ""}
              >
                <span aria-hidden="true">{step.complete ? "✓" : ""}</span>
                <strong>{step.label}</strong>
              </li>
            ))}
          </ol>

          {accountRequest.rejectionReason && (
            <div className="my-account-status__rejection" role="alert">
              <strong>{t("myStatus.requestNote")}</strong>
              <p>{accountRequest.rejectionReason}</p>
            </div>
          )}
        </>
      ) : (
        <div className="my-account-status__notice">
          <strong>{t("myStatus.noHistory")}</strong>
          <p>{t("myStatus.noHistoryDescription")}</p>
        </div>
      )}
    </article>
  );
}
