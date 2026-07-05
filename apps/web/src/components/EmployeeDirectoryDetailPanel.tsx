import { useEffect, useState } from "react";

import type {
  FormEvent,
} from "react";

import {
  archiveDirectoryEmployee,
  changeDirectoryEmployeeRole,
  endDirectoryEmployeeEmployment,
  getDirectoryEmployee,
  getDirectoryEmployeeLifecycleHistory,
  listDirectoryOrganizationDepartments,
  listDirectoryOrganizationDivisions,
  updateDirectoryEmployeeStatus,
} from "../services/directory.service";
import {
  createDirectoryProfilePhotoObjectUrl,
} from "../services/messaging.service";

import type {
  AccountRole,
} from "../types/auth";

import type {
  DirectoryEmployee,
  DirectoryEmployeeDetailResponse,
  DirectoryEmployeeStatus,
  DirectoryEmploymentStatus,
  DirectoryLifecycleHistoryResponse,
  DirectoryOrganizationDepartment,
  DirectoryOrganizationDivision,
  DirectoryRoleChangeTarget,
} from "../types/directory";

const assignableRoles:
  DirectoryRoleChangeTarget[] = [
    "SENIOR_MANAGEMENT",
    "TEAM_MANAGER",
    "EMPLOYEE",
  ];

interface EmployeeDirectoryDetailPanelProps {
  accessToken: string;
  employeeId: string;
  viewerRole: AccountRole;
  onStatusChanged: () => void;
  onClose: () => void;
}

const BRANCH_TIME_ZONE = "Asia/Kathmandu";
const BRANCH_UTC_OFFSET = "+05:45";

