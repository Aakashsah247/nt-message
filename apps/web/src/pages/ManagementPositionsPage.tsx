import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

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
  t: TFunction<"positions">,
): string {
  return error instanceof Error
    ? error.message
    : t("errorFallback", { ns: "positions" });
}

function fallbackFormatLabel(
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

function formatLabel(
  value: string,
  t: TFunction<"positions">,
): string {
  return t(`state.${value}`, {
    ns: "positions",
    defaultValue: fallbackFormatLabel(value),
  });
}

function formatDate(
  value: string | null | undefined,
  locale: string,
  t: TFunction<"positions">,
): string {
  if (!value) {
    return t("common.notAvailable", { ns: "positions" });
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return t("common.notAvailable", { ns: "positions" });
  }

  return new Intl.DateTimeFormat(
    locale === "ne" ? "ne-NP-u-ca-gregory" : "en-GB",
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
  t: TFunction<"positions">,
): string {
  if (
    position.positionType ===
    "SENIOR_MANAGEMENT"
  ) {
    return t("title.senior", {
      ns: "positions",
      division: position.division.name,
    });
  }

  return position.department
    ? t("title.team", {
        ns: "positions",
        department: position.department.name,
      })
    : t("title.teamFallback", { ns: "positions" });
}

function getPositionState(
  position: ManagementPositionListItem,
  t: TFunction<"positions">,
): {
  className: string;
  label: string;
} {
  switch (position.occupancy) {
    case "INACTIVE":
      return {
        className: "inactive",
        label: t("state.INACTIVE", { ns: "positions" }),
      };

    case "OCCUPIED":
      return {
        className: "occupied",
        label: t("state.OCCUPIED", { ns: "positions" }),
      };

    case "RESERVED":
      return {
        className: "reserved",
        label: t("state.RESERVED", { ns: "positions" }),
      };

    case "VACANT":
    default:
      return {
        className: "vacant",
        label: t("state.VACANT", { ns: "positions" }),
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
  t: TFunction<"positions">,
): boolean {
  const normalizedSearch =
    searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  const searchableValues = [
    getPositionTitle(position, t),
    formatLabel(position.positionType, t),
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
  const { t, i18n } = useTranslation("positions");
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
          t,
        ),
      ),
    [positions, searchTerm, t],
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
                t,
              ),
            );
          }
        },
      );

    return () => {
      active = false;
    };
  }, [accessToken, t]);

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
              t,
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
    t,
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
          t,
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
            <span>{t("page.eyebrow")}</span>

            <h1>{t("page.title")}</h1>

            <p>{t("page.description")}</p>
          </div>

          <div
            className="mgmt-heading__scope"
            aria-label={t("page.scopeAria")}
          >
            <span aria-hidden="true">
              ✓
            </span>

            <div>
              <strong>{t("page.governance")}</strong>

              <small>{t("page.governanceDescription")}</small>
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
              {t("page.retry")}
            </button>
          </div>
        )}

        <section
          className="mgmt-summary"
          aria-label={t("summary.aria")}
        >
          <article className="total">
            <div className="mgmt-summary__icon" aria-hidden="true">
              ◫
            </div>

            <div>
              <span>{t("summary.shown")}</span>

              <strong>
                {summary.total}
              </strong>

              <small>{t("summary.shownDetail")}</small>
            </div>
          </article>

          <article className="occupied">
            <div className="mgmt-summary__icon" aria-hidden="true">
              ✓
            </div>

            <div>
              <span>{t("summary.occupied")}</span>

              <strong>
                {summary.occupied}
              </strong>

              <small>{t("summary.occupiedDetail")}</small>
            </div>
          </article>

          <article className="vacant">
            <div className="mgmt-summary__icon" aria-hidden="true">
              +
            </div>

            <div>
              <span>{t("summary.vacant")}</span>

              <strong>
                {summary.vacant}
              </strong>

              <small>{t("summary.vacantDetail")}</small>
            </div>
          </article>

          <article className="reserved">
            <div className="mgmt-summary__icon" aria-hidden="true">
              ◷
            </div>

            <div>
              <span>{t("summary.reserved")}</span>

              <strong>
                {summary.reserved}
              </strong>

              <small>{t("summary.reservedDetail")}</small>
            </div>
          </article>

          <article className="inactive">
            <div className="mgmt-summary__icon" aria-hidden="true">
              —
            </div>

            <div>
              <span>{t("summary.inactive")}</span>

              <strong>
                {summary.inactive}
              </strong>

              <small>{t("summary.inactiveDetail")}</small>
            </div>
          </article>
        </section>

        <section className="mgmt-filter-card">
          <header>
            <div>
              <span>{t("filters.eyebrow")}</span>

              <h2>{t("filters.title")}</h2>

              <p>{t("filters.description")}</p>
            </div>

            <button
              type="button"
              onClick={refreshPositions}
              disabled={loading}
            >
              {loading
                ? t("filters.refreshing")
                : t("filters.refresh")}
            </button>
          </header>

          <div className="mgmt-search-row">
            <label className="mgmt-search-field">
              <span>{t("filters.search")}</span>

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
                  placeholder={t("filters.placeholder")}
                />
              </div>
            </label>

            <div className="mgmt-filter-status">
              <span>{t("filters.results")}</span>

              <strong>
                {visiblePositions.length}
              </strong>

              <small>{t("filters.ofPositions", { count: positions.length })}</small>
            </div>
          </div>

          <div className="mgmt-filters">
            <label>
              <span>{t("filters.positionType")}</span>

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
                <option value="">{t("filters.allTypes")}</option>

                <option value="SENIOR_MANAGEMENT">{t("filters.seniorManagement")}</option>

                <option value="TEAM_MANAGER">{t("filters.teamManager")}</option>
              </select>
            </label>

            <label>
              <span>{t("filters.division")}</span>

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
                <option value="">{t("filters.allDivisions")}</option>

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
              <span>{t("filters.department")}</span>

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
                <option value="">{t("filters.allDepartments")}</option>

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
              <span>{t("filters.state")}</span>

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
                <option value="ALL">{t("filters.allStates")}</option>

                <option value="OCCUPIED">{t("state.OCCUPIED")}</option>

                <option value="VACANT">{t("state.VACANT")}</option>

                <option value="RESERVED">{t("state.RESERVED")}</option>

                <option value="INACTIVE">{t("state.INACTIVE")}</option>
              </select>
            </label>

            <button
              type="button"
              className="mgmt-clear"
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
            >
              {t("filters.clear")}
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
              aria-label={t("table.loadingAria")}
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

              <strong>{t("empty.title")}</strong>

              <p>{t("empty.description")}</p>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                >
                  {t("empty.clear")}
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
                    <th>{t("table.position")}</th>

                    <th>{t("table.organizationScope")}</th>

                    <th>{t("table.holderReservation")}</th>

                    <th>{t("table.state")}</th>

                    <th>{t("table.history")}</th>

                    <th>{t("table.updated")}</th>

                    <th>{t("table.action")}</th>
                  </tr>
                </thead>

                <tbody>
                  {visiblePositions.map(
                    (position) => {
                      const state =
                        getPositionState(
                          position,
                          t,
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
                          <td data-label={t("table.position")}>
                            <div className="mgmt-position-cell">
                              <div
                                className={`mgmt-position-avatar ${state.className}`}
                                aria-hidden="true"
                              >
                                {getInitials(
                                  getPositionTitle(
                                    position,
                                    t,
                                  ),
                                )}
                              </div>

                              <div>
                                <strong>
                                  {getPositionTitle(
                                    position,
                                    t,
                                  )}
                                </strong>

                                <small>
                                  {formatLabel(
                                    position.positionType,
                                    t,
                                  )}
                                </small>
                              </div>
                            </div>
                          </td>

                          <td data-label={t("table.organizationScope")}>
                            <strong>
                              {getPositionScope(
                                position,
                              )}
                            </strong>

                            <small>
                              {position.department
                                ? `${position.division.code} / ${position.department.code}`
                                : `${t("filters.division")} ${position.division.code}`}
                            </small>
                          </td>

                          <td data-label={t("table.holderReservation")}>
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
                                    t,
                                  )}
                                </small>
                              </div>
                            ) : (
                              <span className="mgmt-no-holder">{t("table.noHolder")}</span>
                            )}
                          </td>

                          <td data-label={t("table.state")}>
                            <span
                              className={`mgmt-badge ${state.className}`}
                            >
                              {state.label}
                            </span>
                          </td>

                          <td data-label={t("table.history")}>
                            <strong>
                              {position._count.assignments}
                            </strong>

                            <small>{t("table.assignmentRecord", { count: position._count.assignments })}</small>
                          </td>

                          <td data-label={t("table.updated")}>
                            <strong>
                              {formatDate(
                                position.updatedAt,
                                i18n.language,
                                t,
                              )}
                            </strong>

                            <small>{t("table.created", { date: formatDate(
                                position.createdAt,
                                i18n.language,
                                t,
                              ) })}</small>
                          </td>

                          <td data-label={t("table.action")}>
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
                              aria-label={t("table.viewAria", { position: getPositionTitle(
                                position,
                                t,
                              ) })}
                            >
                              {t("table.viewDetails")}
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

              <p>{t("detail.loading")}</p>
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
                <span>{t("detail.eyebrow")}</span>

                <strong id="management-position-detail-title">
                  {getPositionTitle(
                    selectedPosition,
                    t,
                  )}
                </strong>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedPosition(null)
                }
                aria-label={t("common.closePositionDetails")}
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
                    t,
                  ).className}`}
                  aria-hidden="true"
                >
                  {getInitials(
                    getPositionTitle(
                      selectedPosition,
                      t,
                    ),
                  )}
                </div>

                <div>
                  <span>
                    {formatLabel(
                      selectedPosition.positionType,
                      t,
                    )}
                  </span>

                  <h2>
                    {getPositionTitle(
                      selectedPosition,
                      t,
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
                    t,
                  ).className}`}
                >
                  {getPositionState(
                    selectedPosition,
                    t,
                  ).label}
                </span>
              </section>

              <section className="mgmt-detail-section">
                <header>
                  <span aria-hidden="true">
                    ◫
                  </span>

                  <div>
                    <small>{t("detail.organization")}</small>

                    <h3>{t("detail.positionScope")}</h3>
                  </div>
                </header>

                <div className="mgmt-detail-section__body">
                  <dl>
                    <div>
                      <dt>{t("detail.division")}</dt>

                      <dd>
                        {selectedPosition.division.name}
                      </dd>
                    </div>

                    <div>
                      <dt>{t("detail.divisionCode")}</dt>

                      <dd>
                        {selectedPosition.division.code}
                      </dd>
                    </div>

                    <div>
                      <dt>{t("detail.department")}</dt>

                      <dd>
                        {selectedPosition.department?.name ??
                          t("common.divisionWide")}
                      </dd>
                    </div>

                    <div>
                      <dt>{t("detail.departmentCode")}</dt>

                      <dd>
                        {selectedPosition.department?.code ??
                          t("common.notApplicable")}
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
                    <small>{t("detail.assignment")}</small>

                    <h3>{t("detail.currentHolder")}</h3>
                  </div>
                </header>

                <div
                  className={`mgmt-detail-section__body mgmt-detail-section__body--${getPositionState(
                    selectedPosition,
                    t,
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
                            t("common.positionHolder")}
                        </small>
                      </div>

                      <dl>
                        <div>
                          <dt>{t("detail.started")}</dt>

                          <dd>
                            {formatDate(
                              selectedPosition.currentAssignment.startedAt,
                              i18n.language,
                              t,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt>{t("detail.email")}</dt>

                          <dd>
                            {selectedPosition.currentAssignment.employee.officialEmail}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : selectedPosition.reservedByAccountRequest ? (
                    <div className="mgmt-reservation-detail">
                      <strong>{t("detail.reservedFor", { name: selectedPosition.reservedByAccountRequest.empName })}</strong>

                      <p>{t("detail.employeeIdStatus", {
                        id: selectedPosition.reservedByAccountRequest.empId,
                        status: formatLabel(
                          selectedPosition.reservedByAccountRequest.status,
                          t,
                        ),
                      })}</p>

                      <small>{t("detail.submitted", { date: formatDate(
                          selectedPosition.reservedByAccountRequest.submittedAt,
                          i18n.language,
                          t,
                        ) })}</small>
                    </div>
                  ) : (
                    <div className="mgmt-detail-empty-state">
                      <span aria-hidden="true">
                        +
                      </span>

                      <div>
                        <strong>{t("detail.noHolder")}</strong>

                        <p>{t("detail.noHolderDescription")}</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="mgmt-action-card">
                <header>
                  <span>{t("detail.controlledWorkflow")}</span>

                  <h3>{t("detail.holderChanges")}</h3>
                </header>

                <p className="mgmt-history-empty">{t("detail.holderChangesDescription")}</p>
              </section>

              <section className="mgmt-history-card">
                <header>
                  <span>{t("detail.positionHistory")}</span>

                  <h3>{t("detail.assignmentTimeline")}</h3>
                </header>

                {selectedPosition.assignments.length ===
                0 ? (
                  <p className="mgmt-history-empty">{t("detail.noHistory")}</p>
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
                                  i18n.language,
                                  t,
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
                                ? t("detail.ended", {
                                    date: formatDate(
                                      assignment.endedAt,
                                      i18n.language,
                                      t,
                                    ),
                                  })
                                : t("common.currentAssignment")}
                            </small>

                            {assignment.assignmentReason && (
                              <blockquote>
                                {assignment.assignmentReason}
                              </blockquote>
                            )}

                            {assignment.endReason && (
                              <blockquote>
                                {t("detail.endReason", { reason: assignment.endReason })}
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
                {t("common.closeDetails")}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </main>
  );
}
