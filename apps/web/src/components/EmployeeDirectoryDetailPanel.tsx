import { useEffect, useState } from "react";

import type {
  FormEvent,
} from "react";

import {
  endDirectoryEmployeeEmployment,
  getDirectoryEmployee,
  updateDirectoryEmployeeStatus,
} from "../services/directory.service";

import type {
  AccountRole,
} from "../types/auth";

import type {
  DirectoryEmployeeDetailResponse,
  DirectoryEmployeeStatus,
  DirectoryEmploymentStatus,
} from "../types/directory";

interface EmployeeDirectoryDetailPanelProps {
  accessToken: string;
  employeeId: string;
  viewerRole: AccountRole;
  onStatusChanged: () => void;
  onClose: () => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The employee details could not be loaded.";
}

function formatValue(value: string): string {
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

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function getStatusClass(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", "-");
}

export function EmployeeDirectoryDetailPanel({
  accessToken,
  employeeId,
  viewerRole,
  onStatusChanged,
  onClose,
}: EmployeeDirectoryDetailPanelProps) {
  const [response, setResponse] =
    useState<DirectoryEmployeeDetailResponse | null>(null);

  const [error, setError] = useState("");

  const [retryKey, setRetryKey] = useState(0);

  const [
    pendingStatus,
    setPendingStatus,
  ] =
    useState<DirectoryEmployeeStatus | null>(
      null,
    );

  const [
    changingStatus,
    setChangingStatus,
  ] = useState(false);

  const [
    actionError,
    setActionError,
  ] = useState("");

  const [
    actionMessage,
    setActionMessage,
  ] = useState("");

  const [
    pendingEmploymentStatus,
    setPendingEmploymentStatus,
  ] =
    useState<
      Exclude<
        DirectoryEmploymentStatus,
        "ACTIVE"
      > | null
    >(null);

  const [
    employmentReason,
    setEmploymentReason,
  ] = useState("");

  const [
    employmentEffectiveDate,
    setEmploymentEffectiveDate,
  ] = useState("");

  const [
    endingEmployment,
    setEndingEmployment,
  ] = useState(false);

  useEffect(() => {
    let active = true;

    // The backend confirms that the employee is inside the viewer's scope.
    getDirectoryEmployee(
      accessToken,
      employeeId,
    )
      .then((detailResponse) => {
        if (!active) {
          return;
        }

        setResponse(detailResponse);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setResponse(null);
        setError(getErrorMessage(requestError));
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    employeeId,
    retryKey,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [onClose]);

  function retryLoading(): void {
    setResponse(null);
    setError("");

    setRetryKey(
      (current) => current + 1,
    );
  }

  const employee = response?.employee;

  const canManageAccount =
    Boolean(employee) &&
    viewerRole === "SUPER_ADMIN" &&
    employee?.role !== "SUPER_ADMIN";

  const employmentIsActive =
    employee?.employmentStatus ===
    "ACTIVE";

  const canManageStatus =
    canManageAccount &&
    employmentIsActive;

  const canEndEmployment =
    canManageAccount &&
    employmentIsActive;

  function openStatusConfirmation(
    status: DirectoryEmployeeStatus,
  ): void {
    setPendingStatus(status);
    setActionError("");
    setActionMessage("");
  }

  function cancelStatusChange(): void {
    if (changingStatus) {
      return;
    }

    setPendingStatus(null);
    setActionError("");
  }

  async function changeEmployeeStatus():
    Promise<void> {
    if (
      !employee ||
      !pendingStatus ||
      changingStatus
    ) {
      return;
    }

    setChangingStatus(true);
    setActionError("");
    setActionMessage("");

    try {
      await updateDirectoryEmployeeStatus(
        accessToken,
        employee.id,
        pendingStatus,
      );

      setActionMessage(
        pendingStatus === "INACTIVE"
          ? "Account suspended. Login is blocked and all active sessions were revoked."
          : "Account reactivated. The user can sign in again with the existing password.",
      );

      setPendingStatus(null);

      // Reload both the profile and the directory list.
      setRetryKey(
        (current) =>
          current + 1,
      );

      onStatusChanged();
    } catch (
      requestError: unknown
    ) {
      setActionError(
        getErrorMessage(
          requestError,
        ),
      );
    } finally {
      setChangingStatus(false);
    }
  }

  function openEmploymentEnd(
    status: Exclude<
      DirectoryEmploymentStatus,
      "ACTIVE"
    >,
  ): void {
    setPendingEmploymentStatus(
      status,
    );

    setEmploymentReason("");
    setEmploymentEffectiveDate("");
    setActionError("");
    setActionMessage("");
  }

  function cancelEmploymentEnd():
    void {
    if (endingEmployment) {
      return;
    }

    setPendingEmploymentStatus(
      null,
    );

    setEmploymentReason("");
    setEmploymentEffectiveDate("");
    setActionError("");
  }

  async function submitEmploymentEnd(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (
      !employee ||
      !pendingEmploymentStatus ||
      endingEmployment
    ) {
      return;
    }

    const reason =
      employmentReason
        .trim()
        .replace(/\s+/g, " ");

    if (reason.length < 3) {
      setActionError(
        "Enter a reason of at least 3 characters.",
      );

      return;
    }

    setEndingEmployment(true);
    setActionError("");
    setActionMessage("");

    try {
      const result =
        await endDirectoryEmployeeEmployment(
          accessToken,
          employee.id,
          {
            employmentStatus:
              pendingEmploymentStatus,

            reason,

            effectiveAt:
              employmentEffectiveDate
                ? `${employmentEffectiveDate}T00:00:00.000Z`
                : undefined,
          },
        );

      setActionMessage(
        result.message,
      );

      setPendingEmploymentStatus(
        null,
      );

      setEmploymentReason("");
      setEmploymentEffectiveDate("");

      // Reload the profile and directory after access is disabled.
      setRetryKey(
        (current) =>
          current + 1,
      );

      onStatusChanged();
    } catch (
      requestError: unknown
    ) {
      setActionError(
        getErrorMessage(
          requestError,
        ),
      );
    } finally {
      setEndingEmployment(false);
    }
  }

  return (
    <div
      className="directory-detail-backdrop"
      onMouseDown={onClose}
    >
      <aside
        className="directory-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Employee directory details"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header className="directory-detail-topbar">
          <div>
            <span>Employee profile</span>

            <strong>
              Directory details
            </strong>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close employee details"
          >
            ×
          </button>
        </header>

        {!employee && !error && (
          <div className="directory-detail-loading">
            <div className="spinner" />

            <p>
              Loading employee details...
            </p>
          </div>
        )}

        {error && (
          <div
            className="directory-detail-error"
            role="alert"
          >
            <strong>
              Employee details unavailable
            </strong>

            <p>{error}</p>

            <button
              type="button"
              onClick={retryLoading}
            >
              Try again
            </button>
          </div>
        )}

        {employee && (
          <div className="directory-detail-content">
            <section className="directory-detail-profile">
              <div className="directory-detail-avatar">
                {getInitials(
                  employee.empName,
                )}
              </div>

              <div>
                <span>
                  {employee.empId}
                </span>

                <h2>
                  {employee.empName}
                </h2>

                <p>
                  {employee.designation ??
                    "No designation assigned"}
                </p>
              </div>
            </section>

            <section className="directory-detail-badges">
              <span
                className={`directory-badge role-${getStatusClass(
                  employee.role ??
                    "NO_ACCOUNT",
                )}`}
              >
                {employee.role
                  ? formatValue(
                      employee.role,
                    )
                  : "No account"}
              </span>

              <span
                className={`directory-badge ${getStatusClass(
                  employee.accountStatus,
                )}`}
              >
                {formatValue(
                  employee.accountStatus,
                )}
              </span>

              <span
                className={`directory-badge ${getStatusClass(
                  employee.activationStatus,
                )}`}
              >
                {formatValue(
                  employee.activationStatus,
                )}
              </span>

              <span
                className={`directory-badge ${getStatusClass(
                  employee.status,
                )}`}
              >
                {formatValue(
                  employee.status,
                )}
              </span>

              <span
                className={`directory-badge ${getStatusClass(
                  employee.employmentStatus,
                )}`}
              >
                {formatValue(
                  employee.employmentStatus,
                )}
              </span>
            </section>

            <section className="directory-detail-section">
              <h3>
                Organization
              </h3>

              <dl className="directory-detail-list">
                <div>
                  <dt>Division</dt>

                  <dd>
                    {employee.division
                      ?.name ??
                      "Not assigned"}
                  </dd>
                </div>

                <div>
                  <dt>Division code</dt>

                  <dd>
                    {employee.division
                      ?.code ??
                      "Not available"}
                  </dd>
                </div>

                <div>
                  <dt>Department</dt>

                  <dd>
                    {employee.department
                      ?.name ??
                      "Not assigned"}
                  </dd>
                </div>

                <div>
                  <dt>Department code</dt>

                  <dd>
                    {employee.department
                      ?.code ??
                      "Not available"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="directory-detail-section">
              <h3>
                Employment information
              </h3>

              <dl className="directory-detail-list">
                <div>
                  <dt>
                    Employment status
                  </dt>

                  <dd>
                    {formatValue(
                      employee.employmentStatus,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>
                    Employment ended
                  </dt>

                  <dd>
                    {employee.employmentStatus ===
                    "ACTIVE"
                      ? "Still employed"
                      : formatDate(
                          employee.employmentEndedAt,
                        )}
                  </dd>
                </div>

                <div>
                  <dt>
                    End reason
                  </dt>

                  <dd>
                    {employee.employmentEndReason ??
                      "Not applicable"}
                  </dd>
                </div>

                <div>
                  <dt>
                    Archive status
                  </dt>

                  <dd>
                    {employee.archivedAt
                      ? `Archived ${formatDate(
                          employee.archivedAt,
                        )}`
                      : "Not archived"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="directory-detail-section">
              <h3>
                Contact information
              </h3>

              {employee.officialEmail ||
              employee.phoneNumber ? (
                <dl className="directory-detail-list">
                  <div>
                    <dt>
                      Official email
                    </dt>

                    <dd>
                      {employee.officialEmail ??
                        "Hidden"}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Phone number
                    </dt>

                    <dd>
                      {employee.phoneNumber ??
                        "Hidden"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="directory-contact-limited">
                  <strong>
                    Limited contact access
                  </strong>

                  <p>
                    Contact information is hidden for your current role.
                  </p>
                </div>
              )}
            </section>

            <section className="directory-detail-section">
              <h3>
                Account information
              </h3>

              <dl className="directory-detail-list">
                <div>
                  <dt>Role</dt>

                  <dd>
                    {employee.role
                      ? formatValue(
                          employee.role,
                        )
                      : "No account"}
                  </dd>
                </div>

                <div>
                  <dt>
                    Account status
                  </dt>

                  <dd>
                    {formatValue(
                      employee.accountStatus,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>
                    Activation status
                  </dt>

                  <dd>
                    {formatValue(
                      employee.activationStatus,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>
                    Last login
                  </dt>

                  <dd>
                    {formatDate(
                      employee.lastLoginAt,
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            {canManageStatus && (
              <section className="dir-status-box">
                <div className="dir-status-head">
                  <span>
                    Super Admin control
                  </span>

                  <strong>
                    {employee.status ===
                    "ACTIVE"
                      ? "Active account"
                      : "Suspended account"}
                  </strong>

                  <p>
                    Suspend or reactivate temporary access without ending the employee's employment record.
                  </p>
                </div>

                <div
                  aria-live="polite"
                >
                  {actionMessage && (
                    <div className="dir-status-ok">
                      {actionMessage}
                    </div>
                  )}

                  {actionError && (
                    <div
                      className="dir-status-err"
                      role="alert"
                    >
                      {actionError}
                    </div>
                  )}
                </div>

                {!pendingStatus && (
                  <button
                    type="button"
                    className={`dir-status-btn ${
                      employee.status ===
                      "ACTIVE"
                        ? "suspend"
                        : "reactivate"
                    }`}
                    onClick={() =>
                      openStatusConfirmation(
                        employee.status ===
                        "ACTIVE"
                          ? "INACTIVE"
                          : "ACTIVE",
                      )
                    }
                    disabled={
                      changingStatus
                    }
                  >
                    {employee.status ===
                    "ACTIVE"
                      ? "Suspend account"
                      : "Reactivate account"}
                  </button>
                )}

                {pendingStatus && (
                  <div className="dir-status-confirm">
                    <strong>
                      {pendingStatus ===
                      "INACTIVE"
                        ? "Confirm account suspension"
                        : "Confirm account reactivation"}
                    </strong>

                    <p>
                      {pendingStatus ===
                      "INACTIVE"
                        ? "This will immediately block login and revoke every active session on all devices."
                        : "This will enable the account again. Previously revoked sessions will remain invalid, so the user must sign in again."}
                    </p>

                    <div className="dir-status-actions">
                      <button
                        type="button"
                        className={`dir-status-btn ${
                          pendingStatus ===
                          "INACTIVE"
                            ? "suspend"
                            : "reactivate"
                        }`}
                        onClick={
                          changeEmployeeStatus
                        }
                        disabled={
                          changingStatus
                        }
                      >
                        {changingStatus
                          ? "Updating..."
                          : pendingStatus ===
                              "INACTIVE"
                            ? "Yes, suspend"
                            : "Yes, reactivate"}
                      </button>

                      <button
                        type="button"
                        className="dir-status-cancel"
                        onClick={
                          cancelStatusChange
                        }
                        disabled={
                          changingStatus
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {canEndEmployment && (
              <section className="dir-life-box">
                <div className="dir-life-head">
                  <span>
                    Employment lifecycle
                  </span>

                  <strong>
                    End Patan Branch access
                  </strong>

                  <p>
                    This permanently ends the current Patan Branch employment record, disables login and revokes every active session.
                  </p>
                </div>

                {actionMessage && (
                  <div className="dir-status-ok">
                    {actionMessage}
                  </div>
                )}

                {actionError && (
                  <div
                    className="dir-status-err"
                    role="alert"
                  >
                    {actionError}
                  </div>
                )}

                {!pendingEmploymentStatus && (
                  <div className="dir-life-options">
                    <button
                      type="button"
                      onClick={() =>
                        openEmploymentEnd(
                          "RESIGNED",
                        )
                      }
                    >
                      Resigned
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        openEmploymentEnd(
                          "RETIRED",
                        )
                      }
                    >
                      Retired
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        openEmploymentEnd(
                          "TERMINATED",
                        )
                      }
                    >
                      Terminated
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        openEmploymentEnd(
                          "TRANSFERRED",
                        )
                      }
                    >
                      Transferred
                    </button>
                  </div>
                )}

                {pendingEmploymentStatus && (
                  <form
                    className="dir-life-form"
                    onSubmit={
                      submitEmploymentEnd
                    }
                  >
                    <div className="dir-life-selected">
                      <span>
                        Selected action
                      </span>

                      <strong>
                        {formatValue(
                          pendingEmploymentStatus,
                        )}
                      </strong>
                    </div>

                    <label>
                      <span>
                        Effective date
                      </span>

                      <input
                        type="date"
                        value={
                          employmentEffectiveDate
                        }
                        max={
                          new Date()
                            .toISOString()
                            .slice(0, 10)
                        }
                        onChange={(
                          event,
                        ) =>
                          setEmploymentEffectiveDate(
                            event.target.value,
                          )
                        }
                        disabled={
                          endingEmployment
                        }
                      />
                    </label>

                    <label>
                      <span>
                        Official reason
                      </span>

                      <textarea
                        value={
                          employmentReason
                        }
                        onChange={(
                          event,
                        ) =>
                          setEmploymentReason(
                            event.target.value,
                          )
                        }
                        minLength={3}
                        maxLength={500}
                        placeholder="Enter the approved employment-exit reason."
                        disabled={
                          endingEmployment
                        }
                        required
                      />
                    </label>

                    <div className="dir-life-actions">
                      <button
                        type="submit"
                        className="dir-life-confirm"
                        disabled={
                          endingEmployment
                        }
                      >
                        {endingEmployment
                          ? "Processing..."
                          : `Confirm ${formatValue(
                              pendingEmploymentStatus,
                            )}`}
                      </button>

                      <button
                        type="button"
                        className="dir-status-cancel"
                        onClick={
                          cancelEmploymentEnd
                        }
                        disabled={
                          endingEmployment
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}

            <section className="directory-detail-section">
              <h3>
                Record information
              </h3>

              <dl className="directory-detail-list">
                <div>
                  <dt>Created</dt>

                  <dd>
                    {formatDate(
                      employee.createdAt,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>
                    Last updated
                  </dt>

                  <dd>
                    {formatDate(
                      employee.updatedAt,
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <footer className="directory-detail-footer">
              <button
                type="button"
                onClick={onClose}
              >
                Close
              </button>
            </footer>
          </div>
        )}
      </aside>
    </div>
  );
}