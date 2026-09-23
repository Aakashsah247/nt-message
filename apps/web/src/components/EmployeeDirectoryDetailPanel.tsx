import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ProtectedAvatar } from "./ProtectedAvatar";
import {
  archiveDirectoryEmployee,
  correctAdminEmployeeIdentity,
  endDirectoryEmployeeEmployment,
  getDirectoryEmployee,
  getDirectoryEmployeeLifecycleHistory,
  transferDirectoryEmployeeOffice,
  updateAdminEmployeeDesignation,
  updateDirectoryEmployeeStatus,
} from "../services/directory.service";
import {
  getOrganizationOffices,
  getOrganizationTree,
} from "../services/organization-v3.service";
import type { AccountClass } from "../types/auth";
import type {
  DirectoryEmployeeDetailResponse,
  DirectoryEmployeeStatus,
  DirectoryEmploymentStatus,
  DirectoryLifecycleHistoryResponse,
} from "../types/directory";
import type { OrganizationOfficeSummary, OrganizationUnitNode } from "../types/organization-v3";

interface EmployeeDirectoryDetailPanelProps {
  accessToken: string;
  employeeId: string;
  viewerAccountClass: AccountClass;
  onStatusChanged: () => void;
  onClose: () => void;
}

const BRANCH_TIME_ZONE = "Asia/Kathmandu";
const BRANCH_UTC_OFFSET = "+05:45";
const FORMAL_TYPES = new Set(["DIVISION", "DEPARTMENT", "SECTION", "UNIT"]);

function getBranchDateInputValue(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BRANCH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : value.toISOString().slice(0, 10);
}

function getEffectiveAt(value: string): string | undefined {
  if (!value) return undefined;
  if (value === getBranchDateInputValue()) return new Date().toISOString();
  return new Date(`${value}T23:59:59.999${BRANCH_UTC_OFFSET}`).toISOString();
}

function getErrorMessage(error: unknown, t: TFunction<"directory">): string {
  return error instanceof Error ? error.message : t("detail.errorFallback");
}

