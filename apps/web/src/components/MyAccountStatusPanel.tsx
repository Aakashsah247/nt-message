import { useEffect, useMemo, useState } from "react";

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

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Your account status could not be loaded.";
}

function buildTimeline(
  response: OwnAccountStatusResponse,
): TimelineStep[] {
  const requestStatus = response.accountRequest?.status;
  const effectiveStatus = response.account.employee?.isActivated
    ? "ACTIVATED"
    : requestStatus;

  if (effectiveStatus === "DRAFT") {
    return [
      {
        key: "DRAFT",
        label: "Draft prepared",
        complete: false,
        current: true,
      },
      ...STATUS_ORDER.map((status) => ({
        key: status,
        label: formatLabel(status),
        complete: false,
        current: false,
      })),
    ];
  }

  if (effectiveStatus === "REJECTED") {
    return [
      {
        key: "PENDING_APPROVAL",
        label: "Pending Approval",
        complete: true,
        current: false,
      },
      {
        key: "REJECTED",
        label: "Rejected",
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
    label: formatLabel(status),
    complete: effectiveStatus === "ACTIVATED" || index < activeIndex,
    current: index === activeIndex,
  }));
}

export function MyAccountStatusPanel({
  accessToken,
  compact = false,
}: MyAccountStatusPanelProps) {
  const [response, setResponse] = useState<OwnAccountStatusResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      setError("Your secure session is unavailable. Sign in again.");
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
          setError(getErrorMessage(requestError));
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
  }, [accessToken, refreshKey]);

  const timeline = useMemo(
    () => (response ? buildTimeline(response) : []),
    [response],
  );

  if (loading) {
    return (
      <section className="my-account-status my-account-status--state" aria-busy="true">
        <div className="spinner" />
        <div>
          <strong>Loading your account status</strong>
          <p>Checking the protected account and activation record...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="my-account-status my-account-status--state" role="alert">
        <div>
          <strong>Account status unavailable</strong>
          <p>{error}</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
          Try again
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
    ? "Disabled"
    : employee?.isActivated
      ? "Activated"
      : accountRequest
        ? formatLabel(accountRequest.status)
        : "Account created";
  const statusClass = statusLabel.toLowerCase().replaceAll(" ", "-");

  return (
    <article
      className={compact
        ? "my-account-status my-account-status--compact"
        : "my-account-status"}
    >
      <header className="my-account-status__header">
        <div>
          <span>Personal account record</span>
          <h2>My Account Status</h2>
          <p>
            This section contains only your own identity, activation and request
            lifecycle information.
          </p>
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
          <span>{employee?.empId ?? "Administrative account"}</span>
          <h3>{employee?.empName ?? account.username ?? "NT Message account"}</h3>
          <p>{employee?.officialEmail ?? account.username ?? "No login identifier"}</p>
        </div>
        <dl>
          <div>
            <dt>Role</dt>
            <dd>{formatLabel(account.role)}</dd>
          </div>
          <div>
            <dt>Designation</dt>
            <dd>{employee?.designation ?? "Not assigned"}</dd>
          </div>
        </dl>
      </section>

      <section className="my-account-status__facts" aria-label="Own account details">
        <div>
          <span>Division</span>
          <strong>{employee?.division?.name ?? "Not assigned"}</strong>
          <small>{employee?.division?.code ?? "—"}</small>
        </div>
        <div>
          <span>Department</span>
          <strong>{employee?.departmentUnit?.name ?? "Not assigned"}</strong>
          <small>{employee?.departmentUnit?.code ?? "—"}</small>
        </div>
        <div>
          <span>Employment</span>
          <strong>{formatLabel(employee?.employmentStatus ?? "ACTIVE")}</strong>
          <small>{formatLabel(employee?.status ?? "ACTIVE")}</small>
        </div>
        <div>
          <span>Last successful login</span>
          <strong>{formatDate(account.lastLoginAt)}</strong>
          <small>Secure session activity</small>
        </div>
      </section>

      {accountRequest ? (
        <>
          <section className="my-account-status__request-summary">
            <div>
              <span>Requested by</span>
              <strong>
                {accountRequest.requestedBy.employee?.empName ??
                  formatLabel(accountRequest.requestedBy.role)}
              </strong>
              <small>
                {accountRequest.requestedBy.employee?.empId ?? "Authorized requester"}
              </small>
            </div>
            <div>
              <span>Requested role</span>
              <strong>{formatLabel(accountRequest.requestedRole)}</strong>
              <small>Revision {accountRequest.revisionNumber}</small>
            </div>
            <div>
              <span>Submitted</span>
              <strong>{formatDate(accountRequest.submittedAt)}</strong>
              <small>Reviewed {formatDate(accountRequest.reviewedAt)}</small>
            </div>
          </section>

          <ol className="my-account-status__timeline" aria-label="Account request timeline">
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
              <strong>Request note</strong>
              <p>{accountRequest.rejectionReason}</p>
            </div>
          )}
        </>
      ) : (
        <div className="my-account-status__notice">
          <strong>No linked request history</strong>
          <p>
            This account was not created through the standard employee request
            workflow, or its historical request is unavailable.
          </p>
        </div>
      )}
    </article>
  );
}
