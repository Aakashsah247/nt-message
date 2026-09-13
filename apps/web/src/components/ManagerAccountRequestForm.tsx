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
  intendedOrgUnitId: string;
}

const initialFormState: RequestFormState = {
  empId: "",
  empName: "",
  phoneNumber: "",
  officialEmail: "",
  designation: "",
  intendedOrgUnitId: "",
};

function getErrorMessage(error: unknown, t: TFunction<"requests">): string {
  return error instanceof Error
    ? error.message
    : t("form.errorFallback", { ns: "requests" });
}

export function ManagerAccountRequestForm({
  accessToken,
  requestContext,
  onSubmitted,
}: ManagerAccountRequestFormProps) {
  const { t } = useTranslation("requests");
  const [form, setForm] = useState<RequestFormState>(() => ({
    ...initialFormState,
    intendedOrgUnitId: requestContext.primaryOrgUnit.id,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedOrgUnit =
    requestContext.orgUnits.find(
      (orgUnit) => orgUnit.id === form.intendedOrgUnitId,
    ) ?? null;

  function updateField(field: keyof RequestFormState, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setSuccess("");
  }

  function resetForm(): void {
    if (submitting) return;
    setForm({
      ...initialFormState,
      intendedOrgUnitId: requestContext.primaryOrgUnit.id,
    });
    setError("");
    setSuccess("");
  }

  function validateForm(): string | null {
    const empId = form.empId.trim();
    const empName = form.empName.trim();
    const phoneNumber = form.phoneNumber.trim();
    const officialEmail = form.officialEmail.trim();

    if (empId.length < 2) return t("form.validationEmployeeIdShort");
    if (!/^[a-zA-Z0-9_-]+$/.test(empId)) {
      return t("form.validationEmployeeIdPattern");
    }
    if (empName.length < 2) return t("form.validationNameShort");
    if (!/^\+?[0-9]{7,20}$/.test(phoneNumber)) {
      return t("form.validationPhone");
    }
    if (!officialEmail.includes("@")) return t("form.validationEmail");
    if (!form.intendedOrgUnitId) return t("form.v3.validationOrgUnit");
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await createMyAccountRequest(accessToken, {
        officeId: requestContext.office.id,
        intendedOrgUnitId: form.intendedOrgUnitId,
        empId: form.empId.trim().toUpperCase(),
        empName: form.empName.trim().replace(/\s+/g, " "),
        phoneNumber: form.phoneNumber.trim(),
        officialEmail: form.officialEmail.trim().toLowerCase(),
        designation: form.designation.trim() || undefined,
      });

      setSuccess(response.message);
      resetForm();
      onSubmitted?.();
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="manager-request-form-card">
      <header className="manager-request-form-card__header">
        <div>
          <span>{t("form.new")}</span>
          <h2>{t("form.v3.title")}</h2>
          <p>{t("form.v3.description")}</p>
        </div>
        <div className="manager-request-form-card__role">
          <span className="manager-request-form-card__role-icon" aria-hidden="true">
            OU
          </span>
          <div>
            <small>{t("form.v3.officeScope")}</small>
            <strong>{requestContext.office.name}</strong>
            <p>{t("form.v3.officeScopeHelp")}</p>
          </div>
        </div>
      </header>

      {success && (
        <div
          className="manager-request-form-card__message manager-request-form-card__message--success"
          role="status"
        >
          {success}
        </div>
      )}
      {error && (
        <div
          className="manager-request-form-card__message manager-request-form-card__message--error"
          role="alert"
        >
          {error}
        </div>
      )}

      <form className="manager-request-form" onSubmit={handleSubmit}>
        <section className="manager-request-form__section">
          <header>
            <span>01</span>
            <div>
              <h3>{t("form.employeeIdentity")}</h3>
              <p>{t("form.officialRecordHelp")}</p>
            </div>
          </header>

          <div className="manager-request-form__grid">
            <label>
              <span>{t("common.employeeId")}</span>
              <input
                value={form.empId}
                onChange={(event) => updateField("empId", event.target.value)}
                placeholder={t("form.employeeIdPlaceholder")}
                required
              />
            </label>
            <label>
              <span>{t("form.employeeFullName")}</span>
              <input
                value={form.empName}
                onChange={(event) => updateField("empName", event.target.value)}
                placeholder={t("form.namePlaceholder")}
                required
              />
            </label>
            <label>
              <span>{t("common.phoneNumber")}</span>
              <input
                value={form.phoneNumber}
                onChange={(event) => updateField("phoneNumber", event.target.value)}
                placeholder={t("form.phonePlaceholder")}
                required
              />
            </label>
            <label>
              <span>{t("common.officialEmail")}</span>
              <input
                type="email"
                value={form.officialEmail}
                onChange={(event) => updateField("officialEmail", event.target.value)}
                placeholder={t("form.emailPlaceholder")}
                required
              />
            </label>
            <label>
              <span>{t("common.designation")}</span>
              <input
                value={form.designation}
                onChange={(event) => updateField("designation", event.target.value)}
                placeholder={t("form.optionalDesignation")}
              />
            </label>
          </div>
        </section>

        <section className="manager-request-form__section">
          <header>
            <span>02</span>
            <div>
              <h3>{t("form.organizationAssignment")}</h3>
              <p>{t("form.v3.orgUnitHelp")}</p>
            </div>
          </header>

          <div className="manager-request-form__grid">
            <label>
              <span>{t("form.v3.intendedOrgUnit")}</span>
              <select
                value={form.intendedOrgUnitId}
                onChange={(event) =>
                  updateField("intendedOrgUnitId", event.target.value)
                }
                required
              >
                <option value="">{t("form.v3.selectOrgUnit")}</option>
                {requestContext.orgUnits.map((orgUnit) => (
                  <option key={orgUnit.id} value={orgUnit.id}>
                    {orgUnit.name}
                  </option>
                ))}
              </select>
              <small>{selectedOrgUnit?.code ?? t("common.scopeUnavailable")}</small>
            </label>
          </div>

          <div className="manager-request-form__scope-summary">
            <div>
              <span>{t("form.v3.office")}</span>
              <strong>{requestContext.office.name}</strong>
              <small>{requestContext.office.code}</small>
            </div>
            <div>
              <span>{t("form.v3.intendedOrgUnit")}</span>
              <strong>{selectedOrgUnit?.name ?? t("common.notAssigned")}</strong>
              <small>{selectedOrgUnit?.code ?? t("common.scopeUnavailable")}</small>
            </div>
            <div>
              <span>{t("common.approvalAuthority")}</span>
              <strong>{t("common.superAdmin")}</strong>
              <small>{t("form.v3.activationSeparation")}</small>
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
