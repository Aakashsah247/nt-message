import { useMemo, useState } from "react";

import type { FormEvent } from "react";

import { createMyAccountRequest } from "../services/account-request.service";

import type { ManagerRequestContextResponse } from "../types/account-request";

interface ManagerAccountRequestFormProps {
  accessToken: string;
  requestContext: ManagerRequestContextResponse;
  onSubmitted?: () => void;
}

interface RequestFormState {
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation: string;
  departmentId: string;
}

const initialFormState: RequestFormState = {
  empId: "",
  empName: "",
  phoneNumber: "",
  officialEmail: "",
  designation: "",
  departmentId: "",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The account request could not be submitted.";
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ManagerAccountRequestForm({
  accessToken,
  requestContext,
  onSubmitted,
}: ManagerAccountRequestFormProps) {
  const [form, setForm] = useState<RequestFormState>(initialFormState);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const isSeniorManagement = requestContext.role === "SENIOR_MANAGEMENT";

  // Uses only departments returned by the authenticated manager scope.
  const selectedDepartment = useMemo(
    () =>
      requestContext.departments.find(
        (department) => department.id === form.departmentId,
      ) ?? null,
    [form.departmentId, requestContext.departments],
  );

  function updateField(field: keyof RequestFormState, value: string): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError("");
    setSuccess("");
  }

  // Validates employee information before sending it to the backend.
  function validateForm(): string | null {
    const empId = form.empId.trim();

    const empName = form.empName.trim();

    const phoneNumber = form.phoneNumber.trim();

    const officialEmail = form.officialEmail.trim();

    if (empId.length < 2) {
      return "Employee ID must contain at least 2 characters.";
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(empId)) {
      return "Employee ID may contain letters, numbers, underscores and hyphens only.";
    }

    if (empName.length < 2) {
      return "Employee name must contain at least 2 characters.";
    }

    if (!/^\+?[0-9]{7,20}$/.test(phoneNumber)) {
      return "Phone number must contain 7 to 20 digits and may start with +.";
    }

    if (!officialEmail.includes("@")) {
      return "Enter a valid official email address.";
    }

    if (isSeniorManagement && !form.departmentId) {
      return "Select the department for the Team Manager.";
    }

    return null;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);

      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      // Normalizes employee data before submitting the protected request.
      const response = await createMyAccountRequest(accessToken, {
        empId: form.empId.trim().toUpperCase(),

        empName: form.empName.trim().replace(/\s+/g, " "),

        phoneNumber: form.phoneNumber.trim(),

        officialEmail: form.officialEmail.trim().toLowerCase(),

        designation: form.designation.trim() || undefined,

        departmentId: isSeniorManagement ? form.departmentId : undefined,
      });

      setSuccess(response.message);

      setForm(initialFormState);

      onSubmitted?.();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="req-card">
      <header className="req-head">
        <div>
          <span>New account request</span>

          <h2>Request {formatRole(requestContext.requestedRole)}</h2>

          <p>
            Enter information exactly as it appears in the employee’s official
            employment record.
          </p>
        </div>

        <div className="req-role">
          <span>Requested role</span>

          <strong>{formatRole(requestContext.requestedRole)}</strong>
        </div>
      </header>

      {success && (
        <div className="req-ok" role="status">
          {success}
        </div>
      )}

      {error && (
        <div className="req-err" role="alert">
          {error}
        </div>
      )}

      <form className="req-form" onSubmit={handleSubmit}>
        <div className="req-grid">
          <label>
            <span>Employee full name</span>

            <input
              type="text"
              value={form.empName}
              onChange={(event) => updateField("empName", event.target.value)}
              minLength={2}
              maxLength={150}
              placeholder="Enter official full name"
              autoComplete="name"
              disabled={submitting}
              required
            />
          </label>

          <label>
            <span>Employee ID</span>

            <input
              type="text"
              value={form.empId}
              onChange={(event) =>
                updateField("empId", event.target.value.toUpperCase())
              }
              minLength={2}
              maxLength={50}
              placeholder="Example: NTC-1025"
              autoComplete="off"
              disabled={submitting}
              required
            />
          </label>

          <label>
            <span>Phone number</span>

            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(event) =>
                updateField("phoneNumber", event.target.value)
              }
              placeholder="+97798XXXXXXXX"
              autoComplete="tel"
              disabled={submitting}
              required
            />
          </label>

          <label>
            <span>Official email</span>

            <input
              type="email"
              value={form.officialEmail}
              onChange={(event) =>
                updateField("officialEmail", event.target.value)
              }
              maxLength={255}
              placeholder="employee@ntc.net.np"
              autoComplete="email"
              disabled={submitting}
              required
            />
          </label>

          <label>
            <span>Designation</span>

            <input
              type="text"
              value={form.designation}
              onChange={(event) =>
                updateField("designation", event.target.value)
              }
              maxLength={120}
              placeholder="Optional designation"
              disabled={submitting}
            />
          </label>

          {isSeniorManagement ? (
            <label>
              <span>Department</span>

              <select
                value={form.departmentId}
                onChange={(event) =>
                  updateField("departmentId", event.target.value)
                }
                disabled={submitting}
                required
              >
                <option value="">Select department</option>

                {requestContext.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="req-fixed">
              <span>Assigned department</span>

              <strong>
                {requestContext.scope.department?.name ?? "Not assigned"}
              </strong>

              <small>Department is fixed by your account scope.</small>
            </div>
          )}
        </div>

        <section className="req-review">
          <div>
            <span>Division</span>

            <strong>{requestContext.scope.division.name}</strong>
          </div>

          <div>
            <span>Department</span>

            <strong>
              {isSeniorManagement
                ? (selectedDepartment?.name ?? "Select a department")
                : (requestContext.scope.department?.name ?? "Not assigned")}
            </strong>
          </div>

          <div>
            <span>Account role</span>

            <strong>{formatRole(requestContext.requestedRole)}</strong>
          </div>
        </section>

        <footer className="req-foot">
          <p>
            Every request is reviewed by the Super Admin before account
            activation is allowed.
          </p>

          <button type="submit" className="req-btn" disabled={submitting}>
            {submitting ? "Submitting request..." : "Submit account request"}
          </button>
        </footer>
      </form>
    </article>
  );
}
