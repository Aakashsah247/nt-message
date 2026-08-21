import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { ProtectedAvatar } from "./ProtectedAvatar";

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

function getErrorMessage(
  error: unknown,
  t: TFunction<"directory">,
): string {
  return error instanceof Error
    ? error.message
    : t("detail.errorFallback", { ns: "directory" });
}

function fallbackFormatValue(value: string): string {
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

function formatValue(
  value: string,
  t: TFunction<"directory">,
): string {
  return t(`values.${value}`, {
    ns: "directory",
    defaultValue: fallbackFormatValue(value),
  });
}

function formatDate(
  value: string | null,
  locale: string,
  t: TFunction<"directory">,
): string {
  if (!value) {
    return t("common.notAvailable", { ns: "directory" });
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return t("common.notAvailable", { ns: "directory" });
  }

  return new Intl.DateTimeFormat(locale === "ne" ? "ne-NP" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getMetadataString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = metadata?.[key];

  return typeof value === "string" ? value : null;
}

function getStatusClass(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", "-");
}

function getCurrentPositionLabel(
  employee: DirectoryEmployee,
  t: TFunction<"directory">,
): string {
  const position = employee.currentPosition;

  if (!position) {
    return t("position.none", { ns: "directory" });
  }

  if (position.positionType === "SENIOR_MANAGEMENT") {
    return t("position.seniorManagement", {
      ns: "directory",
      division: position.division.name,
    });
  }

  return t("position.teamManager", {
    ns: "directory",
    department:
      position.department?.name ??
        t("common.department", { ns: "directory" }),
  });
}


export function EmployeeDirectoryDetailPanel({
  accessToken,
  employeeId,
  viewerRole,
  onStatusChanged,
  onClose,
}: EmployeeDirectoryDetailPanelProps) {
  const { t, i18n } = useTranslation("directory");
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
        setError(getErrorMessage(requestError, t));
      });

    return () => {
      active = false;
    };
  }, [
    accessToken,
    employeeId,
    retryKey,
    t,
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
              t,
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
    t,
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
              t,
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
    t,
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
          ? t("detail.accountAccess.suspendedMessage")
          : t("detail.accountAccess.reactivatedMessage"),
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
          t,
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
        t("detail.lifecycle.reasonError"),
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
        t("detail.lifecycle.success", {
          count: result.revokedSessions,
          status: formatValue(pendingEmploymentStatus, t),
        }),
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
          t,
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
        t("detail.archive.reasonError"),
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
        t("detail.archive.success", {
          count: result.revokedSessions,
        }),
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
          t,
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
        t("detail.roleChange.selectRoleError"),
      );

      return;
    }

    if (!roleDivisionId) {
      setActionError(
        t("detail.roleChange.selectDivision"),
      );

      return;
    }

    if (
      roleRequiresDepartment &&
      !roleDepartmentId
    ) {
      setActionError(
        t("detail.roleChange.selectDepartment"),
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
        t("detail.roleChange.designationError"),
      );

      return;
    }

    const reason =
      roleReason
        .trim()
        .replace(/\s+/g, " ");

    if (reason.length < 3) {
      setActionError(
        t("detail.roleChange.reasonError"),
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
        t("detail.roleChange.success", {
          count: result.revokedSessions,
        }),
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
          t,
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
        aria-label={t("detail.dialogAria")}
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header className="directory-detail-topbar">
          <div>
            <span>{t("detail.eyebrow")}</span>

            <strong>{t("detail.title")}</strong>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("detail.closeAria")}
          >
            ×
          </button>
        </header>

        {!employee && !error && (
          <div className="directory-detail-loading">
            <div className="spinner" />

            <p>{t("detail.loading")}</p>
          </div>
        )}

        {error && (
          <div
            className="directory-detail-error"
            role="alert"
          >
            <strong>{t("detail.errorTitle")}</strong>

            <p>{error}</p>

            <button
              type="button"
              onClick={retryLoading}
            >{t("common.tryAgain")}</button>
          </div>
        )}

        {employee && (
          <div className="directory-detail-content">
            <section className="directory-detail-profile">
              <ProtectedAvatar
                employeeId={employee.id}
                photoKey={employee.profilePhotoKey}
                displayName={employee.empName}
                className="directory-detail-avatar"
                ariaLabel={t("list.avatarAria", { name: employee.empName })}
              />

              <div>
                <span>
                  {employee.empId}
                </span>

                <h2>
                  {employee.empName}
                </h2>

                <p>
                  {employee.designation ??
                    t("detail.noDesignation")}
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
                  ? t("detail.effectiveBadge", { role: formatValue(employee.effectiveRole, t) })
                  : t("common.noAccount")}
              </span>

              <span
                className={`directory-badge ${getStatusClass(
                  employee.accountStatus,
                )}`}
              >
                {formatValue(employee.accountStatus, t)}
              </span>

              <span
                className={`directory-badge ${getStatusClass(
                  employee.activationStatus,
                )}`}
              >
                {formatValue(employee.activationStatus, t)}
              </span>

              <span
                className={`directory-badge ${getStatusClass(
                  employee.status,
                )}`}
              >
                {formatValue(employee.status, t)}
              </span>

              <span
                className={`directory-badge ${getStatusClass(
                  employee.employmentStatus,
                )}`}
              >
                {formatValue(employee.employmentStatus, t)}
              </span>
            </section>

            <section className="directory-detail-section">
              <h3>{t("detail.organization.title")}</h3>

              <dl className="directory-detail-list">
                <div>
                  <dt>{t("detail.organization.division")}</dt>

                  <dd>
                    {employee.division
                      ?.name ??
                      t("common.notAssigned")}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.organization.divisionCode")}</dt>

                  <dd>
                    {employee.division
                      ?.code ??
                      t("common.notAvailable")}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.organization.department")}</dt>

                  <dd>
                    {employee.department
                      ?.name ??
                      t("common.notAssigned")}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.organization.departmentCode")}</dt>

                  <dd>
                    {employee.department
                      ?.code ??
                      t("common.notAvailable")}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.organization.currentPosition")}</dt>

                  <dd>
                    {getCurrentPositionLabel(employee, t)}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.organization.positionStatus")}</dt>

                  <dd>
                    {employee.currentPosition
                      ? formatValue(employee.currentPosition.status, t)
                      : t("position.noCurrentAssignment")}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.organization.positionStarted")}</dt>

                  <dd>
                    {employee.currentPosition
                      ? formatDate(employee.currentPosition.startedAt, i18n.language, t)
                      : t("common.notApplicable")}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="directory-detail-section">
              <h3>{t("detail.employment.title")}</h3>

              <dl className="directory-detail-list">
                <div>
                  <dt>{t("detail.employment.status")}</dt>

                  <dd>
                    {formatValue(employee.employmentStatus, t)}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.employment.ended")}</dt>

                  <dd>
                    {employee.employmentStatus ===
                    "ACTIVE"
                      ? t("detail.employment.stillEmployed")
                      : formatDate(employee.employmentEndedAt, i18n.language, t)}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.employment.endReason")}</dt>

                  <dd>
                    {employee.employmentEndReason ??
                      t("common.notApplicable")}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.employment.archiveStatus")}</dt>

                  <dd>
                    {employee.archivedAt
                      ? t("detail.employment.archived", {
                          date: formatDate(employee.archivedAt, i18n.language, t),
                        })
                      : t("detail.employment.notArchived")}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="directory-detail-section">
              <h3>{t("detail.contact.title")}</h3>

              {employee.officialEmail ||
              employee.phoneNumber ? (
                <dl className="directory-detail-list">
                  <div>
                    <dt>{t("detail.contact.officialEmail")}</dt>

                    <dd>
                      {employee.officialEmail ??
                        t("common.hidden")}
                    </dd>
                  </div>

                  <div>
                    <dt>{t("detail.contact.phone")}</dt>

                    <dd>
                      {employee.phoneNumber ??
                        t("common.hidden")}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="directory-contact-limited">
                  <strong>{t("detail.contact.limitedTitle")}</strong>

                  <p>{t("detail.contact.limitedDescription")}</p>
                </div>
              )}
            </section>

            <section className="directory-detail-section">
              <h3>{t("detail.account.title")}</h3>

              <dl className="directory-detail-list">
                <div>
                  <dt>{t("detail.account.role")}</dt>

                  <dd>
                    {employee.accountRole
                      ? formatValue(employee.accountRole, t)
                      : t("common.noAccount")}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.account.effectiveRole")}</dt>

                  <dd>
                    {employee.effectiveRole
                      ? formatValue(employee.effectiveRole, t)
                      : t("common.noAuthority")}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.account.status")}</dt>

                  <dd>
                    {formatValue(employee.accountStatus, t)}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.account.activationStatus")}</dt>

                  <dd>
                    {formatValue(employee.activationStatus, t)}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.account.lastLogin")}</dt>

                  <dd>
                    {formatDate(employee.lastLoginAt, i18n.language, t)}
                  </dd>
                </div>
              </dl>
            </section>

            {canChangeRole && (
              <section className="dir-role-box">
                <div className="dir-role-head">
                  <span>{t("detail.roleChange.eyebrow")}</span>

                  <strong>{t("detail.roleChange.title")}</strong>

                  <p>{t("detail.roleChange.description")}</p>
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
                      ? t("detail.roleChange.loadingOrganization")
                      : t("detail.roleChange.open")}
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
                      <span>{t("detail.roleChange.currentRole")}</span>

                      <strong>
                        {employee.effectiveRole
                          ? formatValue(employee.effectiveRole, t)
                          : t("roles.EMPLOYEE")}
                      </strong>
                    </div>

                    <label>
                      <span>{t("detail.roleChange.newRole")}</span>

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
                        <option value="">{t("detail.roleChange.selectRole")}</option>

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
                                {formatValue(role, t)}
                                {role ===
                                employee.effectiveRole
                                  ? t("detail.roleChange.transferSuffix")
                                  : ""}
                              </option>
                            ),
                          )}
                      </select>
                    </label>

                    <label>
                      <span>{t("detail.organization.division")}</span>

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
                        <option value="">{t("detail.roleChange.division")}</option>

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
                        <span>{t("detail.organization.department")}</span>

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
                          <option value="">{t("detail.roleChange.department")}</option>

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
                      <span>{t("detail.roleChange.designation")}</span>

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
                        placeholder={t("detail.roleChange.designationPlaceholder")}
                        disabled={
                          changingRole
                        }
                      />
                    </label>

                    <label>
                      <span>{t("detail.roleChange.reason")}</span>

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
                        placeholder={t("detail.roleChange.reasonPlaceholder")}
                        disabled={
                          changingRole
                        }
                        required
                      />
                    </label>

                    <div className="dir-role-warning">{t("detail.roleChange.warning")}</div>

                    <div className="dir-role-actions">
                      <button
                        type="submit"
                        className="dir-role-confirm"
                        disabled={
                          changingRole
                        }
                      >
                        {changingRole
                          ? t("detail.roleChange.confirming")
                          : t("detail.roleChange.confirm")}
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
                      >{t("common.cancel")}</button>
                    </div>
                  </form>
                )}
              </section>
            )}

            {canManageStatus && (
              <section className="dir-status-box">
                <div className="dir-status-head">
                  <span>{t("detail.accountAccess.eyebrow")}</span>

                  <strong>
                    {employee.status ===
                    "ACTIVE"
                      ? t("detail.accountAccess.active")
                      : t("detail.accountAccess.suspended")}
                  </strong>

                  <p>
                    {t("detail.accountAccess.description")}
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
                      ? t("detail.accountAccess.suspend")
                      : t("detail.accountAccess.reactivate")}
                  </button>
                )}

                {pendingStatus && (
                  <div className="dir-status-confirm">
                    <strong>
                      {pendingStatus ===
                      "INACTIVE"
                        ? t("detail.accountAccess.confirmSuspend")
                        : t("detail.accountAccess.confirmReactivate")}
                    </strong>

                    <p>
                      {pendingStatus ===
                      "INACTIVE"
                        ? t("detail.accountAccess.suspendDescription")
                        : t("detail.accountAccess.reactivateDescription")}
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
                          ? t("detail.accountAccess.updating")
                          : pendingStatus ===
                              "INACTIVE"
                            ? t("detail.accountAccess.yesSuspend")
                            : t("detail.accountAccess.yesReactivate")}
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
                      >{t("common.cancel")}</button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {canEndEmployment && (
              <section className="dir-life-box">
                <div className="dir-life-head">
                  <span>{t("detail.lifecycle.eyebrow")}</span>

                  <strong>{t("detail.lifecycle.title")}</strong>

                  <p>{t("detail.lifecycle.description")}</p>
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
                    >{t("detail.lifecycle.resigned")}</button>

                    <button
                      type="button"
                      onClick={() =>
                        openEmploymentEnd(
                          "RETIRED",
                        )
                      }
                    >{t("detail.lifecycle.retired")}</button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        openEmploymentEnd(
                          "TERMINATED",
                        )
                      }
                    >{t("detail.lifecycle.terminated")}</button>

                    <button
                      type="button"
                      onClick={() =>
                        openEmploymentEnd(
                          "TRANSFERRED",
                        )
                      }
                    >{t("detail.lifecycle.transferred")}</button>
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
                      <span>{t("detail.lifecycle.selectedAction")}</span>

                      <strong>
                        {formatValue(pendingEmploymentStatus, t)}
                      </strong>
                    </div>

                    <label>
                      <span>{t("detail.lifecycle.effectiveDate")}</span>

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
                      <span>{t("detail.roleChange.reason")}</span>

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
                        placeholder={t("detail.lifecycle.reasonPlaceholder")}
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
                          ? t("detail.lifecycle.processing")
                          : t("detail.lifecycle.confirm", {
                              status: formatValue(pendingEmploymentStatus, t),
                            })}
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
                      >{t("common.cancel")}</button>
                    </div>
                  </form>
                )}
              </section>
            )}

            {viewerRole ===
              "SUPER_ADMIN" && (
              <section className="dir-history-box">
                <div className="dir-history-head">
                  <span>{t("detail.history.eyebrow")}</span>

                  <strong>{t("detail.history.title")}</strong>

                  <p>{t("detail.history.description")}</p>
                </div>

                {lifecycleLoading && (
                  <div className="dir-history-loading">
                    <div className="spinner" />

                    <span>{t("detail.history.loading")}</span>
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
                    <div className="dir-history-empty">{t("detail.history.empty")}</div>
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
                              action.actor.role,
                              t,
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
                                    {formatValue(action.action, t)}
                                  </strong>

                                  <time>
                                    {formatDate(action.effectiveAt ?? action.createdAt, i18n.language, t)}
                                  </time>
                                </header>

                                <p>{t("detail.history.performedBy", { name: actorName })}</p>

                                {action.previousEmployeeStatus &&
                                  action.newEmployeeStatus && (
                                    <small>{t("detail.history.account", {
                                      from: formatValue(action.previousEmployeeStatus, t),
                                      to: formatValue(action.newEmployeeStatus, t),
                                    })}</small>
                                  )}

                                {action.previousEmploymentStatus &&
                                  action.newEmploymentStatus && (
                                    <small>{t("detail.history.employment", {
                                      from: formatValue(action.previousEmploymentStatus, t),
                                      to: formatValue(action.newEmploymentStatus, t),
                                    })}</small>
                                  )}

                                {previousRole &&
                                  newRole && (
                                    <small>{t("detail.history.role", {
                                      from: formatValue(previousRole, t),
                                      to: formatValue(newRole, t),
                                    })}</small>
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
                  <span>{t("detail.archive.eyebrow")}</span>

                  <strong>{t("detail.archive.title")}</strong>

                  <p>{t("detail.archive.description")}</p>
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
                  >{t("detail.archive.open")}</button>
                )}

                {showArchiveForm && (
                  <form
                    className="dir-archive-form"
                    onSubmit={
                      submitArchiveEmployee
                    }
                  >
                    <label>
                      <span>{t("detail.archive.reason")}</span>

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
                        placeholder={t("detail.archive.reasonPlaceholder")}
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
                          ? t("detail.archive.archiving")
                          : t("detail.archive.confirm")}
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
                      >{t("common.cancel")}</button>
                    </div>
                  </form>
                )}
              </section>
            )}

            <section className="directory-detail-section">
              <h3>{t("detail.record.title")}</h3>

              <dl className="directory-detail-list">
                <div>
                  <dt>{t("detail.record.created")}</dt>

                  <dd>
                    {formatDate(employee.createdAt, i18n.language, t)}
                  </dd>
                </div>

                <div>
                  <dt>{t("detail.record.updated")}</dt>

                  <dd>
                    {formatDate(employee.updatedAt, i18n.language, t)}
                  </dd>
                </div>
              </dl>
            </section>

            <footer className="directory-detail-footer">
              <button
                type="button"
                onClick={onClose}
              >{t("common.close")}</button>
            </footer>
          </div>
        )}
      </aside>
    </div>
  );
}
