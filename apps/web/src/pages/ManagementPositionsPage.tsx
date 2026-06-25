import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  useNavigate,
} from "react-router";

import {
  useAuth,
} from "../context/AuthContext";

import {
  getAdminDepartments,
  getAdminDivisions,
} from "../services/admin-account.service";

import {
  createManagementPosition,
  getManagementPosition,
  listManagementPositions,
} from "../services/management-assignment.service";

import type {
  AdminDepartment,
  AdminDivision,
} from "../types/admin-account";

import type {
  ManagementPositionDetail,
  ManagementPositionListItem,
  ManagementPositionOccupancy,
  ManagementPositionType,
} from "../types/management-assignment";

interface CreatePositionForm {
  positionType: ManagementPositionType;
  divisionId: string;
  departmentId: string;
}

interface PositionFilters {
  positionType: "" | ManagementPositionType;
  divisionId: string;
  departmentId: string;
  occupancy: ManagementPositionOccupancy;
}

const initialCreateForm: CreatePositionForm = {
  positionType: "SENIOR_MANAGEMENT",
  divisionId: "",
  departmentId: "",
};

const initialFilters: PositionFilters = {
  positionType: "",
  divisionId: "",
  departmentId: "",
  occupancy: "ALL",
};

function getErrorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "The management position operation could not be completed.";
}

