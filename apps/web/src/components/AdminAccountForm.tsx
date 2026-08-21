import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import type {
  FormEvent,
} from "react";
import type { TFunction } from "i18next";

import {
  createAdminAccount,
  getAdminDepartments,
  getAdminDivisions,
} from "../services/admin-account.service";

import type {
  AdminCreatableRole,
  AdminDepartment,
  AdminDivision,
  CreateAdminAccountInput,
} from "../types/admin-account";

interface AdminAccountFormProps {
  accessToken: string;
  onClose: () => void;
  onCreated: () => void;
}

const initialForm: CreateAdminAccountInput = {
  empId: "",
  empName: "",
  phoneNumber: "",
  officialEmail: "",
  designation: "",
  requestedRole: "SENIOR_MANAGEMENT",
  divisionId: "",
  departmentId: "",
};

function getErrorMessage(
  error: unknown,
  t: TFunction,
): string {
  return error instanceof Error
    ? error.message
    : t("adminForm.errorFallback", { ns: "requests" });
}

function formatRole(
  role: AdminCreatableRole,
  t: TFunction,
): string {
  return t(`values.${role}`, {
    ns: "requests",
    defaultValue: role,
  });
}




export function AdminAccountForm({
  accessToken,
  onClose,
  onCreated,
}: AdminAccountFormProps) {
  const { t } = useTranslation("requests");
  const [form, setForm] =
    useState<CreateAdminAccountInput>(
      initialForm,
    );

  const [divisions, setDivisions] =
    useState<AdminDivision[]>([]);

  const [departments, setDepartments] =
    useState<AdminDepartment[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  // Load active organization choices from the protected backend.
  useEffect(() => {
    let active = true;

    Promise.all([
      getAdminDivisions(accessToken),
      getAdminDepartments(accessToken),
    ])
      .then(
        ([
          divisionResponse,
          departmentResponse,
        ]) => {
          if (!active) {
            return;
          }

          setDivisions(
            divisionResponse.data.filter(
              (division) =>
                division.isActive,
            ),
          );

          setDepartments(
            departmentResponse.data.filter(
              (department) =>
                department.isActive &&
                department.division.isActive,
            ),
          );


          setError("");
        },
      )
      .catch(
        (requestError: unknown) => {
          if (active) {
            setError(
              getErrorMessage(
                requestError,
                t,
              ),
            );
          }
        },
      )
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, t]);

  useEffect(() => {
    function closeWithEscape(
      event: KeyboardEvent,
    ): void {
      if (
        event.key === "Escape" &&
        !submitting
      ) {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      closeWithEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        closeWithEscape,
      );
    };
  }, [
    onClose,
    submitting,
  ]);

  const availableDepartments =
    useMemo(
      () =>
        departments.filter(
          (department) =>
            department.division.id ===
            form.divisionId,
        ),
      [
        departments,
        form.divisionId,
      ],
    );

  const isManagementRole =
    form.requestedRole !== "EMPLOYEE";

  const requiresDepartment =
    form.requestedRole !==
    "SENIOR_MANAGEMENT";

  function updateField(
    field:
      | "empId"
      | "empName"
      | "phoneNumber"
      | "officialEmail"
      | "designation",
    value: string,
  ): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError("");
  }

  // Changing role clears any department selected for the previous role.
  function selectRole(
    requestedRole:
      AdminCreatableRole,
  ): void {
    setForm((current) => ({
      ...current,
      requestedRole,
      departmentId: "",
    }));

    setError("");
  }

  function selectDivision(
    divisionId: string,
  ): void {
    setForm((current) => ({
      ...current,
      divisionId,
      departmentId: "",
    }));

    setError("");
  }

  function validateForm():
    string | null {
    if (
      form.empName.trim().length < 2
    ) {
      return t("adminForm.validationName");
    }

    if (
      !/^[a-zA-Z0-9_-]{2,50}$/.test(
        form.empId.trim(),
      )
    ) {
      return t("adminForm.validationId");
    }

    if (
      !/^\+?[0-9]{7,20}$/.test(
        form.phoneNumber.trim(),
      )
    ) {
      return t("adminForm.validationPhone");
    }

    if (
      !form.officialEmail.includes("@")
    ) {
      return t("adminForm.validationEmail");
    }

    if (!form.divisionId) {
      return t("adminForm.validationDivision");
    }

    if (
      requiresDepartment &&
      !form.departmentId
    ) {
      return t("adminForm.validationDepartment");
    }


    return null;
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);

      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // The employee creates their own password during OTP activation.
      await createAdminAccount(
        accessToken,
        {
          ...form,

          empId:
            form.empId
              .trim()
              .toUpperCase(),

          empName:
            form.empName
              .trim()
              .replace(/\s+/g, " "),

          phoneNumber:
            form.phoneNumber.trim(),

          officialEmail:
            form.officialEmail
              .trim()
              .toLowerCase(),

          designation:
            form.designation?.trim() ||
            undefined,

          departmentId:
            requiresDepartment
              ? form.departmentId
              : undefined,
        },
      );

      onCreated();
    } catch (
      requestError: unknown
    ) {
      setError(
        getErrorMessage(requestError, t),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="acct-back"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !submitting
        ) {
          onClose();
        }
      }}
    >
      <section
        className="acct-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acct-title"
      >
        <header className="acct-head">
          <div>
            <span>{t("adminForm.eyebrow")}</span>

            <h2 id="acct-title">{t("adminForm.title")}</h2>

            <p>{t("adminForm.description")}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={t("adminForm.close")}
          >
            ×
          </button>
        </header>

        {error && (
          <div
            className="acct-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="acct-load">
            <div className="spinner" />

            <p>{t("adminForm.loadingOrganization")}</p>
          </div>
        ) : (
          <form
            className="acct-form"
            onSubmit={handleSubmit}
          >
            <div className="acct-grid">
              <label>
                <span>{t("adminForm.accessRole")}</span>

                <select
                  value={
                    form.requestedRole
                  }
                  onChange={(event) =>
                    selectRole(
                      event.target
                        .value as AdminCreatableRole,
                    )
                  }
                  disabled={submitting}
                >
                  <option value="SENIOR_MANAGEMENT">{t("values.SENIOR_MANAGEMENT")}</option>

                  <option value="TEAM_MANAGER">{t("values.TEAM_MANAGER")}</option>

                  <option value="EMPLOYEE">{t("values.EMPLOYEE")}</option>
                </select>
              </label>

              <label>
                <span>{t("adminForm.fullName")}</span>

                <input
                  type="text"
                  value={form.empName}
                  onChange={(event) =>
                    updateField(
                      "empName",
                      event.target.value,
                    )
                  }
                  maxLength={150}
                  required
                />
              </label>

              <label>
                <span>{t("adminForm.employeeId")}</span>

                <input
                  type="text"
                  value={form.empId}
                  onChange={(event) =>
                    updateField(
                      "empId",
                      event.target.value
                        .toUpperCase(),
                    )
                  }
                  maxLength={50}
                  required
                />
              </label>

              <label>
                <span>{t("adminForm.phone")}</span>

                <input
                  type="tel"
                  value={
                    form.phoneNumber
                  }
                  onChange={(event) =>
                    updateField(
                      "phoneNumber",
                      event.target.value,
                    )
                  }
                  required
                />
              </label>

              <label>
                <span>{t("adminForm.email")}</span>

                <input
                  type="email"
                  value={
                    form.officialEmail
                  }
                  onChange={(event) =>
                    updateField(
                      "officialEmail",
                      event.target.value,
                    )
                  }
                  maxLength={255}
                  required
                />
              </label>

              <label>
                <span>{t("adminForm.designation")}</span>

                <input
                  type="text"
                  value={
                    form.designation
                  }
                  onChange={(event) =>
                    updateField(
                      "designation",
                      event.target.value,
                    )
                  }
                  maxLength={120}
                />
              </label>

              <label>
                <span>{t("adminForm.division")}</span>

                <select
                  value={
                    form.divisionId
                  }
                  onChange={(event) =>
                    selectDivision(
                      event.target.value,
                    )
                  }
                  disabled={submitting}
                  required
                >
                  <option value="">{t("adminForm.selectDivision")}</option>

                  {divisions.map(
                    (division) => (
                      <option
                        key={division.id}
                        value={division.id}
                      >
                        {division.name} ({division.code})
                      </option>
                    ),
                  )}
                </select>
              </label>

              {requiresDepartment && (
                <label>
                  <span>
                    {form.requestedRole ===
                    "TEAM_MANAGER"
                      ? t("adminForm.managedDepartment")
                      : t("adminForm.workingDepartment")}
                  </span>

                  <select
                    value={
                      form.departmentId
                    }
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,

                          departmentId:
                            event.target.value,
                        }),
                      )
                    }
                    disabled={
                      !form.divisionId ||
                      submitting
                    }
                    required
                  >
                    <option value="">{t("adminForm.selectDepartment")}</option>

                    {availableDepartments.map(
                      (department) => (
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

                  <small className="acct-help">
                    {form.requestedRole ===
                    "TEAM_MANAGER"
                      ? t("adminForm.managedHelp")
                      : t("adminForm.workingHelp")}
                  </small>
                </label>
              )}
            </div>

            <section className="acct-review">
              <span>{t("adminForm.reviewEyebrow")}</span>

              <strong>
                {formatRole(
                  form.requestedRole,
                  t,
                )}
              </strong>

              <small>
                {form.requestedRole ===
                "SENIOR_MANAGEMENT"
                  ? t("adminForm.seniorPositionHelp")
                  : isManagementRole
                    ? t("adminForm.teamPositionHelp")
                    : t("adminForm.employeeHelp")}
              </small>
            </section>

            <footer className="acct-actions">
              <button
                type="button"
                className="acct-cancel"
                onClick={onClose}
                disabled={submitting}
              >
                {t("common.cancel")}
              </button>

              <button
                type="submit"
                className="acct-save"
                disabled={
                  submitting ||
                  divisions.length === 0
                }
              >
                {submitting
                  ? t("adminForm.creating")
                  : t("adminForm.create")}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
