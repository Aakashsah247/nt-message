import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useAuth,
} from "../context/AuthContext";

import {
  getAdminDepartments,
  getAdminDivisions,
} from "../services/admin-account.service";

import {
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

interface PositionFilters {
  positionType: "" | ManagementPositionType;
  divisionId: string;
  departmentId: string;
  occupancy: ManagementPositionOccupancy;
}

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

function getPositionTitle(
  position: ManagementPositionListItem,
): string {
  if (
    position.positionType ===
    "SENIOR_MANAGEMENT"
  ) {
    return `${position.division.name} Senior Management`;
  }

  return position.department
    ? `${position.department.name} Team Manager`
    : "Team Manager Position";
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

function getInitials(
  value: string,
): string {
  const initials = value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return initials || "MP";
}

function matchesSearch(
  position: ManagementPositionListItem,
  searchTerm: string,
): boolean {
  const normalizedSearch =
    searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const searchableValues = [
    getPositionTitle(position),
    formatLabel(position.positionType),
    position.division.name,
    position.division.code,
    position.department?.name,
    position.department?.code,
    position.currentAssignment?.employee.empName,
    position.currentAssignment?.employee.empId,
    position.currentAssignment?.employee.designation,
    position.reservedByAccountRequest?.empName,
    position.reservedByAccountRequest?.empId,
  ];

  return searchableValues.some(
    (value) =>
      value
        ?.toLowerCase()
        .includes(normalizedSearch),
  );
}

export function ManagementPositionsPage() {
  const {
    accessToken,
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
    searchTerm,
    setSearchTerm,
  ] = useState("");

  const [
    selectedPosition,
    setSelectedPosition,
  ] = useState<
    ManagementPositionDetail | null
  >(null);

  const detailContentRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

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
      occupied: 0,
      vacant: 0,
      reserved: 0,
      inactive: 0,
    };

    positions.forEach((position) => {
      switch (position.occupancy) {
        case "OCCUPIED":
          result.occupied += 1;
          break;

        case "RESERVED":
          result.reserved += 1;
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

  const visiblePositions = useMemo(
    () =>
      positions.filter((position) =>
        matchesSearch(
          position,
          searchTerm,
        ),
      ),
    [positions, searchTerm],
  );

  const activeFilterCount = useMemo(
    () =>
      [
        filters.positionType,
        filters.divisionId,
        filters.departmentId,
        filters.occupancy !== "ALL"
          ? filters.occupancy
          : "",
        searchTerm.trim(),
      ].filter(Boolean).length,
    [filters, searchTerm],
  );

  useEffect(() => {
    if (!accessToken) {
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
      );

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

  useLayoutEffect(() => {
    if (!selectedPosition || !detailContentRef.current) {
      return;
    }

    // Reset before paint so a newly selected position never inherits old drawer scroll.
    detailContentRef.current.scrollTop = 0;
  }, [selectedPosition?.id]);

  useEffect(() => {
    if (
      !selectedPosition &&
      !detailLoading
    ) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleKeyDown(
      event: KeyboardEvent,
    ): void {
      if (event.key === "Escape") {
        setSelectedPosition(null);
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [selectedPosition, detailLoading]);

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
  }

  async function openPosition(
    positionId: string,
  ): Promise<void> {
    if (!accessToken) {
      return;
    }

    setDetailLoading(true);
    setError("");

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
    setLoading(true);

    setRefreshKey(
      (current) => current + 1,
    );
  }

  function clearFilters(): void {
    setFilters(initialFilters);
    setSearchTerm("");
    setError("");
  }

  return (
    <main className="management-page management-positions-page">
      <section className="mgmt-content">
        <header className="mgmt-heading">
          <div className="mgmt-heading__copy">
            <span>
              Organization authority
            </span>

            <h1>
              Management Positions
            </h1>

            <p>
              Review Senior Management and Team Manager positions, current
              assignments, reservations and organizational availability.
            </p>
          </div>

          <div
            className="mgmt-heading__scope"
            aria-label="Management position scope"
          >
            <span aria-hidden="true">
              ✓
            </span>

            <div>
              <strong>
                Controlled governance
              </strong>

              <small>
                Position holders follow the approved account-request and
                activation workflow.
              </small>
            </div>
          </div>
        </header>

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
          <article className="total">
            <div className="mgmt-summary__icon" aria-hidden="true">
              ◫
            </div>

            <div>
              <span>
                Positions shown
              </span>

              <strong>
                {summary.total}
              </strong>

              <small>
                Current filtered register
              </small>
            </div>
          </article>

          <article className="occupied">
            <div className="mgmt-summary__icon" aria-hidden="true">
              ✓
            </div>

            <div>
              <span>
                Occupied
              </span>

              <strong>
                {summary.occupied}
              </strong>

              <small>
                Active position holders
              </small>
            </div>
          </article>

          <article className="vacant">
            <div className="mgmt-summary__icon" aria-hidden="true">
              +
            </div>

            <div>
              <span>
                Vacant
              </span>

              <strong>
                {summary.vacant}
              </strong>

              <small>
                Available for approval flow
              </small>
            </div>
          </article>

          <article className="reserved">
            <div className="mgmt-summary__icon" aria-hidden="true">
              ◷
            </div>

            <div>
              <span>
                Reserved
              </span>

              <strong>
                {summary.reserved}
              </strong>

              <small>
                Pending account activation
              </small>
            </div>
          </article>

          <article className="inactive">
            <div className="mgmt-summary__icon" aria-hidden="true">
              —
            </div>

            <div>
              <span>
                Inactive
              </span>

              <strong>
                {summary.inactive}
              </strong>

              <small>
                Not available for assignment
              </small>
            </div>
          </article>
        </section>

        <section className="mgmt-filter-card">
          <header>
            <div>
              <span>
                Position register
              </span>

              <h2>
                Search and filter positions
              </h2>

              <p>
                Use the organizational filters to locate a position or current
                holder without changing governance rules.
              </p>
            </div>

            <button
              type="button"
              onClick={refreshPositions}
              disabled={loading}
            >
              {loading
                ? "Refreshing..."
                : "Refresh register"}
            </button>
          </header>

          <div className="mgmt-search-row">
            <label className="mgmt-search-field">
              <span>
                Search positions
              </span>

              <div>
                <span aria-hidden="true">
                  ⌕
                </span>

                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(
                      event.target.value,
                    )
                  }
                  placeholder="Position, division, department, employee ID or name"
                />
              </div>
            </label>

            <div className="mgmt-filter-status">
              <span>
                Results
              </span>

              <strong>
                {visiblePositions.length}
              </strong>

              <small>
                of {positions.length} positions
              </small>
            </div>
          </div>

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
                  All position types
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
                Position state
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
                  All position states
                </option>

                <option value="OCCUPIED">
                  Occupied
                </option>

                <option value="VACANT">
                  Vacant
                </option>

                <option value="RESERVED">
                  Reserved
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
              disabled={activeFilterCount === 0}
            >
              Clear filters
              {activeFilterCount > 0 && (
                <span>
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {loading && (
            <div
              className="mgmt-position-skeleton"
              aria-label="Loading management positions"
            >
              {Array.from({ length: 4 }).map(
                (_, index) => (
                  <div key={index}>
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                ),
              )}
            </div>
          )}

          {!loading &&
            visiblePositions.length === 0 && (
            <div className="mgmt-empty">
              <div aria-hidden="true">
                ⌕
              </div>

              <strong>
                No positions found
              </strong>

              <p>
                No management positions match the selected search and filters.
              </p>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {!loading &&
            visiblePositions.length > 0 && (
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
                      Holder or reservation
                    </th>

                    <th>
                      State
                    </th>

                    <th>
                      History
                    </th>

                    <th>
                      Updated
                    </th>

                    <th>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visiblePositions.map(
                    (position) => {
                      const state =
                        getPositionState(
                          position,
                        );

                      const holder =
                        position.currentAssignment?.employee;

                      const reservation =
                        position.reservedByAccountRequest;

                      return (
                        <tr
                          key={position.id}
                          className={
                            selectedPosition?.id ===
                            position.id
                              ? "selected"
                              : undefined
                          }
                        >
                          <td data-label="Position">
                            <div className="mgmt-position-cell">
                              <div
                                className={`mgmt-position-avatar ${state.className}`}
                                aria-hidden="true"
                              >
                                {getInitials(
                                  getPositionTitle(
                                    position,
                                  ),
                                )}
                              </div>

                              <div>
                                <strong>
                                  {getPositionTitle(
                                    position,
                                  )}
                                </strong>

                                <small>
                                  {formatLabel(
                                    position.positionType,
                                  )}
                                </small>
                              </div>
                            </div>
                          </td>

                          <td data-label="Organization scope">
                            <strong>
                              {getPositionScope(
                                position,
                              )}
                            </strong>

                            <small>
                              {position.department
                                ? `${position.division.code} / ${position.department.code}`
                                : `Division ${position.division.code}`}
                            </small>
                          </td>

                          <td data-label="Holder or reservation">
                            {holder ? (
                              <div className="mgmt-holder-cell">
                                <span aria-hidden="true">
                                  {getInitials(
                                    holder.empName,
                                  )}
                                </span>

                                <div>
                                  <strong>
                                    {holder.empName}
                                  </strong>

                                  <small>
                                    {holder.empId}
                                    {holder.designation
                                      ? ` · ${holder.designation}`
                                      : ""}
                                  </small>
                                </div>
                              </div>
                            ) : reservation ? (
                              <div className="mgmt-reservation-cell">
                                <strong>
                                  {reservation.empName}
                                </strong>

                                <small>
                                  {reservation.empId} · {formatLabel(
                                    reservation.status,
                                  )}
                                </small>
                              </div>
                            ) : (
                              <span className="mgmt-no-holder">
                                No current holder
                              </span>
                            )}
                          </td>

                          <td data-label="State">
                            <span
                              className={`mgmt-badge ${state.className}`}
                            >
                              {state.label}
                            </span>
                          </td>

                          <td data-label="History">
                            <strong>
                              {position._count.assignments}
                            </strong>

                            <small>
                              assignment record
                              {position._count.assignments === 1
                                ? ""
                                : "s"}
                            </small>
                          </td>

                          <td data-label="Updated">
                            <strong>
                              {formatDate(
                                position.updatedAt,
                              )}
                            </strong>

                            <small>
                              Created {formatDate(
                                position.createdAt,
                              )}
                            </small>
                          </td>

                          <td data-label="Action">
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
                              aria-label={`View ${getPositionTitle(
                                position,
                              )}`}
                            >
                              View details
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
          <aside className="mgmt-detail-panel mgmt-position-detail-panel">
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
            className="mgmt-detail-panel mgmt-position-detail-panel"
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
                  {getPositionTitle(
                    selectedPosition,
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

            <div
              key={selectedPosition.id}
              ref={detailContentRef}
              className="mgmt-detail-content"
            >
              <section className="mgmt-position-hero">
                <div
                  className={`mgmt-position-avatar ${getPositionState(
                    selectedPosition,
                  ).className}`}
                  aria-hidden="true"
                >
                  {getInitials(
                    getPositionTitle(
                      selectedPosition,
                    ),
                  )}
                </div>

                <div>
                  <span>
                    {formatLabel(
                      selectedPosition.positionType,
                    )}
                  </span>

                  <h2>
                    {getPositionTitle(
                      selectedPosition,
                    )}
                  </h2>

                  <p>
                    {getPositionScope(
                      selectedPosition,
                    )}
                  </p>
                </div>

                <span
                  className={`mgmt-badge ${getPositionState(
                    selectedPosition,
                  ).className}`}
                >
                  {getPositionState(
                    selectedPosition,
                  ).label}
                </span>
              </section>

              <section className="mgmt-detail-section">
                <header>
                  <span aria-hidden="true">
                    ◫
                  </span>

                  <div>
                    <small>
                      Organization
                    </small>

                    <h3>
                      Position scope
                    </h3>
                  </div>
                </header>

                <div className="mgmt-detail-section__body">
                  <dl>
                    <div>
                      <dt>
                        Division
                      </dt>

                      <dd>
                        {selectedPosition.division.name}
                      </dd>
                    </div>

                    <div>
                      <dt>
                        Division code
                      </dt>

                      <dd>
                        {selectedPosition.division.code}
                      </dd>
                    </div>

                    <div>
                      <dt>
                        Department
                      </dt>

                      <dd>
                        {selectedPosition.department?.name ??
                          "Division-wide position"}
                      </dd>
                    </div>

                    <div>
                      <dt>
                        Department code
                      </dt>

                      <dd>
                        {selectedPosition.department?.code ??
                          "Not applicable"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>

              <section className="mgmt-detail-section">
                <header>
                  <span aria-hidden="true">
                    ◉
                  </span>

                  <div>
                    <small>
                      Assignment
                    </small>

                    <h3>
                      Current holder
                    </h3>
                  </div>
                </header>

                <div
                  className={`mgmt-detail-section__body mgmt-detail-section__body--${getPositionState(
                    selectedPosition,
                  ).className}`}
                >
                  {selectedPosition.currentAssignment ? (
                    <div className="mgmt-current-holder">
                      <div aria-hidden="true">
                        {getInitials(
                          selectedPosition.currentAssignment.employee.empName,
                        )}
                      </div>

                      <div>
                        <strong>
                          {selectedPosition.currentAssignment.employee.empName}
                        </strong>

                        <span>
                          {selectedPosition.currentAssignment.employee.empId}
                        </span>

                        <small>
                          {selectedPosition.currentAssignment.employee.designation ??
                            "Management position holder"}
                        </small>
                      </div>

                      <dl>
                        <div>
                          <dt>
                            Started
                          </dt>

                          <dd>
                            {formatDate(
                              selectedPosition.currentAssignment.startedAt,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt>
                            Email
                          </dt>

                          <dd>
                            {selectedPosition.currentAssignment.employee.officialEmail}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : selectedPosition.reservedByAccountRequest ? (
                    <div className="mgmt-reservation-detail">
                      <strong>
                        Reserved for {selectedPosition.reservedByAccountRequest.empName}
                      </strong>

                      <p>
                        Employee ID {selectedPosition.reservedByAccountRequest.empId}
                        {" · "}
                        {formatLabel(
                          selectedPosition.reservedByAccountRequest.status,
                        )}
                      </p>

                      <small>
                        Submitted {formatDate(
                          selectedPosition.reservedByAccountRequest.submittedAt,
                        )}
                      </small>
                    </div>
                  ) : (
                    <div className="mgmt-detail-empty-state">
                      <span aria-hidden="true">
                        +
                      </span>

                      <div>
                        <strong>
                          No current holder
                        </strong>

                        <p>
                          This position is available only through the approved
                          account-request and activation workflow.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
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
                  account-request, reservation and activation workflow. Manual
                  replacement is not exposed on this page.
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
                                {assignment.employee.empName}
                              </strong>

                              <time>
                                {formatDate(
                                  assignment.startedAt,
                                )}
                              </time>
                            </header>

                            <p>
                              {assignment.employee.empId}
                              {" · "}
                              {assignment.employee.officialEmail}
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
                                {assignment.assignmentReason}
                              </blockquote>
                            )}

                            {assignment.endReason && (
                              <blockquote>
                                End reason: {assignment.endReason}
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

            <footer className="mgmt-detail-footer">
              <button
                type="button"
                onClick={() =>
                  setSelectedPosition(null)
                }
              >
                Close details
              </button>
            </footer>
          </aside>
        </div>
      )}
    </main>
  );
}