function formatLabel(
  value: string,
): string {
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

function formatDate(
  value: string | null | undefined,
): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function getPositionScope(
  position: ManagementPositionListItem,
): string {
  if (
    position.positionType ===
    "SENIOR_MANAGEMENT"
  ) {
    return position.division.name;
  }

  return position.department
    ? `${position.department.name} · ${position.division.name}`
    : position.division.name;
}

function getPositionState(
  position: ManagementPositionListItem,
): {
  className: string;
  label: string;
} {
  switch (position.occupancy) {
    case "INACTIVE":
      return {
        className: "inactive",
        label: "Inactive",
      };

    case "OCCUPIED":
      return {
        className: "occupied",
        label: "Occupied",
      };

    case "RESERVED":
      return {
        className: "reserved",
        label: "Reserved",
      };

    case "VACANT":
    default:
      return {
        className: "vacant",
        label: "Vacant",
      };
  }
}

export function ManagementPositionsPage() {
  const navigate = useNavigate();

  const {
    account,
    accessToken,
    logout,
  } = useAuth();

  const [
    positions,
    setPositions,
  ] = useState<
    ManagementPositionListItem[]
  >([]);

  const [
    divisions,
    setDivisions,
  ] = useState<AdminDivision[]>([]);

  const [
    departments,
    setDepartments,
  ] = useState<AdminDepartment[]>([]);

  const [
    filters,
    setFilters,
  ] = useState<PositionFilters>(
    initialFilters,
  );

  const [
    createForm,
    setCreateForm,
  ] = useState<CreatePositionForm>(
    initialCreateForm,
  );

  const [
    selectedPosition,
    setSelectedPosition,
  ] = useState<
    ManagementPositionDetail | null
  >(null);

  const [
    showCreateForm,
    setShowCreateForm,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    organizationLoading,
    setOrganizationLoading,
  ] = useState(true);

  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    loggingOut,
    setLoggingOut,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    success,
    setSuccess,
  ] = useState("");

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const createDepartments =
    useMemo(
      () =>
        departments.filter(
          (department) =>
            department.isActive &&
            department.division.isActive &&
            department.division.id ===
              createForm.divisionId,
        ),
      [
        createForm.divisionId,
        departments,
      ],
    );

  const filterDepartments =
    useMemo(
      () =>
        departments.filter(
          (department) =>
            department.isActive &&
            department.division.isActive &&
            (
              !filters.divisionId ||
              department.division.id ===
                filters.divisionId
            ),
        ),
      [
        departments,
        filters.divisionId,
      ],
    );

  const summary = useMemo(() => {
    const result = {
      total: positions.length,
      vacant: 0,
      reserved: 0,
      occupied: 0,
      inactive: 0,
    };

    positions.forEach((position) => {
      switch (position.occupancy) {
        case "RESERVED":
          result.reserved += 1;
          break;

        case "OCCUPIED":
          result.occupied += 1;
          break;

        case "INACTIVE":
          result.inactive += 1;
          break;

        case "VACANT":
        default:
          result.vacant += 1;
          break;
      }
    });

    return result;
  }, [positions]);

  useEffect(() => {
    if (!accessToken) {
      setOrganizationLoading(false);

      return;
    }

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
          setOrganizationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);

      return;
    }

    let active = true;

    setLoading(true);

    listManagementPositions(
      accessToken,
      {
        positionType:
          filters.positionType ||
          undefined,

        divisionId:
          filters.divisionId ||
          undefined,

        departmentId:
          filters.departmentId ||
          undefined,

        occupancy:
          filters.occupancy,
      },
    )
      .then((response) => {
        if (!active) {
          return;
        }

        setPositions(response.data);
        setError("");
      })
      .catch(
        (requestError: unknown) => {
          if (!active) {
            return;
          }

          setPositions([]);

          setError(
            getErrorMessage(
              requestError,
            ),
          );
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
  }, [
    accessToken,
    filters,
    refreshKey,
  ]);

  function updateFilter<
    Key extends keyof PositionFilters,
  >(
    key: Key,
    value: PositionFilters[Key],
  ): void {
    setFilters((current) => ({
      ...current,
      [key]: value,

      ...(key === "divisionId"
        ? {
            departmentId: "",
          }
        : {}),
    }));

    setError("");
    setSuccess("");
  }

  function selectCreateType(
    positionType:
      ManagementPositionType,
  ): void {
    setCreateForm((current) => ({
      ...current,
      positionType,

      departmentId:
        positionType ===
        "SENIOR_MANAGEMENT"
          ? ""
          : current.departmentId,
    }));

    setError("");
    setSuccess("");
  }

  function selectCreateDivision(
    divisionId: string,
  ): void {
    setCreateForm((current) => ({
      ...current,
      divisionId,
      departmentId: "",
    }));

    setError("");
    setSuccess("");
  }

  function validateCreateForm():
    string | null {
    if (!createForm.divisionId) {
      return "Select a division.";
    }

    if (
      createForm.positionType ===
        "TEAM_MANAGER" &&
      !createForm.departmentId
    ) {
      return "Select the department for the Team Manager position.";
    }

    return null;
  }

  async function handleCreatePosition(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (
      !accessToken ||
      submitting
    ) {
      return;
    }

    const validationError =
      validateCreateForm();

    if (validationError) {
      setError(validationError);

      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await createManagementPosition(
          accessToken,
          {
            positionType:
              createForm.positionType,

            divisionId:
              createForm.divisionId,

            departmentId:
              createForm.positionType ===
              "TEAM_MANAGER"
                ? createForm.departmentId
                : undefined,
          },
        );

      setSuccess(response.message);

      setCreateForm(
        initialCreateForm,
      );

      setShowCreateForm(false);

      setRefreshKey(
        (current) => current + 1,
      );
    } catch (
      requestError: unknown
    ) {
      setError(
        getErrorMessage(
          requestError,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function openPosition(
    positionId: string,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    setDetailLoading(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await getManagementPosition(
          accessToken,
          positionId,
        );

      setSelectedPosition(
        response.position,
      );
    } catch (
      requestError: unknown
    ) {
      setError(
        getErrorMessage(
          requestError,
        ),
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function refreshPositions(): void {
    setError("");
    setSuccess("");
    setLoading(true);

    setRefreshKey(
      (current) => current + 1,
    );
  }

  function clearFilters(): void {
    setFilters(initialFilters);
    setError("");
    setSuccess("");
  }

  async function handleLogout():
    Promise<void> {
    setLoggingOut(true);

    try {
      await logout();

      navigate(
        "/login",
        {
          replace: true,
        },
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="mgmt-page">
      <header className="mgmt-topbar">
        <div className="mgmt-brand">
          <div className="mgmt-logo">
            <img
              src="/nt-logo.png"
              alt="Nepal Telecom"
            />
          </div>

          <div>
            <strong>
              NT Message
            </strong>

            <span>
              Management Position Register
            </span>
          </div>
        </div>

        <div className="mgmt-top-actions">
          <div className="mgmt-account">
            <span>
              Signed in as
            </span>

            <strong>
              {account?.username ??
                "Super Admin"}
            </strong>
          </div>

          <button
            type="button"
            className="mgmt-back"
            onClick={() =>
              navigate("/super-admin")
            }
          >
            Back to dashboard
          </button>

          <button
            type="button"
            className="mgmt-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut
              ? "Signing out..."
              : "Sign out"}
          </button>
        </div>
      </header>

      <section className="mgmt-content">
        <header className="mgmt-heading">
          <div>
            <span>
              Organization authority
            </span>

            <h1>
              Management Positions
            </h1>

            <p>
              Maintain the official Senior Management and Team Manager
              positions used by account approval, reservation and activation.
            </p>
          </div>

          <button
            type="button"
            className="mgmt-create-open"
            onClick={() => {
              setShowCreateForm(
                (current) => !current,
              );

              setError("");
              setSuccess("");
            }}
            disabled={
              organizationLoading
            }
          >
            {showCreateForm
              ? "Close form"
              : "Create position"}
          </button>
        </header>

        {success && (
          <div
            className="mgmt-success"
            role="status"
          >
            {success}
          </div>
        )}

        {error && (
          <div
            className="mgmt-error"
            role="alert"
          >
            <span>
              {error}
            </span>

            <button
              type="button"
              onClick={refreshPositions}
            >
              Retry
            </button>
          </div>
        )}

        <section
          className="mgmt-summary"
          aria-label="Position summary"
        >
          <article>
            <span>
              Positions shown
            </span>

            <strong>
              {summary.total}
            </strong>
          </article>

          <article>
            <span>
              Vacant
            </span>

            <strong>
              {summary.vacant}
            </strong>
          </article>

          <article>
            <span>
              Reserved
            </span>

            <strong>
              {summary.reserved}
            </strong>
          </article>

          <article>
            <span>
              Occupied
            </span>

            <strong>
              {summary.occupied}
            </strong>
          </article>

          <article>
            <span>
              Inactive
            </span>

            <strong>
              {summary.inactive}
            </strong>
          </article>
        </section>

        {showCreateForm && (
          <form
            className="mgmt-create-form"
            onSubmit={
              handleCreatePosition
            }
          >
            <header>
              <span>
                Official position
              </span>

              <h2>
                Create management position
              </h2>
            </header>

            <div className="mgmt-form-grid">
              <label>
                <span>
                  Position type
                </span>

                <select
                  value={
                    createForm.positionType
                  }
                  onChange={(event) =>
                    selectCreateType(
                      event.target
                        .value as ManagementPositionType,
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
                </select>
              </label>

              <label>
                <span>
                  Division
                </span>

                <select
                  value={
                    createForm.divisionId
                  }
                  onChange={(event) =>
                    selectCreateDivision(
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
                        {division.name} (
                        {division.code})
                      </option>
                    ),
                  )}
                </select>
              </label>

              {createForm.positionType ===
                "TEAM_MANAGER" && (
                <label>
                  <span>
                    Department
                  </span>

                  <select
                    value={
                      createForm.departmentId
                    }
                    onChange={(event) =>
                      setCreateForm(
                        (current) => ({
                          ...current,

                          departmentId:
                            event.target.value,
                        }),
                      )
                    }
                    disabled={
                      submitting ||
                      !createForm.divisionId
                    }
                    required
                  >
                    <option value="">
                      Select department
                    </option>

                    {createDepartments.map(
                      (department) => (
                        <option
                          key={department.id}
                          value={
                            department.id
                          }
                        >
                          {department.name} (
                          {department.code})
                        </option>
                      ),
                    )}
                  </select>
                </label>
              )}
            </div>

            <footer>
              <button
                type="button"
                className="mgmt-secondary"
                onClick={() => {
                  setShowCreateForm(false);

                  setCreateForm(
                    initialCreateForm,
                  );

                  setError("");
                }}
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="mgmt-primary"
                disabled={
                  submitting ||
                  divisions.length === 0
                }
              >
                {submitting
                  ? "Creating..."
                  : "Create position"}
              </button>
            </footer>
          </form>
        )}

        <section className="mgmt-filter-card">
          <header>
            <div>
              <span>
                Position register
              </span>

              <h2>
                Search and filter
              </h2>
            </div>

            <button
              type="button"
              onClick={refreshPositions}
              disabled={loading}
            >
              {loading
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </header>

          <div className="mgmt-filters">
            <label>
              <span>
                Position type
              </span>

              <select
                value={
                  filters.positionType
                }
                onChange={(event) =>
                  updateFilter(
                    "positionType",
                    event.target
                      .value as
                      | ""
                      | ManagementPositionType,
                  )
                }
              >
                <option value="">
                  All types
                </option>

                <option value="SENIOR_MANAGEMENT">
                  Senior Management
                </option>

                <option value="TEAM_MANAGER">
                  Team Manager
                </option>
              </select>
            </label>

            <label>
              <span>
                Division
              </span>

              <select
                value={
                  filters.divisionId
                }
                onChange={(event) =>
                  updateFilter(
                    "divisionId",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  All divisions
                </option>

                {divisions.map(
                  (division) => (
                    <option
                      key={division.id}
                      value={division.id}
                    >
                      {division.name} (
                      {division.code})
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>
                Department
              </span>

              <select
                value={
                  filters.departmentId
                }
                onChange={(event) =>
                  updateFilter(
                    "departmentId",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  All departments
                </option>

                {filterDepartments.map(
                  (department) => (
                    <option
                      key={department.id}
                      value={department.id}
                    >
                      {department.name} (
                      {department.code})
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>
                Holder state
              </span>

              <select
                value={
                  filters.occupancy
                }
                onChange={(event) =>
                  updateFilter(
                    "occupancy",
                    event.target
                      .value as ManagementPositionOccupancy,
                  )
                }
              >
                <option value="ALL">
                  All positions
                </option>

                <option value="VACANT">
                  Vacant
                </option>

                <option value="RESERVED">
                  Reserved
                </option>

                <option value="OCCUPIED">
                  Occupied
                </option>

                <option value="INACTIVE">
                  Inactive
                </option>
              </select>
            </label>

            <button
              type="button"
              className="mgmt-clear"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>

          {loading && (
            <div className="mgmt-loading">
              <div className="spinner" />

              <p>
                Loading management positions...
              </p>
            </div>
          )}

          {!loading &&
            positions.length === 0 && (
            <div className="mgmt-empty">
              <strong>
                No positions found
              </strong>

              <p>
                No management positions match the selected filters.
              </p>
            </div>
          )}

          {!loading &&
            positions.length > 0 && (
            <div className="mgmt-table-wrap">
              <table className="mgmt-table">
                <thead>
                  <tr>
                    <th>
                      Position
                    </th>

                    <th>
                      Organization scope
                    </th>

                    <th>
                      Current holder
                    </th>

                    <th>
                      State
                    </th>

                    <th>
                      Created
                    </th>

                    <th>
                      Details
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {positions.map(
                    (position) => {
                      const state =
                        getPositionState(
                          position,
                        );

                      return (
                        <tr
                          key={position.id}
                        >
                          <td>
                            <strong>
                              {formatLabel(
                                position.positionType,
                              )}
                            </strong>

                            <small>
                              {position.id}
                            </small>
                          </td>

                          <td>
                            <strong>
                              {getPositionScope(
                                position,
                              )}
                            </strong>

                            <small>
                              Division:{" "}
                              {
                                position
                                  .division
                                  .code
                              }
                            </small>
                          </td>

                          <td>
                            {position.currentAssignment ? (
                              <>
                                <strong>
                                  {
                                    position
                                      .currentAssignment
                                      .employee
                                      .empName
                                  }
                                </strong>

                                <small>
                                  {
                                    position
                                      .currentAssignment
                                      .employee
                                      .empId
                                  }
                                  {" · "}
                                  {
                                    position
                                      .currentAssignment
                                      .employee
                                      .officialEmail
                                  }
                                </small>
                              </>
                            ) : position.reservedByAccountRequest ? (
                              <>
                                <strong>
                                  Reserved for{" "}
                                  {
                                    position
                                      .reservedByAccountRequest
                                      .empName
                                  }
                                </strong>

                                <small>
                                  {
                                    position
                                      .reservedByAccountRequest
                                      .empId
                                  }
                                  {" · "}
                                  {formatLabel(
                                    position
                                      .reservedByAccountRequest
                                      .status,
                                  )}
                                </small>
                              </>
                            ) : (
                              <span className="mgmt-no-holder">
                                No active assignment
                              </span>
                            )}
                          </td>

                          <td>
                            <span
                              className={`mgmt-badge ${state.className}`}
                            >
                              {state.label}
                            </span>
                          </td>

                          <td>
                            <strong>
                              {formatDate(
                                position.createdAt,
                              )}
                            </strong>

                            <small>
                              Updated{" "}
                              {formatDate(
                                position.updatedAt,
                              )}
                            </small>
                          </td>

                          <td>
                            <button
                              type="button"
                              className="mgmt-view"
                              onClick={() =>
                                openPosition(
                                  position.id,
                                )
                              }
                              disabled={
                                detailLoading
                              }
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      {detailLoading &&
        !selectedPosition && (
        <div
          className="mgmt-detail-backdrop"
          role="presentation"
        >
          <aside className="mgmt-detail-panel">
            <div className="mgmt-detail-loading">
              <div className="spinner" />

              <p>
                Loading position details...
              </p>
            </div>
          </aside>
        </div>
      )}

      {selectedPosition && (
        <div
          className="mgmt-detail-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelectedPosition(null);
            }
          }}
        >
          <aside
            className="mgmt-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="management-position-detail-title"
          >
            <header className="mgmt-detail-topbar">
              <div>
                <span>
                  Position details
                </span>

                <strong id="management-position-detail-title">
                  {formatLabel(
                    selectedPosition.positionType,
                  )}
                </strong>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedPosition(null)
                }
                aria-label="Close position details"
              >
                ×
              </button>
            </header>

            <div className="mgmt-detail-content">
              <section className="mgmt-detail-summary">
                <div>
                  <span>
                    Division
                  </span>

                  <strong>
                    {
                      selectedPosition
                        .division.name
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Department
                  </span>

                  <strong>
                    {selectedPosition
                      .department?.name ??
                      "Division-wide position"}
                  </strong>
                </div>

                <div>
                  <span>
                    Position state
                  </span>

                  <strong>
                    {
                      getPositionState(
                        selectedPosition,
                      ).label
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Assignment records
                  </span>

                  <strong>
                    {
                      selectedPosition
                        .assignments.length
                    }
                  </strong>
                </div>
              </section>

              <section className="mgmt-holder-card">
                <header>
                  <div>
                    <span>
                      Current holder
                    </span>

                    <h3>
                      {selectedPosition
                        .currentAssignment
                        ?.employee.empName ??
                        (selectedPosition
                          .reservedByAccountRequest
                          ? `Reserved for ${selectedPosition.reservedByAccountRequest.empName}`
                          : "No active assignment")}
                    </h3>
                  </div>

                  <span
                    className={`mgmt-badge ${
                      getPositionState(
                        selectedPosition,
                      ).className
                    }`}
                  >
                    {
                      getPositionState(
                        selectedPosition,
                      ).label
                    }
                  </span>
                </header>

                {selectedPosition.currentAssignment && (
                  <dl>
                    <div>
                      <dt>
                        Employee ID
                      </dt>

                      <dd>
                        {
                          selectedPosition
                            .currentAssignment
                            .employee.empId
                        }
                      </dd>
                    </div>

                    <div>
                      <dt>
                        Official email
                      </dt>

                      <dd>
                        {
                          selectedPosition
                            .currentAssignment
                            .employee
                            .officialEmail
                        }
                      </dd>
                    </div>

                    <div>
                      <dt>
                        Designation
                      </dt>

                      <dd>
                        {selectedPosition
                          .currentAssignment
                          .employee
                          .designation ??
                          "Not provided"}
                      </dd>
                    </div>

                    <div>
                      <dt>
                        Assigned
                      </dt>

                      <dd>
                        {formatDate(
                          selectedPosition
                            .currentAssignment
                            .startedAt,
                        )}
                      </dd>
                    </div>
                  </dl>
                )}
              </section>

              <section className="mgmt-action-card">
                <header>
                  <span>
                    Controlled workflow
                  </span>

                  <h3>
                    Holder changes
                  </h3>
                </header>

                <p className="mgmt-history-empty">
                  Management holders are created through the approved
                  account-request, reservation and activation workflow.
                  Manual replacement is not exposed on this page.
                </p>
              </section>

              <section className="mgmt-history-card">
                <header>
                  <span>
                    Position history
                  </span>

                  <h3>
                    Assignment timeline
                  </h3>
                </header>

                {selectedPosition.assignments.length ===
                0 ? (
                  <p className="mgmt-history-empty">
                    No assignment history is available.
                  </p>
                ) : (
                  <div className="mgmt-history-list">
                    {selectedPosition.assignments.map(
                      (assignment) => (
                        <article
                          key={assignment.id}
                        >
                          <div
                            className="mgmt-history-marker"
                            aria-hidden="true"
                          />

                          <div>
                            <header>
                              <strong>
                                {
                                  assignment
                                    .employee
                                    .empName
                                }
                              </strong>

                              <time>
                                {formatDate(
                                  assignment.startedAt,
                                )}
                              </time>
                            </header>

                            <p>
                              {
                                assignment
                                  .employee.empId
                              }
                              {" · "}
                              {
                                assignment
                                  .employee
                                  .officialEmail
                              }
                            </p>

                            <small>
                              {assignment.endedAt
                                ? `Ended ${formatDate(
                                    assignment.endedAt,
                                  )}`
                                : "Current assignment"}
                            </small>

                            {assignment.assignmentReason && (
                              <blockquote>
                                {
                                  assignment
                                    .assignmentReason
                                }
                              </blockquote>
                            )}

                            {assignment.endReason && (
                              <blockquote>
                                End reason:{" "}
                                {
                                  assignment
                                    .endReason
                                }
                              </blockquote>
                            )}
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