function fallbackFormatValue(value: string): string {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatValue(value: string, t: TFunction<"directory">): string {
  return t(`values.${value}`, { defaultValue: fallbackFormatValue(value) });
}

function formatDate(value: string | null, locale: string, t: TFunction<"directory">): string {
  if (!value) return t("common.notAvailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("common.notAvailable");
  return new Intl.DateTimeFormat(locale === "ne" ? "ne-NP" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getStatusClass(value: string): string {
  return value.toLowerCase().replaceAll("_", "-");
}

function flattenTree(nodes: OrganizationUnitNode[], prefix: string[] = []): Array<{ node: OrganizationUnitNode; path: string }> {
  return nodes.flatMap((node) => {
    const path = [...prefix, node.name];
    return [{ node, path: path.join(" → ") }, ...flattenTree(node.children, path)];
  });
}

function leadershipLabel(
  assignment: NonNullable<DirectoryEmployeeDetailResponse["employee"]>["leadership"][number],
  t: TFunction<"directory">,
): string {
  if (assignment.type === "OFFICE_HEAD") return t("leadership.officeHead", { unit: assignment.office.name });
  const type = assignment.orgUnit?.typeCode;
  const key = type === "DIVISION" ? "divisionHead" : type === "DEPARTMENT" ? "departmentHead" : type === "SECTION" ? "sectionHead" : "unitHead";
  return t(`leadership.${key}`, { unit: assignment.orgUnit?.name ?? assignment.office.name });
}

export function EmployeeDirectoryDetailPanel({
  accessToken,
  employeeId,
  viewerAccountClass,
  onStatusChanged,
  onClose,
}: EmployeeDirectoryDetailPanelProps) {
  const { t, i18n } = useTranslation("directory");
  const [response, setResponse] = useState<DirectoryEmployeeDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<DirectoryEmployeeStatus | null>(null);
  const [pendingEmploymentStatus, setPendingEmploymentStatus] = useState<Exclude<DirectoryEmploymentStatus, "ACTIVE" | "TRANSFERRED"> | null>(null);
  const [employmentReason, setEmploymentReason] = useState("");
  const [employmentEffectiveDate, setEmploymentEffectiveDate] = useState("");
  const [showArchiveForm, setShowArchiveForm] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [lifecycleHistory, setLifecycleHistory] = useState<DirectoryLifecycleHistoryResponse | null>(null);

  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionEmpId, setCorrectionEmpId] = useState("");
  const [correctionName, setCorrectionName] = useState("");
  const [correctionPhone, setCorrectionPhone] = useState("");
  const [correctionEmail, setCorrectionEmail] = useState("");
  const [correctionDesignation, setCorrectionDesignation] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const [showTransfer, setShowTransfer] = useState(false);
  const [offices, setOffices] = useState<OrganizationOfficeSummary[]>([]);
  const [targetOfficeId, setTargetOfficeId] = useState("");
  const [targetTree, setTargetTree] = useState<OrganizationUnitNode[]>([]);
  const [targetTreeOfficeId, setTargetTreeOfficeId] = useState("");
  const [targetOrgUnitId, setTargetOrgUnitId] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [transferReason, setTransferReason] = useState("");

  useEffect(() => {
    let active = true;
    getDirectoryEmployee(accessToken, employeeId)
      .then((detail) => {
        if (!active) return;
        setResponse(detail);
        setError("");
        setCorrectionEmpId(detail.employee.empId);
        setCorrectionName(detail.employee.empName);
        setCorrectionPhone(detail.employee.phoneNumber ?? "");
        setCorrectionEmail(detail.employee.officialEmail ?? "");
        setCorrectionDesignation(detail.employee.designation ?? "");
      })
      .catch((requestError: unknown) => { if (active) setError(getErrorMessage(requestError, t)); });
    return () => { active = false; };
  }, [accessToken, employeeId, retryKey, t]);

  useEffect(() => {
    if (viewerAccountClass !== "SUPER_ADMIN") return;
    let active = true;
    Promise.all([
      getDirectoryEmployeeLifecycleHistory(accessToken, employeeId),
      getOrganizationOffices(accessToken),
    ]).then(([history, officeResult]) => {
      if (!active) return;
      setLifecycleHistory(history);
      setOffices(officeResult.data.filter((office) => office.isActive));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [accessToken, employeeId, retryKey, viewerAccountClass]);

  useEffect(() => {
    if (!targetOfficeId) return;
    let active = true;
    getOrganizationTree(accessToken, targetOfficeId)
      .then((result) => {
        if (!active) return;
        setTargetTree(result.tree);
        setTargetTreeOfficeId(targetOfficeId);
      })
      .catch(() => {
        if (!active) return;
        setTargetTree([]);
        setTargetTreeOfficeId(targetOfficeId);
      });
    return () => { active = false; };
  }, [accessToken, targetOfficeId]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const employee = response?.employee;
  const isSuperAdmin = viewerAccountClass === "SUPER_ADMIN";
  const canAdminister = Boolean(employee) && isSuperAdmin && employee?.accountClass !== "SUPER_ADMIN";
  const activeEmployment = employee?.employmentStatus === "ACTIVE";
  const isCurrentPermanentOfficeHead = Boolean(
    employee?.leadership.some(
      (assignment) =>
        assignment.type === "OFFICE_HEAD" &&
        !assignment.isActing &&
        assignment.effectiveUntil === null,
    ),
  );
  const activeTargetTree = targetTreeOfficeId === targetOfficeId ? targetTree : [];
  const transferUnits = flattenTree(activeTargetTree).filter(({ node }) => node.isActive && FORMAL_TYPES.has(node.orgUnitType.code));

  function refresh(message?: string) {
    if (message) setActionMessage(message);
    setRetryKey((current) => current + 1);
    onStatusChanged();
  }

  async function submitStatus() {
    if (!employee || !pendingStatus || busy) return;
    setBusy(true); setActionError("");
    try {
      await updateDirectoryEmployeeStatus(accessToken, employee.id, pendingStatus);
      setPendingStatus(null);
      refresh(pendingStatus === "INACTIVE" ? t("detail.accountAccess.suspendedMessage") : t("detail.accountAccess.reactivatedMessage"));
    } catch (requestError) { setActionError(getErrorMessage(requestError, t)); } finally { setBusy(false); }
  }

  async function submitEmploymentEnd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || !pendingEmploymentStatus || busy) return;
    const reason = employmentReason.trim().replace(/\s+/g, " ");
    if (reason.length < 3) { setActionError(t("detail.lifecycle.reasonError")); return; }
    setBusy(true); setActionError("");
    try {
      const result = await endDirectoryEmployeeEmployment(accessToken, employee.id, { employmentStatus: pendingEmploymentStatus, reason, effectiveAt: getEffectiveAt(employmentEffectiveDate) });
      setPendingEmploymentStatus(null); setEmploymentReason("");
      refresh(t("detail.lifecycle.success", { count: result.revokedSessions, status: formatValue(pendingEmploymentStatus, t) }));
    } catch (requestError) { setActionError(getErrorMessage(requestError, t)); } finally { setBusy(false); }
  }

  async function submitArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || busy) return;
    const reason = archiveReason.trim().replace(/\s+/g, " ");
    if (reason.length < 3) { setActionError(t("detail.archive.reasonError")); return; }
    setBusy(true); setActionError("");
    try {
      const result = await archiveDirectoryEmployee(accessToken, employee.id, { reason });
      setShowArchiveForm(false); setArchiveReason("");
      refresh(t("detail.archive.success", { count: result.revokedSessions }));
    } catch (requestError) { setActionError(getErrorMessage(requestError, t)); } finally { setBusy(false); }
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || busy) return;

    const reason = correctionReason.trim().replace(/\s+/g, " ");
    const identity: { empId?: string; empName?: string; phoneNumber?: string; officialEmail?: string; reason: string } = { reason };
    if (correctionEmpId.trim() !== employee.empId) identity.empId = correctionEmpId.trim();
    if (correctionName.trim() !== employee.empName) identity.empName = correctionName.trim();
    if (correctionPhone.trim() !== (employee.phoneNumber ?? "")) identity.phoneNumber = correctionPhone.trim();
    if (correctionEmail.trim() !== (employee.officialEmail ?? "")) identity.officialEmail = correctionEmail.trim();

    const identityChanged = Object.keys(identity).length > 1;
    const designationChanged = correctionDesignation.trim() !== (employee.designation ?? "");

    if (!identityChanged && !designationChanged) {
      setActionError(t("detail.correction.noChanges"));
      return;
    }
    if (reason.length < 3) { setActionError(t("detail.correction.reasonError")); return; }

    setBusy(true); setActionError("");
    try {
      if (identityChanged) await correctAdminEmployeeIdentity(accessToken, employee.id, identity);
      if (designationChanged) await updateAdminEmployeeDesignation(accessToken, employee.id, correctionDesignation.trim());
      setShowCorrection(false); setCorrectionReason("");
      refresh(t("detail.correction.success"));
    } catch (requestError) { setActionError(getErrorMessage(requestError, t)); } finally { setBusy(false); }
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee || busy || !targetOfficeId || !targetOrgUnitId) return;
    const reason = transferReason.trim().replace(/\s+/g, " ");
    if (reason.length < 3) { setActionError(t("detail.transfer.reasonError")); return; }
    setBusy(true); setActionError("");
    try {
      const result = await transferDirectoryEmployeeOffice(accessToken, employee.id, { targetOfficeId, targetOrgUnitId, reason, effectiveAt: getEffectiveAt(transferDate) });
      setShowTransfer(false); setTargetOfficeId(""); setTargetOrgUnitId(""); setTransferReason("");
      refresh(t("detail.transfer.success", { office: result.transfer.targetOffice.name }));
    } catch (requestError) { setActionError(getErrorMessage(requestError, t)); } finally { setBusy(false); }
  }

  return (
    <div className="directory-detail-backdrop" onMouseDown={onClose}>
      <aside className="directory-detail-panel" role="dialog" aria-modal="true" aria-label={t("detail.dialogAria")} onMouseDown={(event) => event.stopPropagation()}>
        <header className="directory-detail-topbar"><div><span>{t("detail.eyebrow")}</span><strong>{t("detail.title")}</strong></div><button type="button" onClick={onClose} aria-label={t("detail.closeAria")}>×</button></header>
        {!employee && !error && <div className="directory-detail-loading"><div className="spinner" /><p>{t("detail.loading")}</p></div>}
        {error && <div className="directory-detail-error" role="alert"><strong>{t("detail.errorTitle")}</strong><p>{error}</p><button type="button" onClick={() => setRetryKey((current) => current + 1)}>{t("common.tryAgain")}</button></div>}

        {employee && (
          <div className="directory-detail-content">
            <section className="directory-detail-profile">
              <ProtectedAvatar employeeId={employee.id} photoKey={employee.profilePhotoKey} displayName={employee.empName} className="directory-detail-avatar" ariaLabel={t("list.avatarAria", { name: employee.empName })} />
              <div><span>{employee.empId}</span><h2>{employee.empName}</h2>{employee.designation?.trim() ? <p>{employee.designation}</p> : null}</div>
            </section>

            <section className="directory-detail-badges">
              <span className={`directory-badge ${getStatusClass(employee.accountStatus)}`}>{formatValue(employee.accountStatus, t)}</span>
              <span className={`directory-badge ${getStatusClass(employee.activationStatus)}`}>{formatValue(employee.activationStatus, t)}</span>
              <span className={`directory-badge ${getStatusClass(employee.employmentStatus)}`}>{formatValue(employee.employmentStatus, t)}</span>
            </section>

            <section className="directory-detail-section"><h3>{t("detail.organization.title")}</h3><dl className="directory-detail-list">
              <div><dt>{t("detail.organization.office")}</dt><dd>{employee.office?.name ?? t("common.notAssigned")}</dd></div>
              <div><dt>{t("detail.organization.primaryOrgUnit")}</dt><dd>{employee.primaryOrgUnit?.name ?? t("common.notAssigned")}</dd></div>
              <div><dt>{t("detail.organization.breadcrumb")}</dt><dd>{employee.orgUnitBreadcrumb.length > 0 ? employee.orgUnitBreadcrumb.map((unit) => unit.name).join(" → ") : t("common.notAvailable")}</dd></div>
              <div><dt>{t("detail.organization.leadership")}</dt><dd>{employee.leadership.length > 0 ? employee.leadership.map((assignment) => leadershipLabel(assignment, t)).join(", ") : t("leadership.none")}</dd></div>
            </dl></section>

            <section className="directory-detail-section"><h3>{t("detail.contact.title")}</h3><dl className="directory-detail-list"><div><dt>{t("detail.contact.officialEmail")}</dt><dd>{employee.officialEmail ?? t("common.hidden")}</dd></div><div><dt>{t("detail.contact.phone")}</dt><dd>{employee.phoneNumber ?? t("common.hidden")}</dd></div></dl></section>

            <section className="directory-detail-section"><h3>{t("detail.employment.title")}</h3><dl className="directory-detail-list"><div><dt>{t("detail.employment.status")}</dt><dd>{formatValue(employee.employmentStatus, t)}</dd></div>{employee.employmentStatus !== "ACTIVE" && <><div><dt>{t("detail.employment.ended")}</dt><dd>{formatDate(employee.employmentEndedAt, i18n.language, t)}</dd></div><div><dt>{t("detail.employment.endReason")}</dt><dd>{employee.employmentEndReason ?? t("common.notApplicable")}</dd></div></>}</dl></section>

            <section className="directory-detail-section"><h3>{t("detail.account.title")}</h3><dl className="directory-detail-list"><div><dt>{t("detail.account.accountClass")}</dt><dd>{employee.accountClass ? formatValue(employee.accountClass, t) : t("common.noAccount")}</dd></div><div><dt>{t("detail.account.status")}</dt><dd>{formatValue(employee.accountStatus, t)}</dd></div><div><dt>{t("detail.account.activationStatus")}</dt><dd>{formatValue(employee.activationStatus, t)}</dd></div>{isSuperAdmin && <div><dt>{t("detail.account.lastLogin")}</dt><dd>{formatDate(employee.lastLoginAt, i18n.language, t)}</dd></div>}</dl></section>

            {actionMessage && <div className="dir-status-ok">{actionMessage}</div>}
            {actionError && <div className="dir-status-err" role="alert">{actionError}</div>}

            {canAdminister && (
              <section className="dir-status-box">
                <div className="dir-status-head"><span>{t("detail.correction.eyebrow")}</span><strong>{t("detail.correction.title")}</strong><p>{t("detail.correction.description")}</p></div>
                {!showCorrection ? <button type="button" className="dir-status-cancel" onClick={() => setShowCorrection(true)}>{t("detail.correction.open")}</button> : (
                  <form className="dir-life-form" onSubmit={submitCorrection}>
                    <label><span>{t("detail.correction.employeeId")}</span><input value={correctionEmpId} onChange={(event) => setCorrectionEmpId(event.target.value)} /></label>
                    <label><span>{t("detail.correction.fullName")}</span><input value={correctionName} onChange={(event) => setCorrectionName(event.target.value)} /></label>
                    <label><span>{t("detail.contact.phone")}</span><input value={correctionPhone} onChange={(event) => setCorrectionPhone(event.target.value)} /></label>
                    <label><span>{t("detail.contact.officialEmail")}</span><input type="email" value={correctionEmail} onChange={(event) => setCorrectionEmail(event.target.value)} /></label>
                    <label><span>{t("detail.correction.designation")}</span><input value={correctionDesignation} onChange={(event) => setCorrectionDesignation(event.target.value)} /></label>
                    <label><span>{t("detail.correction.reason")}</span><textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} minLength={3} required /></label>
                    <div className="dir-status-actions"><button type="submit" className="dir-status-btn reactivate" disabled={busy}>{t("detail.correction.save")}</button><button type="button" className="dir-status-cancel" onClick={() => setShowCorrection(false)} disabled={busy}>{t("common.cancel")}</button></div>
                  </form>
                )}
              </section>
            )}

            {canAdminister && activeEmployment && (
              <section className="dir-status-box"><div className="dir-status-head"><span>{t("detail.accountAccess.eyebrow")}</span><strong>{employee.status === "ACTIVE" ? t("detail.accountAccess.active") : t("detail.accountAccess.suspended")}</strong><p>{t("detail.accountAccess.description")}</p></div>
                {!pendingStatus ? <button type="button" className={`dir-status-btn ${employee.status === "ACTIVE" ? "suspend" : "reactivate"}`} onClick={() => setPendingStatus(employee.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>{employee.status === "ACTIVE" ? t("detail.accountAccess.suspend") : t("detail.accountAccess.reactivate")}</button> : <div className="dir-status-actions"><button type="button" className={`dir-status-btn ${pendingStatus === "INACTIVE" ? "suspend" : "reactivate"}`} onClick={() => void submitStatus()} disabled={busy}>{pendingStatus === "INACTIVE" ? t("detail.accountAccess.yesSuspend") : t("detail.accountAccess.yesReactivate")}</button><button type="button" className="dir-status-cancel" onClick={() => setPendingStatus(null)}>{t("common.cancel")}</button></div>}
              </section>
            )}

            {canAdminister && activeEmployment && (
              <section className="dir-life-box"><div className="dir-life-head"><span>{t("detail.transfer.eyebrow")}</span><strong>{t("detail.transfer.title")}</strong><p>{isCurrentPermanentOfficeHead ? t("detail.transfer.officeHeadDescription") : t("detail.transfer.description")}</p></div>
                {isCurrentPermanentOfficeHead ? (
                  <Link
                    className="dir-status-cancel"
                    to={employee.office?.id ? `/super-admin/office-heads?officeId=${encodeURIComponent(employee.office.id)}` : "/super-admin/office-heads"}
                  >
                    {t("detail.transfer.manageOfficeHead")}
                  </Link>
                ) : !showTransfer ? <button type="button" className="dir-status-cancel" onClick={() => { setShowTransfer(true); setTransferDate(getBranchDateInputValue()); }}>{t("detail.transfer.open")}</button> : (
                  <form className="dir-life-form" onSubmit={submitTransfer}>
                    <label><span>{t("detail.transfer.targetOffice")}</span><select value={targetOfficeId} onChange={(event) => { setTargetOfficeId(event.target.value); setTargetOrgUnitId(""); }} required><option value="">{t("detail.transfer.selectOffice")}</option>{offices.filter((office) => office.id !== employee.office?.id).map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>
                    {targetOfficeId && <label><span>{t("detail.transfer.targetUnit")}</span><select value={targetOrgUnitId} onChange={(event) => setTargetOrgUnitId(event.target.value)} required><option value="">{t("detail.transfer.selectUnit")}</option>{transferUnits.map(({ node, path }) => <option key={node.id} value={node.id}>{path}</option>)}</select></label>}
                    <label><span>{t("detail.transfer.effectiveDate")}</span><input type="date" max={getBranchDateInputValue()} value={transferDate} onChange={(event) => setTransferDate(event.target.value)} /></label>
                    <label><span>{t("detail.transfer.reason")}</span><textarea value={transferReason} onChange={(event) => setTransferReason(event.target.value)} minLength={3} required /></label>
                    <div className="dir-status-actions"><button type="submit" className="dir-status-btn reactivate" disabled={busy || !targetOrgUnitId}>{t("detail.transfer.confirm")}</button><button type="button" className="dir-status-cancel" onClick={() => setShowTransfer(false)}>{t("common.cancel")}</button></div>
                  </form>
                )}
              </section>
            )}

            {canAdminister && activeEmployment && (
              <section className="dir-life-box"><div className="dir-life-head"><span>{t("detail.lifecycle.eyebrow")}</span><strong>{t("detail.lifecycle.title")}</strong><p>{t("detail.lifecycle.description")}</p></div>
                {!pendingEmploymentStatus ? <div className="dir-life-options"><button type="button" onClick={() => { setPendingEmploymentStatus("RESIGNED"); setEmploymentEffectiveDate(getBranchDateInputValue()); }}>{t("detail.lifecycle.resigned")}</button><button type="button" onClick={() => { setPendingEmploymentStatus("RETIRED"); setEmploymentEffectiveDate(getBranchDateInputValue()); }}>{t("detail.lifecycle.retired")}</button><button type="button" className="danger" onClick={() => { setPendingEmploymentStatus("TERMINATED"); setEmploymentEffectiveDate(getBranchDateInputValue()); }}>{t("detail.lifecycle.terminated")}</button></div> : (
                  <form className="dir-life-form" onSubmit={submitEmploymentEnd}><label><span>{t("detail.lifecycle.effectiveDate")}</span><input type="date" max={getBranchDateInputValue()} value={employmentEffectiveDate} onChange={(event) => setEmploymentEffectiveDate(event.target.value)} /></label><label><span>{t("detail.lifecycle.reason")}</span><textarea value={employmentReason} onChange={(event) => setEmploymentReason(event.target.value)} minLength={3} required /></label><div className="dir-status-actions"><button type="submit" className="dir-life-confirm" disabled={busy}>{t("detail.lifecycle.confirm", { status: formatValue(pendingEmploymentStatus, t) })}</button><button type="button" className="dir-status-cancel" onClick={() => setPendingEmploymentStatus(null)}>{t("common.cancel")}</button></div></form>
                )}
              </section>
            )}

            {isSuperAdmin && lifecycleHistory && (
              <section className="dir-history-box"><div className="dir-history-head"><span>{t("detail.history.eyebrow")}</span><strong>{t("detail.history.title")}</strong><p>{t("detail.history.description")}</p></div>
                {lifecycleHistory.data.length === 0 ? <div className="dir-history-empty">{t("detail.history.empty")}</div> : <div className="dir-history-list">{lifecycleHistory.data.map((action) => <article key={action.id}><div className="dir-history-marker" /><div><header><strong>{formatValue(action.action, t)}</strong><time>{formatDate(action.effectiveAt ?? action.createdAt, i18n.language, t)}</time></header>{action.reason && <blockquote>{action.reason}</blockquote>}</div></article>)}</div>}
              </section>
            )}

            {canAdminister && !activeEmployment && !employee.archivedAt && (
              <section className="dir-archive-box"><div className="dir-archive-head"><span>{t("detail.archive.eyebrow")}</span><strong>{t("detail.archive.title")}</strong><p>{t("detail.archive.description")}</p></div>{!showArchiveForm ? <button type="button" className="dir-archive-open" onClick={() => setShowArchiveForm(true)}>{t("detail.archive.open")}</button> : <form className="dir-archive-form" onSubmit={submitArchive}><label><span>{t("detail.archive.reason")}</span><textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} minLength={3} required /></label><div className="dir-archive-actions"><button type="submit" className="dir-archive-confirm" disabled={busy}>{t("detail.archive.confirm")}</button><button type="button" className="dir-status-cancel" onClick={() => setShowArchiveForm(false)}>{t("common.cancel")}</button></div></form>}</section>
            )}

            {isSuperAdmin && <section className="directory-detail-section"><h3>{t("detail.record.title")}</h3><dl className="directory-detail-list"><div><dt>{t("detail.record.created")}</dt><dd>{formatDate(employee.createdAt, i18n.language, t)}</dd></div><div><dt>{t("detail.record.updated")}</dt><dd>{formatDate(employee.updatedAt, i18n.language, t)}</dd></div></dl></section>}
            <footer className="directory-detail-footer"><button type="button" onClick={onClose}>{t("common.close")}</button></footer>
          </div>
        )}
      </aside>
    </div>
  );
}
