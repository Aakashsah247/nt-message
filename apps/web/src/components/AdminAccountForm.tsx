import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

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
): string {
  return error instanceof Error
    ? error.message
    : "The account could not be created.";
}

function formatRole(
  role: AdminCreatableRole,
): string {
  return role
    .toLowerCase()
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}


function getDepartmentLabel(
  role: AdminCreatableRole,
): string {
  switch (role) {
    case "SENIOR_MANAGEMENT":
      return "Home / Administrative Department";

    case "TEAM_MANAGER":
      return "Managed Department";

    case "EMPLOYEE":
      return "Working Department";
  }
}

function getDepartmentHelp(
  role: AdminCreatableRole,
): string {
  switch (role) {
    case "SENIOR_MANAGEMENT":
      return "Select the department used as this manager's administrative home.";

    case "TEAM_MANAGER":
      return "Select the department this Team Manager will manage.";

    case "EMPLOYEE":
      return "Select the department where this employee works.";
  }
}


export function AdminAccountForm({
  accessToken,
  onClose,
  onCreated,
}: AdminAccountFormProps) {
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
  }, [accessToken]);

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

  const departmentLabel =
    getDepartmentLabel(
      form.requestedRole,
    );

  const departmentHelp =
    getDepartmentHelp(
      form.requestedRole,
    );

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
      return "Enter the employee full name.";
    }

    if (
      !/^[a-zA-Z0-9_-]{2,50}$/.test(
        form.empId.trim(),
      )
    ) {
      return "Enter a valid employee ID.";
    }

    if (
      !/^\+?[0-9]{7,20}$/.test(
        form.phoneNumber.trim(),
      )
    ) {
      return "Enter a valid phone number.";
    }

    if (
      !form.officialEmail.includes("@")
    ) {
      return "Enter a valid official email.";
    }

    if (
      !form.divisionId ||
      !form.departmentId
    ) {
      return `Select a division and ${departmentLabel.toLowerCase()}.`;
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
        },
      );

      onCreated();
    } catch (
      requestError: unknown
    ) {
      setError(
        getErrorMessage(requestError),
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
            <span>
              Super Admin
            </span>

            <h2 id="acct-title">
              Create account identity
            </h2>

            <p>
              Create an approved employee identity for account activation.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close account form"
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

            <p>
              Loading organization data...
            </p>
          </div>
        ) : (
          <form
            className="acct-form"
            onSubmit={handleSubmit}
          >
            <div className="acct-grid">
              <label>
                <span>
                  Account role
                </span>

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
                  <option value="SENIOR_MANAGEMENT">
                    Senior Management
                  </option>

                  <option value="TEAM_MANAGER">
                    Team Manager
                  </option>

                  <option value="EMPLOYEE">
                    Employee
                  </option>
                </select>
              </label>

              <label>
                <span>
                  Employee full name
                </span>

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
                <span>
                  Employee ID
                </span>

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
                <span>
                  Phone number
                </span>

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
                <span>
                  Official email
                </span>

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
                <span>
                  Designation
                </span>

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
                <span>
                  Division
                </span>

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
                  <option value="">
                    Select division
                  </option>

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

              <label>
                <span>
                  {departmentLabel}
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
                  <option value="">
                    Select department
                  </option>

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
                  {departmentHelp}
                </small>
              </label>
            </div>

            <section className="acct-review">
              <span>
                Creating
              </span>

              <strong>
                {formatRole(
                  form.requestedRole,
                )}
              </strong>

              <small>
                The request becomes approved and the employee can begin OTP activation.
              </small>
            </section>

            <footer className="acct-actions">
              <button
                type="button"
                className="acct-cancel"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
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
                  ? "Creating..."
                  : "Create account"}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
