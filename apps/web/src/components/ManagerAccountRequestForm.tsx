import { useState } from "react";
import type { FormEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

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

function getErrorMessage(error: unknown, t: TFunction<"requests">): string {
  return error instanceof Error
    ? error.message
    : t("form.errorFallback", { ns: "requests" });
}

function fallbackFormatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRole(role: string, t: TFunction<"requests">): string {
  return t(`values.${role}`, {
    ns: "requests",
    defaultValue: fallbackFormatRole(role),
  });
}

export function ManagerAccountRequestForm({
  accessToken,
  requestContext,
  onSubmitted,
}: ManagerAccountRequestFormProps) {
  const { t } = useTranslation("requests");
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
      return t("form.validationEmployeeIdShort");
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(empId)) {
      return t("form.validationEmployeeIdPattern");
    }

    if (empName.length < 2) {
      return t("form.validationNameShort");
    }

    if (!/^\+?[0-9]{7,20}$/.test(phoneNumber)) {
      return t("form.validationPhone");
    }

    if (!officialEmail.includes("@")) {
      return t("form.validationEmail");
    }

    if (isSeniorManagement && !form.departmentId) {
      return t("form.validationManagedDepartment");
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
      setError(getErrorMessage(requestError, t));
    } finally {
      setSubmitting(false);
    }
  }

  const requestedRole = formatRole(requestContext.requestedRole, t);
  const formTitle = isSeniorManagement
    ? t("form.requestTeamManager")
    : t("form.requestEmployee");
  const formDescription = isSeniorManagement
    ? t("form.teamManagerDescription")
    : t("form.employeeDescription");

  return (
    <article className="manager-request-form-card">
      <header className="manager-request-form-card__header">
        <div>
          <span>{t("form.new")}</span>
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
            <small>{t("common.requestedRole")}</small>
            <strong>{requestedRole}</strong>
            <p>
              {isSeniorManagement
                ? t("form.divisionLeadership")
                : t("form.departmentOnboarding")}
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
              <h3>{isSeniorManagement ? t("form.leadershipCandidate") : t("form.employeeIdentity")}</h3>
              <p>{t("form.officialRecordHelp")}</p>
            </div>
          </header>

          <div className="manager-request-form__grid">
            <label>
              <span>{t("form.employeeFullName")}</span>
              <input
                type="text"
                value={form.empName}
                onChange={(event) => updateField("empName", event.target.value)}
                minLength={2}
                maxLength={150}
                placeholder={t("form.namePlaceholder")}
                autoComplete="name"
                disabled={submitting}
                required
              />
            </label>

            <label>
              <span>{t("common.employeeId")}</span>
              <input
                type="text"
                value={form.empId}
                onChange={(event) =>
                  updateField("empId", event.target.value.toUpperCase())
                }
                minLength={2}
                maxLength={50}
                placeholder={t("form.employeeIdPlaceholder")}
                autoComplete="off"
                disabled={submitting}
                required
              />
            </label>

            <label>
              <span>{t("common.phoneNumber")}</span>
              <input
                type="tel"
                value={form.phoneNumber}
                onChange={(event) =>
                  updateField("phoneNumber", event.target.value)
                }
                placeholder={t("form.phonePlaceholder")}
                autoComplete="tel"
                disabled={submitting}
                required
              />
            </label>

            <label>
              <span>{t("common.officialEmail")}</span>
              <input
                type="email"
                value={form.officialEmail}
                onChange={(event) =>
                  updateField("officialEmail", event.target.value.toLowerCase())
                }
                maxLength={255}
                placeholder={t("form.emailPlaceholder")}
                autoComplete="email"
                disabled={submitting}
                required
              />
            </label>

            <label>
              <span>{t("common.designation")}</span>
              <input
                type="text"
                value={form.designation}
                onChange={(event) =>
                  updateField("designation", event.target.value)
                }
                maxLength={120}
                placeholder={t("form.optionalDesignation")}
                disabled={submitting}
              />
            </label>

            {isSeniorManagement ? (
              <label>
                <span>{t("form.managedDepartment")}</span>
                <select
                  value={form.departmentId}
                  onChange={(event) =>
                    updateField("departmentId", event.target.value)
                  }
                  disabled={submitting}
                  required
                >
                  <option value="">{t("form.selectDepartment")}</option>
                  {requestContext.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name} ({department.code})
                    </option>
                  ))}
                </select>
                <small>{t("form.teamManagerPositionHelp")}</small>
              </label>
            ) : (
              <div className="manager-request-form__fixed-field">
                <span>{t("common.assignedDepartment")}</span>
                <strong>
                  {requestContext.scope.department?.name ?? t("common.notAssigned")}
                </strong>
                <small>{t("form.departmentFixed")}</small>
              </div>
            )}
          </div>
        </section>

        <section className="manager-request-form__section">
          <header>
            <span>02</span>
            <div>
              <h3>{t("form.organizationAssignment")}</h3>
              <p>{t("form.scopeEnforced")}</p>
            </div>
          </header>

          <div className="manager-request-form__review">
            <div>
              <span>{t("common.division")}</span>
              <strong>{requestContext.scope.division.name}</strong>
              <small>{requestContext.scope.division.code}</small>
            </div>

            <div>
              <span>{t("common.department")}</span>
              <strong>
                {isSeniorManagement
                  ? selectedDepartment?.name ?? t("form.selectDepartment")
                  : requestContext.scope.department?.name ?? t("common.notAssigned")}
              </strong>
              <small>
                {isSeniorManagement
                  ? selectedDepartment?.code ?? t("form.requiredForTeamManager")
                  : requestContext.scope.department?.code ?? t("common.scopeUnavailable")}
              </small>
            </div>

            <div>
              <span>{t("common.role")}</span>
              <strong>{requestedRole}</strong>
              <small>{t("common.approvalAuthority")}</small>
            </div>
          </div>
        </section>

        <footer className="manager-request-form__footer">
          <p>{t("form.activationNote")}</p>

          <div>
            <button
              type="button"
              className="manager-request-form__clear"
              onClick={resetForm}
              disabled={submitting}
            >
              {t("form.clear")}
            </button>

            <button
              type="submit"
              className="manager-request-form__submit"
              disabled={submitting}
            >
              {submitting ? t("common.submitting") : t("form.submit")}
            </button>
          </div>
        </footer>
      </form>
    </article>
  );
}