function getBranchDateInputValue(
  value: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: BRANCH_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).formatToParts(value);

  const year = parts.find(
    (part) => part.type === "year",
  )?.value;

  const month = parts.find(
    (part) => part.type === "month",
  )?.value;

  const day = parts.find(
    (part) => part.type === "day",
  )?.value;

  if (!year || !month || !day) {
    return value.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function getEmploymentEffectiveAt(
  value: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value === getBranchDateInputValue()) {
    return new Date().toISOString();
  }

  return new Date(
    `${value}T23:59:59.999${BRANCH_UTC_OFFSET}`,
  ).toISOString();
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

function getMetadataString(
  metadata:
    Record<string, unknown> | null,
  key: string,
): string | null {
  const value =
    metadata?.[key];

  return typeof value === "string"
    ? value
    : null;
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

function getCurrentPositionLabel(
  employee: DirectoryEmployee,
): string {
  const position =
    employee.currentPosition;

  if (!position) {
    return "No management position";
  }

  if (
    position.positionType ===
    "SENIOR_MANAGEMENT"
  ) {
    return `${position.division.name} Senior Management`;
  }

  return `${position.department?.name ?? "Department"} Team Manager`;
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
    profilePhotoUrl,
    setProfilePhotoUrl,
  ] = useState<string | null>(null);

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


  const [
    showArchiveForm,
    setShowArchiveForm,
  ] = useState(false);

  const [
    archiveReason,
    setArchiveReason,
  ] = useState("");

  const [
    archiving,
    setArchiving,
  ] = useState(false);


  const [
    lifecycleHistory,
    setLifecycleHistory,
  ] =
    useState<DirectoryLifecycleHistoryResponse | null>(
      null,
    );

  const [
    lifecycleLoading,
    setLifecycleLoading,
  ] = useState(
    viewerRole === "SUPER_ADMIN",
  );

  const [
    lifecycleError,
    setLifecycleError,
  ] = useState("");


  const [
    organizationDivisions,
    setOrganizationDivisions,
  ] =
    useState<
      DirectoryOrganizationDivision[]
    >([]);

  const [
    organizationDepartments,
    setOrganizationDepartments,
  ] =
    useState<
      DirectoryOrganizationDepartment[]
    >([]);

  const [
    organizationLoading,
    setOrganizationLoading,
  ] = useState(
    viewerRole === "SUPER_ADMIN",
  );

  const [
    organizationError,
    setOrganizationError,
  ] = useState("");

  const [
    showRoleForm,
    setShowRoleForm,
  ] = useState(false);

  const [
    targetRole,
    setTargetRole,
  ] =
    useState<
      DirectoryRoleChangeTarget | ""
    >("");

  const [
    roleDivisionId,
    setRoleDivisionId,
  ] = useState("");

  const [
    roleDepartmentId,
    setRoleDepartmentId,
  ] = useState("");

  const [
    roleDesignation,
    setRoleDesignation,
  ] = useState("");

  const [
    roleReason,
    setRoleReason,
  ] = useState("");

  const [
    changingRole,
    setChangingRole,
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
    const employee = response?.employee;

    if (!employee?.id) {
      setProfilePhotoUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    // Detail drawer avatars use the same protected photo route as the directory list.
    void createDirectoryProfilePhotoObjectUrl(accessToken, employee.id)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }

        objectUrl = url;
        setProfilePhotoUrl(url);
      })
      .catch(() => {
        if (active) {
          setProfilePhotoUrl(null);
        }
      });

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    accessToken,
    response?.employee.id,
  ]);

  useEffect(() => {
    if (
      viewerRole !==
      "SUPER_ADMIN"
    ) {
      return;
    }

    let active = true;

    getDirectoryEmployeeLifecycleHistory(
      accessToken,
      employeeId,
    )
      .then((historyResponse) => {
        if (!active) {
          return;
        }

        setLifecycleHistory(
          historyResponse,
        );

        setLifecycleError("");
      })
      .catch(
        (
          requestError:
            unknown,
        ) => {
          if (!active) {
            return;
          }

          setLifecycleHistory(null);

          setLifecycleError(
            getErrorMessage(
              requestError,
            ),
          );
        },
      )
      .finally(() => {
        if (active) {
          setLifecycleLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    employeeId,
    retryKey,
    viewerRole,
  ]);

  useEffect(() => {
    if (
      viewerRole !==
      "SUPER_ADMIN"
    ) {
      return;
    }

    let active = true;

    Promise.all([
      listDirectoryOrganizationDivisions(
        accessToken,
      ),

      listDirectoryOrganizationDepartments(
        accessToken,
      ),
    ])
      .then(([
        divisionResponse,
        departmentResponse,
      ]) => {
        if (!active) {
          return;
        }

        setOrganizationDivisions(
          divisionResponse.data,
        );

        setOrganizationDepartments(
          departmentResponse.data,
        );


        setOrganizationError("");
      })
      .catch(
        (
          requestError:
            unknown,
        ) => {
          if (!active) {
            return;
          }

          setOrganizationError(
            getErrorMessage(
              requestError,
            ),
          );
        },
      )
      .finally(() => {
        if (active) {
          setOrganizationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    viewerRole,
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


  const canArchiveFormerEmployee =
    canManageAccount &&
    !employmentIsActive &&
    !employee?.archivedAt;


  const canChangeRole =
    canManageAccount &&
    employmentIsActive &&
    employee?.status === "ACTIVE" &&
    employee?.activationStatus ===
      "ACTIVATED" &&
    Boolean(employee?.role);

  const roleRequiresDepartment =
    targetRole !==
    "SENIOR_MANAGEMENT";

  const availableRoleDepartments =
    organizationDepartments.filter(
      (department) =>
        department.isActive &&
        department.division.isActive &&
        department.division.id ===
          roleDivisionId,
    );

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
    setEmploymentEffectiveDate(
      getBranchDateInputValue(),
    );
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
              getEmploymentEffectiveAt(
                employmentEffectiveDate,
              ),
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


  function cancelArchiveEmployee():
    void {
    if (archiving) {
      return;
    }

    setShowArchiveForm(false);
    setArchiveReason("");
    setActionError("");
  }

  async function submitArchiveEmployee(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (
      !employee ||
      archiving
    ) {
      return;
    }

    const reason =
      archiveReason
        .trim()
        .replace(/\s+/g, " ");

    if (reason.length < 3) {
      setActionError(
        "Enter an archive reason of at least 3 characters.",
      );

      return;
    }

    setArchiving(true);
    setActionError("");
    setActionMessage("");

    try {
      const result =
        await archiveDirectoryEmployee(
          accessToken,
          employee.id,
          {
            reason,
          },
        );

      setActionMessage(
        result.message,
      );

      setShowArchiveForm(false);
      setArchiveReason("");

      // Refresh both the profile and directory list.
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
      setArchiving(false);
    }
  }


  function openRoleChange(): void {
    if (!employee) {
      return;
    }

    setTargetRole("");
    setRoleDivisionId(
      employee.division?.id ??
        "",
    );

    setRoleDepartmentId(
      employee.department?.id ??
        "",
    );

    setRoleDesignation(
      employee.designation ??
        "",
    );

    setRoleReason("");
    setActionError("");
    setActionMessage("");
    setShowRoleForm(true);
  }

  function cancelRoleChange(): void {
    if (changingRole) {
      return;
    }

    setShowRoleForm(false);
    setTargetRole("");
    setRoleReason("");
    setActionError("");
  }

  async function submitRoleChange(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (
      !employee ||
      changingRole
    ) {
      return;
    }

    if (!targetRole) {
      setActionError(
        "Select the new organizational role.",
      );

      return;
    }

    if (!roleDivisionId) {
      setActionError(
        "Select a division.",
      );

      return;
    }

    if (
      roleRequiresDepartment &&
      !roleDepartmentId
    ) {
      setActionError(
        "Select a department.",
      );

      return;
    }


    const designation =
      roleDesignation
        .trim()
        .replace(/\s+/g, " ");

    if (
      designation &&
      designation.length < 2
    ) {
      setActionError(
        "Designation must contain at least 2 characters.",
      );

      return;
    }

    const reason =
      roleReason
        .trim()
        .replace(/\s+/g, " ");

    if (reason.length < 3) {
      setActionError(
        "Enter an official role-change reason of at least 3 characters.",
      );

      return;
    }

    setChangingRole(true);
    setActionError("");
    setActionMessage("");

    try {
      const result =
        await changeDirectoryEmployeeRole(
          accessToken,
          employee.id,
          {
            targetRole,
            divisionId:
              roleDivisionId,
            departmentId:
              roleRequiresDepartment
                ? roleDepartmentId
                : undefined,

            designation:
              designation ||
              undefined,

            reason,
          },
        );

      setActionMessage(
        `${result.message} ${result.revokedSessions} active session${
          result.revokedSessions === 1
            ? ""
            : "s"
        } revoked.`,
      );

      setShowRoleForm(false);
      setTargetRole("");
      setRoleReason("");

      // Reload the role badge, organization assignment and history.
      setRetryKey(
        (current) =>
          current + 1,
      );

      onStatusChanged();
    } catch (
      requestError:
        unknown
    ) {
      setActionError(
        getErrorMessage(
          requestError,
        ),
      );
    } finally {
      setChangingRole(false);
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
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt={`${employee.empName} profile`}
                  />
                ) : (
                  getInitials(
                    employee.empName,
                  )
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
                  employee.effectiveRole ??
                    "NO_ACCOUNT",
                )}`}
              >
                {employee.effectiveRole
                  ? `Effective: ${formatValue(
                      employee.effectiveRole,
                    )}`
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

                <div>
                  <dt>
                    Current position
                  </dt>

                  <dd>
                    {getCurrentPositionLabel(
                      employee,
                    )}
                  </dd>
                </div>

                <div>
                  <dt>
                    Position status
                  </dt>

                  <dd>
                    {employee.currentPosition
                      ? formatValue(
                          employee.currentPosition.status,
                        )
                      : "No current assignment"}
                  </dd>
                </div>

                <div>
                  <dt>
                    Position started
                  </dt>

                  <dd>
                    {employee.currentPosition
                      ? formatDate(
                          employee.currentPosition.startedAt,
                        )
                      : "Not applicable"}
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
                  <dt>
                    Account role
                  </dt>

                  <dd>
                    {employee.accountRole
                      ? formatValue(
                          employee.accountRole,
                        )
                      : "No account"}
                  </dd>
                </div>

                <div>
                  <dt>
                    Effective role
                  </dt>

                  <dd>
                    {employee.effectiveRole
                      ? formatValue(
                          employee.effectiveRole,
                        )
                      : "No authority"}
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

            {canChangeRole && (
              <section className="dir-role-box">
                <div className="dir-role-head">
                  <span>
                    Organization authority
                  </span>

                  <strong>
                    Change organizational role
                  </strong>

                  <p>
                    Promotion or demotion keeps the same account and employee history. Existing login sessions are revoked after confirmation.
                  </p>
                </div>

                {organizationError && (
                  <div
                    className="dir-status-err"
                    role="alert"
                  >
                    {organizationError}
                  </div>
                )}

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

                {!showRoleForm && (
                  <button
                    type="button"
                    className="dir-role-open"
                    onClick={
                      openRoleChange
                    }
                    disabled={
                      organizationLoading ||
                      Boolean(
                        organizationError,
                      )
                    }
                  >
                    {organizationLoading
                      ? "Loading organization..."
                      : "Promote, demote or transfer employee"}
                  </button>
                )}

                {showRoleForm && (
                  <form
                    className="dir-role-form"
                    onSubmit={
                      submitRoleChange
                    }
                  >
                    <div className="dir-role-current">
                      <span>
                        Current effective role
                      </span>

                      <strong>
                        {employee.effectiveRole
                          ? formatValue(
                              employee.effectiveRole,
                            )
                          : "Employee"}
                      </strong>
                    </div>

                    <label>
                      <span>
                        New role
                      </span>

                      <select
                        value={
                          targetRole
                        }
                        onChange={(
                          event,
                        ) => {
                          const nextRole =
                            event.target
                              .value as
                              | DirectoryRoleChangeTarget
                              | "";

                          setTargetRole(
                            nextRole,
                          );

                          if (
                            nextRole ===
                            "SENIOR_MANAGEMENT"
                          ) {
                            setRoleDepartmentId(
                              "",
                            );
                          }

                          setActionError("");
                        }}
                        disabled={
                          changingRole
                        }
                        required
                      >
                        <option value="">
                          Select new role
                        </option>

                        {assignableRoles
                          .map(
                            (role) => (
                              <option
                                key={
                                  role
                                }
                                value={
                                  role
                                }
                              >
                                {formatValue(
                                  role,
                                )}
                                {role ===
                                employee.effectiveRole
                                  ? " (transfer)"
                                  : ""}
                              </option>
                            ),
                          )}
                      </select>
                    </label>

                    <label>
                      <span>
                        Division
                      </span>

                      <select
                        value={
                          roleDivisionId
                        }
                        onChange={(
                          event,
                        ) => {
                          setRoleDivisionId(
                            event.target.value,
                          );

                          setRoleDepartmentId(
                            "",
                          );

                          setActionError("");
                        }}
                        disabled={
                          changingRole
                        }
                        required
                      >
                        <option value="">
                          Select division
                        </option>

                        {organizationDivisions
                          .filter(
                            (division) =>
                              division.isActive,
                          )
                          .map(
                            (division) => (
                              <option
                                key={
                                  division.id
                                }
                                value={
                                  division.id
                                }
                              >
                                {division.name} ({division.code})
                              </option>
                            ),
                          )}
                      </select>
                    </label>

                    {roleRequiresDepartment && (
                      <label>
                        <span>
                          Department
                        </span>

                        <select
                          value={
                            roleDepartmentId
                          }
                          onChange={(
                            event,
                          ) => {
                            setRoleDepartmentId(
                              event.target.value,
                            );

                            setActionError("");
                          }}
                          disabled={
                            changingRole ||
                            !roleDivisionId
                          }
                          required
                        >
                          <option value="">
                            Select department
                          </option>

                          {availableRoleDepartments.map(
                            (
                              department,
                            ) => (
                              <option
                                key={
                                  department.id
                                }
                                value={
                                  department.id
                                }
                              >
                                {department.name} ({department.code})
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    )}


                    <label>
                      <span>
                        New designation
                      </span>

                      <input
                        type="text"
                        value={
                          roleDesignation
                        }
                        onChange={(
                          event,
                        ) =>
                          setRoleDesignation(
                            event.target.value,
                          )
                        }
                        minLength={2}
                        maxLength={120}
                        placeholder="Example: Sales Team Manager"
                        disabled={
                          changingRole
                        }
                      />
                    </label>

                    <label>
                      <span>
                        Official reason
                      </span>

                      <textarea
                        value={
                          roleReason
                        }
                        onChange={(
                          event,
                        ) =>
                          setRoleReason(
                            event.target.value,
                          )
                        }
                        minLength={3}
                        maxLength={500}
                        placeholder="Enter the approved promotion or demotion reason."
                        disabled={
                          changingRole
                        }
                        required
                      />
                    </label>

                    <div className="dir-role-warning">
                      The employee keeps the same password, employee ID and history. The correct internal authority position is created or reused automatically, the assignment is updated atomically, and all login sessions are revoked.
                    </div>

                    <div className="dir-role-actions">
                      <button
                        type="submit"
                        className="dir-role-confirm"
                        disabled={
                          changingRole
                        }
                      >
                        {changingRole
                          ? "Applying change..."
                          : "Confirm organization change"}
                      </button>

                      <button
                        type="button"
                        className="dir-status-cancel"
                        onClick={
                          cancelRoleChange
                        }
                        disabled={
                          changingRole
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}

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
                          getBranchDateInputValue()
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

            {viewerRole ===
              "SUPER_ADMIN" && (
              <section className="dir-history-box">
                <div className="dir-history-head">
                  <span>
                    Audit trail
                  </span>

                  <strong>
                    Lifecycle history
                  </strong>

                  <p>
                    Administrative lifecycle actions are displayed newest first.
                  </p>
                </div>

                {lifecycleLoading && (
                  <div className="dir-history-loading">
                    <div className="spinner" />

                    <span>
                      Loading lifecycle history...
                    </span>
                  </div>
                )}

                {lifecycleError && (
                  <div
                    className="dir-status-err"
                    role="alert"
                  >
                    {lifecycleError}
                  </div>
                )}

                {!lifecycleLoading &&
                  !lifecycleError &&
                  (
                    lifecycleHistory?.data
                      .length ?? 0
                  ) === 0 && (
                    <div className="dir-history-empty">
                      No lifecycle actions have been recorded.
                    </div>
                  )}

                {!lifecycleLoading &&
                  lifecycleHistory &&
                  lifecycleHistory.data
                    .length > 0 && (
                    <div className="dir-history-list">
                      {lifecycleHistory.data.map(
                        (
                          action,
                        ) => {
                          const actorName =
                            action.actor
                              .employee
                              ?.empName ??
                            action.actor
                              .username ??
                            formatValue(
                              action.actor
                                .role,
                            );

                          const previousRole =
                            getMetadataString(
                              action.metadata,
                              "previousRole",
                            );

                          const newRole =
                            getMetadataString(
                              action.metadata,
                              "newRole",
                            );

                          return (
                            <article
                              key={
                                action.id
                              }
                            >
                              <div className="dir-history-marker" />

                              <div>
                                <header>
                                  <strong>
                                    {formatValue(
                                      action.action,
                                    )}
                                  </strong>

                                  <time>
                                    {formatDate(
                                      action.effectiveAt ??
                                        action.createdAt,
                                    )}
                                  </time>
                                </header>

                                <p>
                                  Action performed by{" "}
                                  <strong>
                                    {actorName}
                                  </strong>
                                </p>

                                {action.previousEmployeeStatus &&
                                  action.newEmployeeStatus && (
                                    <small>
                                      Account:{" "}
                                      {formatValue(
                                        action.previousEmployeeStatus,
                                      )}
                                      {" → "}
                                      {formatValue(
                                        action.newEmployeeStatus,
                                      )}
                                    </small>
                                  )}

                                {action.previousEmploymentStatus &&
                                  action.newEmploymentStatus && (
                                    <small>
                                      Employment:{" "}
                                      {formatValue(
                                        action.previousEmploymentStatus,
                                      )}
                                      {" → "}
                                      {formatValue(
                                        action.newEmploymentStatus,
                                      )}
                                    </small>
                                  )}

                                {previousRole &&
                                  newRole && (
                                    <small>
                                      Role:{" "}
                                      {formatValue(
                                        previousRole,
                                      )}
                                      {" → "}
                                      {formatValue(
                                        newRole,
                                      )}
                                    </small>
                                  )}

                                {action.reason && (
                                  <blockquote>
                                    {action.reason}
                                  </blockquote>
                                )}
                              </div>
                            </article>
                          );
                        },
                      )}
                    </div>
                  )}
              </section>
            )}

            {canArchiveFormerEmployee && (
              <section className="dir-archive-box">
                <div className="dir-archive-head">
                  <span>
                    Historical record
                  </span>

                  <strong>
                    Archive former employee
                  </strong>

                  <p>
                    Archiving keeps messages, audit records and employment history, but marks the profile as a historical Patan Branch record.
                  </p>
                </div>

                {!showArchiveForm && (
                  <button
                    type="button"
                    className="dir-archive-open"
                    onClick={() => {
                      setShowArchiveForm(
                        true,
                      );

                      setActionError("");
                      setActionMessage("");
                    }}
                  >
                    Archive employee record
                  </button>
                )}

                {showArchiveForm && (
                  <form
                    className="dir-archive-form"
                    onSubmit={
                      submitArchiveEmployee
                    }
                  >
                    <label>
                      <span>
                        Archive reason
                      </span>

                      <textarea
                        value={
                          archiveReason
                        }
                        onChange={(
                          event,
                        ) =>
                          setArchiveReason(
                            event.target.value,
                          )
                        }
                        minLength={3}
                        maxLength={500}
                        placeholder="Enter why this former employee record is being archived."
                        disabled={
                          archiving
                        }
                        required
                      />
                    </label>

                    {actionError && (
                      <div
                        className="dir-status-err"
                        role="alert"
                      >
                        {actionError}
                      </div>
                    )}

                    <div className="dir-archive-actions">
                      <button
                        type="submit"
                        className="dir-archive-confirm"
                        disabled={
                          archiving
                        }
                      >
                        {archiving
                          ? "Archiving..."
                          : "Confirm archive"}
                      </button>

                      <button
                        type="button"
                        className="dir-status-cancel"
                        onClick={
                          cancelArchiveEmployee
                        }
                        disabled={
                          archiving
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
