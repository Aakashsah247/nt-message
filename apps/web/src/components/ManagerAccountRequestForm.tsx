import { useState } from "react";
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
  const selectedDepartment =
    requestContext.departments.find(
      (department) => department.id === form.departmentId,
    ) ?? null;

  function updateField(field: keyof RequestFormState, value: string): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setError("");
    setSuccess("");
  }

  function resetForm(): void {
    if (submitting) {
      return;
    }

    setForm(initialFormState);
    setError("");
    setSuccess("");
  }

  // Validate identity fields before the protected request reaches the backend.
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
      return "Select the department this Team Manager will manage.";
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
      // Normalize employee data consistently before submitting the protected request.
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

  const requestedRole = formatRole(requestContext.requestedRole);
  const formTitle = isSeniorManagement
    ? "Request a Team Manager"
    : "Request an Employee";
  const formDescription = isSeniorManagement
    ? "Enter the approved leadership candidate and select the department they will manage."
    : "Enter the approved employee identity for onboarding inside your assigned department.";

  return (
    <article className="manager-request-form-card">
      <header className="manager-request-form-card__header">
        <div>
          <span>New account request</span>
          <h2>{formTitle}</h2>
          <p>{formDescription}</p>
        </div>

        <div
          className={`manager-request-form-card__role manager-request-form-card__role--${requestContext.requestedRole
            .toLowerCase()
            .replaceAll("_", "-")}`}
        >
          <span className="manager-request-form-card__role-icon" aria-hidden="true">
            {isSeniorManagement ? "TM" : "EM"}
          </span>
          <div>
            <small>Requested role</small>
            <strong>{requestedRole}</strong>
            <p>
              {isSeniorManagement
                ? "Division-approved leadership onboarding"
                : "Department employee onboarding"}
            </p>
          </div>
        </div>
      </header>

      {success && (
        <div className="manager-request-form-card__message manager-request-form-card__message--success" role="status">
          {success}
        </div>
      )}

      {error && (
        <div className="manager-request-form-card__message manager-request-form-card__message--error" role="alert">
          {error}
        </div>
      )}

      <form className="manager-request-form" onSubmit={handleSubmit}>
        <section className="manager-request-form__section">
          <header>
            <span>01</span>
            <div>
              <h3>{isSeniorManagement ? "Leadership candidate" : "Employee identity"}</h3>
              <p>Use the same information recorded in the official employment record.</p>
            </div>
          </header>

          <div className="manager-request-form__grid">
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
                placeholder="9801234567"
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
                  updateField("officialEmail", event.target.value.toLowerCase())
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
                <span>Managed department</span>
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
                <small>The Team Manager position is controlled by the selected department.</small>
              </label>
            ) : (
              <div className="manager-request-form__fixed-field">
                <span>Assigned department</span>
                <strong>
                  {requestContext.scope.department?.name ?? "Not assigned"}
                </strong>
                <small>Department is fixed by your authenticated scope.</small>
              </div>
            )}
          </div>
        </section>

        <section className="manager-request-form__section">
          <header>
            <span>02</span>
            <div>
              <h3>Organizational assignment</h3>
              <p>Role and organizational scope are enforced by the backend after submission.</p>
            </div>
          </header>

          <div className="manager-request-form__review">
            <div>
              <span>Division</span>
              <strong>{requestContext.scope.division.name}</strong>
              <small>{requestContext.scope.division.code}</small>
            </div>

            <div>
              <span>Department</span>
              <strong>
                {isSeniorManagement
                  ? selectedDepartment?.name ?? "Select a department"
                  : requestContext.scope.department?.name ?? "Not assigned"}
              </strong>
              <small>
                {isSeniorManagement
                  ? selectedDepartment?.code ?? "Required for Team Manager authority"
                  : requestContext.scope.department?.code ?? "Scope unavailable"}
              </small>
            </div>

            <div>
              <span>Account role</span>
              <strong>{requestedRole}</strong>
              <small>Approval authority: Super Admin</small>
            </div>
          </div>
        </section>

        <footer className="manager-request-form__footer">
          <p>
            The person cannot activate the account until the Super Admin approves this request.
          </p>

          <div>
            <button
              type="button"
              className="manager-request-form__clear"
              onClick={resetForm}
              disabled={submitting}
            >
              Clear form
            </button>

            <button
              type="submit"
              className="manager-request-form__submit"
              disabled={submitting}
            >
              {submitting ? "Submitting request..." : "Submit account request"}
            </button>
          </div>
        </footer>
      </form>
    </article>
  );
}
