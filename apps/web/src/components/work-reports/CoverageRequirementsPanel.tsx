import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import {
  createDutyCoverageRequirement,
  getDutyCoverageRequirementAudit,
  listDutyCoverageRequirements,
  updateDutyCoverageRequirement,
} from "../../services/work-management.service";
import type {
  DutyCoverageRequirement,
  DutyCoverageRequirementAuditResponse,
  DutyShiftTemplate,
  WorkReportDepartmentOption,
} from "../../types/work-management";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

interface CoverageFormState {
  departmentId: string;
  shiftTemplateId: string;
  dayOfWeek: string;
  requiredStaff: string;
  reportingLocation: string;
  effectiveFrom: string;
  effectiveUntil: string;
}

function localDateInput(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Ongoing";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T06:00:00Z`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The coverage requirement could not be completed.";
}

function initialForm(today: string): CoverageFormState {
  return {
    departmentId: "",
    shiftTemplateId: "",
    dayOfWeek: "1",
    requiredStaff: "1",
    reportingLocation: "",
    effectiveFrom: today,
    effectiveUntil: "",
  };
}

export function CoverageRequirementsPanel({
  accessToken,
  departments,
  shifts,
  from,
  to,
  onChanged,
}: {
  accessToken: string;
  departments: WorkReportDepartmentOption[];
  shifts: DutyShiftTemplate[];
  from: string;
  to: string;
  onChanged: () => void;
}) {
  const today = useMemo(() => localDateInput(), []);
  const [items, setItems] = useState<DutyCoverageRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CoverageFormState>(() => initialForm(today));
  const [audit, setAudit] = useState<DutyCoverageRequirementAuditResponse | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadRequirements = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await listDutyCoverageRequirements(accessToken, { from, to });
      setItems(response.items);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [accessToken, from, to]);

  useEffect(() => {
    void loadRequirements();
  }, [loadRequirements]);

  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === form.departmentId) ?? null,
    [departments, form.departmentId],
  );

  const availableShifts = useMemo(() => {
    if (!selectedDepartment) return shifts;
    return shifts.filter(
      (shift) =>
        (!shift.departmentId && !shift.divisionId) ||
        shift.departmentId === selectedDepartment.id ||
        (!shift.departmentId && shift.divisionId === selectedDepartment.divisionId),
    );
  }, [selectedDepartment, shifts]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...initialForm(today),
      departmentId: departments.length === 1 ? departments[0].id : "",
    });
    setAudit(null);
    setError("");
    setNotice("");
    setFormOpen(true);
  };

  const openEdit = (item: DutyCoverageRequirement) => {
    setEditingId(item.id);
    setForm({
      departmentId: item.department.id,
      shiftTemplateId: item.shift.id,
      dayOfWeek: String(item.dayOfWeek),
      requiredStaff: String(item.requiredStaff),
      reportingLocation: item.reportingLocation ?? "",
      effectiveFrom: item.effectiveFrom,
      effectiveUntil: item.effectiveUntil ?? "",
    });
    setAudit(null);
    setError("");
    setNotice("");
    setFormOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const requiredStaff = Number(form.requiredStaff);
    if (!form.departmentId || !form.shiftTemplateId) {
      setError("Select both a department and shift template.");
      return;
    }
    if (!Number.isInteger(requiredStaff) || requiredStaff < 1 || requiredStaff > 500) {
      setError("Required staff must be a whole number between 1 and 500.");
      return;
    }
    if (form.effectiveUntil && form.effectiveUntil < form.effectiveFrom) {
      setError("The effective-until date cannot be before the effective-from date.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        departmentId: form.departmentId,
        shiftTemplateId: form.shiftTemplateId,
        dayOfWeek: Number(form.dayOfWeek),
        requiredStaff,
        reportingLocation: form.reportingLocation.trim() || undefined,
        effectiveFrom: form.effectiveFrom,
        effectiveUntil: form.effectiveUntil || undefined,
      };
      if (editingId) {
        await updateDutyCoverageRequirement(accessToken, editingId, {
          ...payload,
          reportingLocation: form.reportingLocation.trim() || null,
          effectiveUntil: form.effectiveUntil || null,
        });
        setNotice("Coverage requirement updated successfully.");
      } else {
        await createDutyCoverageRequirement(accessToken, payload);
        setNotice("Coverage requirement created successfully.");
      }
      setFormOpen(false);
      setEditingId(null);
      await loadRequirements();
      onChanged();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const retire = async (item: DutyCoverageRequirement) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateDutyCoverageRequirement(accessToken, item.id, {
        effectiveUntil: today,
      });
      setNotice("Coverage requirement remains effective through today and retires afterward.");
      await loadRequirements();
      onChanged();
    } catch (retireError) {
      setError(errorMessage(retireError));
    } finally {
      setSaving(false);
    }
  };

  const openAudit = async (item: DutyCoverageRequirement) => {
    setAuditLoading(true);
    setError("");
    try {
      setAudit(await getDutyCoverageRequirementAudit(accessToken, item.id));
    } catch (auditError) {
      setError(errorMessage(auditError));
    } finally {
      setAuditLoading(false);
    }
  };

  return (
    <section className="work-report__panel work-report-e__coverage-panel">
      <header>
        <div>
          <span>Staffing target governance</span>
          <h2>Duty coverage requirements</h2>
          <p>
            Configure effective-dated minimum staffing by department, shift, weekday and optional location. These targets measure planned coverage, not attendance.
          </p>
        </div>
        <button type="button" onClick={openCreate}>New requirement</button>
      </header>

      {error && <div className="work-report-e__coverage-message work-report-e__coverage-message--error" role="alert">{error}</div>}
      {notice && <div className="work-report-e__coverage-message" role="status">{notice}</div>}

      {formOpen && (
        <form className="work-report-e__coverage-form" onSubmit={submit}>
          <div className="work-report-e__coverage-form-heading">
            <div>
              <strong>{editingId ? "Edit future coverage requirement" : "Create coverage requirement"}</strong>
              <span>Started historical definitions cannot be rewritten; retire and create a new effective period instead.</span>
            </div>
            <button type="button" onClick={() => setFormOpen(false)} aria-label="Close coverage form">×</button>
          </div>
          <div className="work-report-e__coverage-form-grid">
            <label><span>Department</span><select required value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value, shiftTemplateId: "" })}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code} · {department.name}</option>)}</select></label>
            <label><span>Shift</span><select required value={form.shiftTemplateId} onChange={(event) => setForm({ ...form, shiftTemplateId: event.target.value })}><option value="">Select shift</option>{availableShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}–{shift.endTime}</option>)}</select></label>
            <label><span>Weekday</span><select value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            <label><span>Required staff</span><input type="number" min={1} max={500} required value={form.requiredStaff} onChange={(event) => setForm({ ...form, requiredStaff: event.target.value })} /></label>
            <label><span>Reporting location</span><input type="text" maxLength={300} placeholder="Optional location-specific target" value={form.reportingLocation} onChange={(event) => setForm({ ...form, reportingLocation: event.target.value })} /></label>
            <label><span>Effective from</span><input type="date" required min={editingId ? undefined : today} value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} /></label>
            <label><span>Effective until</span><input type="date" min={form.effectiveFrom || today} value={form.effectiveUntil} onChange={(event) => setForm({ ...form, effectiveUntil: event.target.value })} /></label>
          </div>
          <div className="work-report-e__coverage-form-actions">
            <button type="button" onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Update requirement" : "Create requirement"}</button>
          </div>
        </form>
      )}

      <div className="work-report-e__coverage-table-wrap" aria-busy={loading}>
        <table>
          <thead><tr><th>Department</th><th>Shift and weekday</th><th>Target</th><th>Effective period</th><th>Governance</th><th /></tr></thead>
          <tbody>
            {items.map((item) => {
              const hasStarted = item.effectiveFrom <= today;
              // Effective-until is inclusive, so a requirement ending today still contributes to today's coverage.
              const isRetired = Boolean(item.effectiveUntil && item.effectiveUntil < today);
              const retiresToday = item.effectiveUntil === today;
              return (
                <tr key={item.id}>
                  <td><strong>{item.department.name}</strong><span>{item.department.code}</span><small>{item.department.division.name}</small></td>
                  <td><strong>{item.shift.name}</strong><span>{WEEKDAYS[item.dayOfWeek]}</span><small>{item.shift.startTime}–{item.shift.endTime}</small></td>
                  <td><strong>{item.requiredStaff} staff</strong><span>{item.reportingLocation ?? "All reporting locations"}</span></td>
                  <td><strong>{formatDate(item.effectiveFrom)}</strong><span>to {formatDate(item.effectiveUntil)}</span><small className={isRetired ? "retired" : "active"}>{isRetired ? "Retired" : retiresToday ? "Ends today" : hasStarted ? "Active" : "Future"}</small></td>
                  <td><strong>Updated by {item.updatedBy}</strong><span>{formatDateTime(item.updatedAt)}</span></td>
                  <td><div className="work-report-e__coverage-actions"><button type="button" onClick={() => void openAudit(item)} disabled={auditLoading}>History</button>{!hasStarted && <button type="button" onClick={() => openEdit(item)}>Edit</button>}{hasStarted && !isRetired && !retiresToday && <button type="button" className="danger" onClick={() => void retire(item)} disabled={saving}>Retire</button>}</div></td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && <tr><td colSpan={6}>No coverage requirements overlap this report period.</td></tr>}
            {loading && <tr><td colSpan={6}>Loading coverage requirements…</td></tr>}
          </tbody>
        </table>
      </div>

      {audit && (
        <div className="work-report-e__coverage-audit">
          <header><div><strong>Requirement history</strong><span>{audit.requirement.department.name} · {audit.requirement.shift.name} · {WEEKDAYS[audit.requirement.dayOfWeek]}</span></div><button type="button" onClick={() => setAudit(null)}>Close</button></header>
          <ol>{audit.activities.map((activity) => <li key={activity.id}><span>{activity.action}</span><strong>{activity.actor}</strong><time>{formatDateTime(activity.createdAt)}</time></li>)}</ol>
        </div>
      )}
    </section>
  );
}
