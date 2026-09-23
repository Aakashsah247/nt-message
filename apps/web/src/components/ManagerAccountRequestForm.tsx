import { useState } from "react";
import type { FormEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { createMyAccountRequest } from "../services/account-request.service";
import {
  AccountRequestHierarchySelector,
} from "./AccountRequestHierarchySelector";
import {
  getDefaultAccountRequestTargetId,
} from "../utils/account-request-hierarchy";
import type {
  AccountRequestOrganizationRole,
  ManagerRequestContextResponse,
} from "../types/account-request";

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
  requestedOrganizationRole: AccountRequestOrganizationRole;
}

function getErrorMessage(error: unknown, t: TFunction<"requests">): string {
  return error instanceof Error ? error.message : t("form.errorFallback");
}


export function ManagerAccountRequestForm({
  accessToken,
  requestContext,
  onSubmitted,
}: ManagerAccountRequestFormProps) {
  const { t } = useTranslation("requests");
  const defaultOrgUnitId = getDefaultAccountRequestTargetId(requestContext);

  const [form, setForm] = useState<RequestFormState>({
    empId: "",
    empName: "",
    phoneNumber: "",
    officialEmail: "",
    designation: "",
    intendedOrgUnitId: defaultOrgUnitId,
    requestedOrganizationRole: "EMPLOYEE",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedOrgUnit = requestContext.orgUnits.find(
    (orgUnit) => orgUnit.id === form.intendedOrgUnitId,
  );
  const canRequestHead = Boolean(selectedOrgUnit?.canRequestHead);

  function updateField<K extends keyof RequestFormState>(
    field: K,
    value: RequestFormState[K],
  ): void {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "intendedOrgUnitId") {
        const nextUnit = requestContext.orgUnits.find(
          (unit) => unit.id === value,
        );
        if (!nextUnit?.canRequestHead) {
          next.requestedOrganizationRole = "EMPLOYEE";
        }
      }
      return next;
    });
    setError("");
    setSuccess("");
  }

  function resetForm(): void {
    setForm({
      empId: "",
      empName: "",
      phoneNumber: "",
      officialEmail: "",
      designation: "",
      intendedOrgUnitId: defaultOrgUnitId,
      requestedOrganizationRole: "EMPLOYEE",
    });
    setError("");
    setSuccess("");
  }

  function validateForm(): string | null {
    if (form.empId.trim().length < 2) return t("form.validationEmployeeIdShort");
    if (!/^[a-zA-Z0-9_-]+$/.test(form.empId.trim())) {
      return t("form.validationEmployeeIdPattern");
    }
    if (form.empName.trim().length < 2) return t("form.validationNameShort");
    if (!/^(?:9\d{9}|9779\d{9}|\+9779\d{9})$/.test(form.phoneNumber.trim())) {
      return t("form.validationPhoneNepal");
    }
    if (!form.officialEmail.includes("@")) return t("form.validationEmail");
    if (!form.intendedOrgUnitId) return t("form.v3.validationOrgUnit");
    if (form.requestedOrganizationRole === "ORG_UNIT_HEAD" && !canRequestHead) {
      return t("form.v3.headNotAvailable");
    }
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
        requestedOrganizationRole: form.requestedOrganizationRole,
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
          <h2>{t("form.v3.simpleTitle")}</h2>
          <p>{t("form.v3.simpleDescription")}</p>
        </div>
      </header>

      {success && <div className="manager-request-form-card__message manager-request-form-card__message--success" role="status">{success}</div>}
      {error && <div className="manager-request-form-card__message manager-request-form-card__message--error" role="alert">{error}</div>}

      <form className="manager-request-form manager-request-form--simple" onSubmit={handleSubmit}>
        <div className="manager-request-form__grid">
          <label><span>{t("common.employeeId")}</span><input value={form.empId} onChange={(event) => updateField("empId", event.target.value)} placeholder={t("form.employeeIdPlaceholder")} required /></label>
          <label><span>{t("form.employeeFullName")}</span><input value={form.empName} onChange={(event) => updateField("empName", event.target.value)} placeholder={t("form.namePlaceholder")} required /></label>
          <label><span>{t("common.phoneNumber")}</span><input value={form.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)} placeholder="98XXXXXXXX" required /></label>
          <label><span>{t("common.officialEmail")}</span><input type="email" value={form.officialEmail} onChange={(event) => updateField("officialEmail", event.target.value)} placeholder={t("form.emailPlaceholder")} required /></label>
          <label><span>{t("common.designation")}</span><input value={form.designation} onChange={(event) => updateField("designation", event.target.value)} placeholder={t("form.optionalDesignation")} /></label>
          <AccountRequestHierarchySelector
            units={requestContext.orgUnits}
            value={form.intendedOrgUnitId}
            onChange={(orgUnitId) => updateField("intendedOrgUnitId", orgUnitId)}
            disabled={submitting}
          />
          <label>
            <span>{t("form.v3.organizationRole")}</span>
            <select value={form.requestedOrganizationRole} onChange={(event) => updateField("requestedOrganizationRole", event.target.value as AccountRequestOrganizationRole)}>
              <option value="EMPLOYEE">{t("form.v3.employeeRole")}</option>
              {canRequestHead && <option value="ORG_UNIT_HEAD">{selectedOrgUnit?.headTitle ?? t("form.v3.unitHeadRole")}</option>}
            </select>
            {selectedOrgUnit?.hasCurrentHead && <small>{t("form.v3.currentHeadExists")}</small>}
          </label>
        </div>

        <footer className="manager-request-form__footer manager-request-form__footer--simple">
          <p>{t("form.v3.approvalHelp")}</p>
          <div>
            <button type="button" className="manager-request-form__clear" onClick={resetForm} disabled={submitting}>{t("form.clear")}</button>
            <button type="submit" className="manager-request-form__submit" disabled={submitting}>{submitting ? t("common.submitting") : t("form.v3.sendRequest")}</button>
          </div>
        </footer>
      </form>
    </article>
  );
}
