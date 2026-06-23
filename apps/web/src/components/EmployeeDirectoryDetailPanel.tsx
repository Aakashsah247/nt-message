import { useEffect, useState } from "react";

import {
  getDirectoryEmployee,
  updateDirectoryEmployeeStatus,
} from "../services/directory.service";

import type {
  AccountRole,
} from "../types/auth";

import type {
  DirectoryEmployeeDetailResponse,
  DirectoryEmployeeStatus,
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

  const canManageStatus =
    Boolean(employee) &&
    viewerRole === "SUPER_ADMIN" &&
    employee?.role !== "SUPER_ADMIN";

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
                    Suspend access when a user leaves, is terminated or must temporarily lose system access.
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