import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { AccountClass } from "../types/auth";

import { isApiNetworkError } from "../lib/api";

import { OrganizationDelegationPanel } from "./organization/OrganizationDelegationPanel";
import { OrganizationLeadershipPanel } from "./organization/OrganizationLeadershipPanel";
import { OrganizationPeoplePanel } from "./organization/OrganizationPeoplePanel";
import { OrganizationTree } from "./organization/OrganizationTree";

import {
  createOrganizationUnit,
  deleteOrganizationUnit,
  getOrganizationActions,
  getOrganizationOffice,
  getOrganizationOffices,
  getOrganizationPeople,
  getOrganizationTree,
  moveOrganizationUnit,
  setOrganizationUnitStatus,
  updateOrganizationUnit,
} from "../services/organization-v3.service";
import {
  collectDescendantIds,
  filterTree,
  findUnit,
  flattenTree,
  formatOrganizationDate,
  normalizeOrganizationCode,
  normalizeOrganizationName,
  parseOrganizationSortOrder,
} from "../utils/organization-v3";
import type { OrganizationStatusFilter } from "../utils/organization-v3";
import type {
  OrganizationAvailableActions,
  OrganizationOfficeDetail,
  OrganizationOfficeSummary,
  OrganizationPersonSummary,
  OrganizationUnitNode,
} from "../types/organization-v3";

interface AdminOrganizationPanelProps {
  accessToken: string;
  viewerAccountClass: AccountClass;
}

type OrganizationWorkspaceView = "STRUCTURE" | "LEADERSHIP" | "DELEGATION";
type EditorMode = "CREATE" | "EDIT" | "MOVE" | "STATUS" | "DELETE" | null;

interface CreateUnitForm {
  parentOrgUnitId: string | null;
  orgUnitTypeId: string;
  code: string;
  name: string;
  sortOrder: string;
}

interface EditUnitForm {
  code: string;
  name: string;
  sortOrder: string;
}

interface MoveUnitForm {
  parentOrgUnitId: string | null;
  sortOrder: string;
}

const NO_ACTIONS: OrganizationAvailableActions = {
  createChildUnit: false,
  renameUnit: false,
  moveUnit: false,
  changeUnitStatus: false,
  deactivationBlockers: {
    activeChildUnits: 0,
    activeMemberships: 0,
    activeLeadershipAssignments: 0,
  },
  deleteUnit: false,
  deleteBlockers: [],
};

const FORMAL_ORG_UNIT_TYPE_CODES = new Set([
  "DIVISION",
  "DEPARTMENT",
  "SECTION",
  "UNIT",
]);

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function AdminOrganizationPanel({
  accessToken,
  viewerAccountClass,
}: AdminOrganizationPanelProps) {
  const { t, i18n } = useTranslation("organization");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";
  const isSuperAdmin = viewerAccountClass === "SUPER_ADMIN";
  const location = useLocation();
  const navigate = useNavigate();
  const routeSegments = location.pathname.split("/").filter(Boolean);
  const routeIsInactive = routeSegments[1] === "inactive";
  const selectedUnitId =
    routeSegments[1] === "units" && routeSegments[2]
      ? routeSegments[2]
      : null;
  const editorMode: EditorMode =
    routeSegments[1] === "new"
      ? "CREATE"
      : routeSegments[3] === "new"
        ? "CREATE"
        : routeSegments[3] === "edit"
          ? "EDIT"
          : routeSegments[3] === "move"
            ? "MOVE"
            : routeSegments[3] === "status"
              ? "STATUS"
              : routeSegments[3] === "delete"
                ? "DELETE"
                : null;
  const statusFilter: OrganizationStatusFilter = routeIsInactive
    ? "INACTIVE"
    : "ACTIVE";

  const [workspaceView, setWorkspaceView] =
    useState<OrganizationWorkspaceView>("STRUCTURE");
  const [offices, setOffices] = useState<OrganizationOfficeSummary[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [office, setOffice] = useState<OrganizationOfficeDetail | null>(null);
  const [tree, setTree] = useState<OrganizationUnitNode[]>([]);
  const [structurePeople, setStructurePeople] =
    useState<OrganizationPersonSummary[]>([]);
  const [officeActions, setOfficeActions] =
    useState<OrganizationAvailableActions>(NO_ACTIONS);
  const [selectedActions, setSelectedActions] =
    useState<OrganizationAvailableActions>(NO_ACTIONS);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [createForm, setCreateForm] = useState<CreateUnitForm>({
    parentOrgUnitId: null,
    orgUnitTypeId: "",
    code: "",
    name: "",
    sortOrder: "0",
  });
  const [editForm, setEditForm] = useState<EditUnitForm>({
    code: "",
    name: "",
    sortOrder: "0",
  });
  const [moveForm, setMoveForm] = useState<MoveUnitForm>({
    parentOrgUnitId: null,
    sortOrder: "0",
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editorError, setEditorError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  const selectedUnit = useMemo(
    () => findUnit(tree, selectedUnitId),
    [tree, selectedUnitId],
  );
  const allUnits = useMemo(() => flattenTree(tree), [tree]);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredTree = useMemo(
    () => filterTree(tree, normalizedSearch, statusFilter),
    [tree, normalizedSearch, statusFilter],
  );
  const inactiveUnits = useMemo(
    () =>
      allUnits.filter((unit) => {
        if (unit.isActive) {
          return false;
        }
        if (!normalizedSearch) {
          return true;
        }
        return (
          unit.name.toLowerCase().includes(normalizedSearch) ||
          unit.code.toLowerCase().includes(normalizedSearch) ||
          unit.orgUnitType.name.toLowerCase().includes(normalizedSearch)
        );
      }),
    [allUnits, normalizedSearch],
  );
  const matchingUnitCount = routeIsInactive
    ? inactiveUnits.length
    : flattenTree(filteredTree).length;
  const activeTypes = useMemo(
    () =>
      office?.orgUnitTypes.filter(
        (type) =>
          type.isActive &&
          !type.isTeam &&
          FORMAL_ORG_UNIT_TYPE_CODES.has(type.code),
      ) ?? [],
    [office],
  );
  const moveCandidates = useMemo(() => {
    if (!selectedUnit) {
      return [];
    }

    const excludedIds = collectDescendantIds(selectedUnit);
    excludedIds.add(selectedUnit.id);

    return allUnits.filter(
      (candidate) => candidate.isActive && !excludedIds.has(candidate.id),
    );
  }, [allUnits, selectedUnit]);
  const peopleCountByUnit = useMemo(() => {
    const counts = new Map<string, number>();

    for (const person of structurePeople) {
      const unitId = person.primaryMembership.orgUnit?.id;
      if (!unitId) {
        continue;
      }
      counts.set(unitId, (counts.get(unitId) ?? 0) + 1);
    }

    return counts;
  }, [structurePeople]);
  const selectedDirectPeople = useMemo(() => {
    if (!selectedUnit) {
      return [];
    }

    return structurePeople.filter(
      (person) => person.primaryMembership.orgUnit?.id === selectedUnit.id,
    );
  }, [selectedUnit, structurePeople]);
  const selectedBranchPeopleCount = useMemo(() => {
    if (!selectedUnit) {
      return 0;
    }

    const branchIds = collectDescendantIds(selectedUnit);
    branchIds.add(selectedUnit.id);

    return structurePeople.filter((person) => {
      const unitId = person.primaryMembership.orgUnit?.id;
      return unitId ? branchIds.has(unitId) : false;
    }).length;
  }, [selectedUnit, structurePeople]);

  const selectedDeactivationBlockerCount =
    selectedActions.deactivationBlockers.activeChildUnits +
    selectedActions.deactivationBlockers.activeMemberships +
    selectedActions.deactivationBlockers.activeLeadershipAssignments;
  const selectedCanDeactivate =
    Boolean(selectedUnit?.isActive) && selectedDeactivationBlockerCount === 0;

  const activeUnitCount = allUnits.filter((unit) => unit.isActive).length;
  const inactiveUnitCount = allUnits.length - activeUnitCount;
  const peopleCount = structurePeople.length;
  const forceExpanded = normalizedSearch.length > 0;
  const structureReturnPath =
    selectedUnit && !selectedUnit.isActive
      ? "/organization/inactive"
      : "/organization";


  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setLoading(true);
      }
    });

    getOrganizationOffices(accessToken)
      .then((response) => {
        if (!active) {
          return;
        }

        setOffices(response.data);
        setSelectedOfficeId((current) => {
          if (current && response.data.some((item) => item.id === current)) {
            return current;
          }

          return (
            response.data.find((item) => item.isActive)?.id ??
            response.data[0]?.id ??
            ""
          );
        });
        setError("");
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            getErrorMessage(
              requestError,
              t("errors.operationFailed", { ns: "organization" }),
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, refreshVersion, t]);

  useEffect(() => {
    let active = true;

    if (!selectedOfficeId) {
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        setOffice(null);
        setTree([]);
        setStructurePeople([]);
        setOfficeActions(NO_ACTIONS);
      });

      return () => {
        active = false;
      };
    }

    queueMicrotask(() => {
      if (!active) {
        return;
      }

      setLoadingWorkspace(true);
      setEditorError("");
      setDeleteConfirmation("");
    });

    Promise.all([
      getOrganizationOffice(accessToken, selectedOfficeId),
      getOrganizationTree(accessToken, selectedOfficeId),
      getOrganizationActions(accessToken, selectedOfficeId, null),
      getOrganizationPeople(accessToken, selectedOfficeId),
    ])
      .then(([officeResponse, treeResponse, actionsResponse, peopleResponse]) => {
        if (!active) {
          return;
        }

        setOffice(officeResponse.office);
        setTree(treeResponse.tree);
        setStructurePeople(peopleResponse.data);
        setOfficeActions(actionsResponse.availableActions);
        setExpandedIds(new Set());
        setError("");
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            getErrorMessage(
              requestError,
              t("errors.operationFailed", { ns: "organization" }),
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoadingWorkspace(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, selectedOfficeId, refreshVersion, t]);

  useEffect(() => {
    let active = true;

    if (!selectedOfficeId || !selectedUnitId) {
      queueMicrotask(() => {
        if (active) {
          setSelectedActions(NO_ACTIONS);
        }
      });

      return () => {
        active = false;
      };
    }

    queueMicrotask(() => {
      if (active) {
        setSelectedActions(NO_ACTIONS);
      }
    });

    getOrganizationActions(accessToken, selectedOfficeId, selectedUnitId)
      .then((response) => {
        if (active) {
          setSelectedActions(response.availableActions);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getErrorMessage(requestError, t("errors.actionContextFailed")));
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, selectedOfficeId, selectedUnitId, refreshVersion, t]);

  useEffect(() => {
    if (!editorMode) {
      return;
    }

    queueMicrotask(() => {
      if (editorMode === "CREATE") {
        setCreateForm((current) => ({
          parentOrgUnitId: selectedUnitId,
          orgUnitTypeId: current.orgUnitTypeId || activeTypes[0]?.id || "",
          code: current.parentOrgUnitId === selectedUnitId ? current.code : "",
          name: current.parentOrgUnitId === selectedUnitId ? current.name : "",
          sortOrder: "0",
        }));
        return;
      }

      if (!selectedUnit) {
        return;
      }

      if (editorMode === "EDIT") {
        setEditForm({
          code: selectedUnit.code,
          name: selectedUnit.name,
          sortOrder: String(selectedUnit.sortOrder),
        });
      }

      if (editorMode === "MOVE") {
        setMoveForm({
          parentOrgUnitId: selectedUnit.parentOrgUnitId,
          sortOrder: String(selectedUnit.sortOrder),
        });
      }
    });
  }, [activeTypes, editorMode, selectedUnit, selectedUnitId]);

  function refreshOrganization(message?: string): void {
    if (message) {
      setSuccess(message);
    }
    setError("");
    setEditorError("");
    setDeleteConfirmation("");
    setRefreshVersion((current) => current + 1);
  }

  function selectUnit(unitId: string): void {
    setEditorError("");
    setDeleteConfirmation("");
    setSuccess("");
    navigate(`/organization/units/${unitId}`);
  }

  function toggleUnit(unitId: string): void {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  function openCreate(parentOrgUnitId: string | null): void {
    setCreateForm({
      parentOrgUnitId,
      orgUnitTypeId: activeTypes[0]?.id ?? "",
      code: "",
      name: "",
      sortOrder: "0",
    });
    setEditorError("");
    setSuccess("");
    navigate(
      parentOrgUnitId
        ? `/organization/units/${parentOrgUnitId}/new`
        : "/organization/new",
    );
  }

  function openEdit(): void {
    if (!selectedUnit) {
      return;
    }

    setEditForm({
      code: selectedUnit.code,
      name: selectedUnit.name,
      sortOrder: String(selectedUnit.sortOrder),
    });
    setEditorError("");
    setSuccess("");
    navigate(`/organization/units/${selectedUnit.id}/edit`);
  }

  function openMove(): void {
    if (!selectedUnit) {
      return;
    }

    setMoveForm({
      parentOrgUnitId: selectedUnit.parentOrgUnitId,
      sortOrder: String(selectedUnit.sortOrder),
    });
    setEditorError("");
    setSuccess("");
    navigate(`/organization/units/${selectedUnit.id}/move`);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedOfficeId || !createForm.orgUnitTypeId) {
      setEditorError(t("editor.typeRequired"));
      return;
    }

    const code = normalizeOrganizationCode(createForm.code);
    const name = normalizeOrganizationName(createForm.name);

    if (code.length < 2 || name.length < 2) {
      setEditorError(t("editor.validCodeName"));
      return;
    }

    setSaving(true);
    setEditorError("");

    try {
      const response = await createOrganizationUnit(accessToken, selectedOfficeId, {
        orgUnitTypeId: createForm.orgUnitTypeId,
        parentOrgUnitId: createForm.parentOrgUnitId,
        code,
        name,
        sortOrder: parseOrganizationSortOrder(createForm.sortOrder),
      });

      refreshOrganization(response.message);
      navigate(`/organization/units/${response.orgUnit.id}`);
    } catch (requestError: unknown) {
      setEditorError(
        getErrorMessage(
          requestError,
          t("errors.operationFailed", { ns: "organization" }),
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedOfficeId || !selectedUnit) {
      return;
    }

    const code = normalizeOrganizationCode(editForm.code);
    const name = normalizeOrganizationName(editForm.name);

    if (code.length < 2 || name.length < 2) {
      setEditorError(t("editor.validCodeName"));
      return;
    }

    setSaving(true);
    setEditorError("");

    try {
      const response = await updateOrganizationUnit(
        accessToken,
        selectedOfficeId,
        selectedUnit.id,
        {
          code,
          name,
          sortOrder: parseOrganizationSortOrder(editForm.sortOrder),
        },
      );

      refreshOrganization(response.message);
      navigate(`/organization/units/${selectedUnit.id}`);
    } catch (requestError: unknown) {
      setEditorError(
        getErrorMessage(
          requestError,
          t("errors.operationFailed", { ns: "organization" }),
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitMove(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedOfficeId || !selectedUnit) {
      return;
    }

    setSaving(true);
    setEditorError("");

    try {
      const response = await moveOrganizationUnit(
        accessToken,
        selectedOfficeId,
        selectedUnit.id,
        {
          parentOrgUnitId: moveForm.parentOrgUnitId,
          sortOrder: parseOrganizationSortOrder(moveForm.sortOrder),
        },
      );

      refreshOrganization(response.message);
      navigate(`/organization/units/${selectedUnit.id}`);
    } catch (requestError: unknown) {
      setEditorError(
        getErrorMessage(
          requestError,
          t("errors.operationFailed", { ns: "organization" }),
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitStatus(): Promise<void> {
    if (!selectedOfficeId || !selectedUnit) {
      return;
    }

    if (selectedUnit.isActive && !selectedCanDeactivate) {
      setEditorError(t("editor.deactivateBlocked"));
      return;
    }

    setSaving(true);
    setEditorError("");

    try {
      const response = await setOrganizationUnitStatus(
        accessToken,
        selectedOfficeId,
        selectedUnit.id,
        { isActive: !selectedUnit.isActive },
      );

      refreshOrganization(response.message);
      navigate(`/organization/units/${selectedUnit.id}`);
    } catch (requestError: unknown) {
      setEditorError(
        isApiNetworkError(requestError)
          ? t("errors.connectionInterrupted")
          : getErrorMessage(
              requestError,
              t("errors.operationFailed", { ns: "organization" }),
            ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete(): Promise<void> {
    if (!selectedOfficeId || !selectedUnit) {
      return;
    }

    if (deleteConfirmation !== "DELETE") {
      setEditorError(t("editor.deleteConfirmation"));
      return;
    }

    setSaving(true);
    setEditorError("");

    try {
      const response = await deleteOrganizationUnit(
        accessToken,
        selectedOfficeId,
        selectedUnit.id,
      );

      refreshOrganization(response.message);
      navigate("/organization");
    } catch (requestError: unknown) {
      setEditorError(
        getErrorMessage(
          requestError,
          t("errors.operationFailed", { ns: "organization" }),
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedCanMutate =
    selectedActions.createChildUnit ||
    selectedActions.renameUnit ||
    selectedActions.moveUnit ||
    selectedActions.changeUnitStatus ||
    selectedActions.deleteUnit;
  const workspaceCanMutate = officeActions.createChildUnit || selectedCanMutate;

  return (
    <section className="organization-workspace">
      <header className="organization-commandbar">
        <div className="organization-commandbar__identity">
          <span className="organization-commandbar__mark" aria-hidden="true" />
          <div>
            <span className="organization-eyebrow">{t("hero.eyebrow")}</span>
            <div className="organization-commandbar__title-row">
              <h2>{t("hero.title")}</h2>
              {office && (
                <span className="organization-commandbar__office">
                  {office.name}
                </span>
              )}
            </div>
            <p>
              {t("summary.active")}: {activeUnitCount}
              <span aria-hidden="true"> · </span>
              {t("summary.people")}: {peopleCount}
            </p>
          </div>
        </div>

        <div className="organization-commandbar__actions">
          {offices.length > 0 && (isSuperAdmin || offices.length > 1) && (
            <label className="organization-office-select">
              <span>{isSuperAdmin ? t("hero.viewOffice") : t("hero.office")}</span>
              <select
                value={selectedOfficeId}
                onChange={(event) => {
                  setSelectedOfficeId(event.target.value);
                  setSuccess("");
                  navigate("/organization");
                }}
              >
                {offices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </label>
          )}

          {workspaceView === "STRUCTURE" && !routeIsInactive && !selectedUnit && !editorMode && officeActions.createChildUnit && (
            <button
              type="button"
              className="organization-button organization-button--primary"
              onClick={() => openCreate(null)}
              disabled={activeTypes.length === 0}
            >
              {t("actions.createRoot")}
            </button>
          )}

          <button
            type="button"
            className="organization-button organization-button--secondary"
            onClick={() => refreshOrganization()}
            disabled={loading || loadingWorkspace}
          >
            {loading || loadingWorkspace ? t("hero.refreshing") : t("hero.refresh")}
          </button>
        </div>
      </header>

      {success && (
        <div className="organization-feedback organization-feedback--success" role="status">
          <span>{success}</span>
          <button type="button" onClick={() => setSuccess("")}>
            {t("common.close")}
          </button>
        </div>
      )}

      {error && (
        <div className="organization-feedback organization-feedback--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            {t("common.close")}
          </button>
        </div>
      )}

      {!workspaceCanMutate && office && (
        <div className="organization-readonly-note">
          <strong>{t("readonly.title")}</strong>
          <span>{isSuperAdmin ? t("readonly.superAdminDescription") : t("readonly.description")}</span>
        </div>
      )}

      <nav className="organization-workspace-tabs" aria-label={t("tabs.aria")}>
        <button
          type="button"
          className={workspaceView === "STRUCTURE" ? "is-active" : ""}
          onClick={() => { setWorkspaceView("STRUCTURE"); navigate("/organization"); }}
          aria-current={workspaceView === "STRUCTURE" ? "page" : undefined}
        >
          {t("tabs.structure")}
        </button>
        <button
          type="button"
          className={workspaceView === "LEADERSHIP" ? "is-active" : ""}
          onClick={() => {
            setWorkspaceView("LEADERSHIP");
            navigate("/organization");
          }}
          aria-current={workspaceView === "LEADERSHIP" ? "page" : undefined}
        >
          {t("tabs.leadership")}
        </button>
        <button
          type="button"
          className={workspaceView === "DELEGATION" ? "is-active" : ""}
          onClick={() => {
            setWorkspaceView("DELEGATION");
            navigate("/organization");
          }}
          aria-current={workspaceView === "DELEGATION" ? "page" : undefined}
        >
          {t("tabs.delegation")}
        </button>
      </nav>

      {workspaceView === "STRUCTURE" ? (
        <>
          {!selectedUnitId && editorMode !== "CREATE" && (
            <div className="organization-route-enter">
              <section className="organization-structure-toolbar" aria-label={t("filters.aria")}>
                <nav className="organization-structure-switch" aria-label={t("filters.status")}>
                  <button
                    type="button"
                    className={!routeIsInactive ? "is-active" : ""}
                    onClick={() => navigate("/organization")}
                    aria-current={!routeIsInactive ? "page" : undefined}
                  >
                    {t("filters.active")}
                    <span>{activeUnitCount}</span>
                  </button>
                  <button
                    type="button"
                    className={routeIsInactive ? "is-active" : ""}
                    onClick={() => navigate("/organization/inactive")}
                    aria-current={routeIsInactive ? "page" : undefined}
                  >
                    {t("filters.inactive")}
                    <span>{inactiveUnitCount}</span>
                  </button>
                </nav>

                <label className="organization-structure-search">
                  <span>{routeIsInactive ? t("filters.searchInactive") : t("filters.search")}</span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={t("filters.placeholder")}
                  />
                </label>

                <div className="organization-structure-toolbar__result">
                  <strong>{t("filters.matching", { count: matchingUnitCount })}</strong>
                  {searchTerm && (
                    <button
                      type="button"
                      className="organization-control-bar__clear"
                      onClick={() => setSearchTerm("")}
                    >
                      {t("filters.clear")}
                    </button>
                  )}
                </div>
              </section>

              <section className="organization-hierarchy-panel organization-hierarchy-panel--focused">
                <header>
                  <div>
                    <span>{routeIsInactive ? t("inactive.eyebrow") : t("tree.eyebrow")}</span>
                    <h3>{routeIsInactive ? t("inactive.title") : t("tree.activeTitle")}</h3>
                    <p>{routeIsInactive ? t("inactive.description") : t("tree.activeDescription")}</p>
                  </div>
                </header>

                {loading || loadingWorkspace ? (
                  <div className="organization-empty-state">
                    <strong>{t("tree.loadingTitle")}</strong>
                    <span>{t("tree.loadingDescription")}</span>
                  </div>
                ) : !office ? (
                  <div className="organization-empty-state">
                    <strong>{t("tree.noOfficeTitle")}</strong>
                    <span>{t("tree.noOfficeDescription")}</span>
                  </div>
                ) : routeIsInactive ? (
                  inactiveUnits.length === 0 ? (
                    <div className="organization-empty-state">
                      <strong>{t("inactive.emptyTitle")}</strong>
                      <span>{t("inactive.emptyDescription")}</span>
                    </div>
                  ) : (
                    <div className="organization-inactive-list">
                      {inactiveUnits.map((unit) => (
                        <article key={unit.id}>
                          <span className="organization-inactive-list__badge">
                            {unit.code.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="organization-inactive-list__identity">
                            <strong>{unit.name}</strong>
                            <small>{unit.orgUnitType.name} · {unit.code}</small>
                          </span>
                          <span className="organization-status">{t("common.inactive")}</span>
                          <button
                            type="button"
                            className="organization-button organization-button--secondary"
                            onClick={() => selectUnit(unit.id)}
                          >
                            {t("tree.manage")}
                          </button>
                        </article>
                      ))}
                    </div>
                  )
                ) : filteredTree.length === 0 ? (
                  <div className="organization-empty-state">
                    <strong>{t("tree.emptyTitle")}</strong>
                    <span>{t("tree.emptyActiveDescription")}</span>
                  </div>
                ) : (
                  <div className="organization-hierarchy-list" role="tree">
                    {filteredTree.map((node) => (
                      <OrganizationTree
                        key={node.id}
                        node={node}
                        depth={0}
                        expandedIds={expandedIds}
                        forceExpanded={forceExpanded}
                        peopleCountByUnit={peopleCountByUnit}
                        onSelect={selectUnit}
                        onToggle={toggleUnit}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {(selectedUnitId || editorMode === "CREATE") && (
            <section className="organization-unit-manager organization-unit-manager--route organization-route-enter">
              <div className="organization-route-toolbar">
                <button
                  type="button"
                  className="organization-route-back"
                  onClick={() =>
                    navigate(
                      editorMode && selectedUnit
                        ? `/organization/units/${selectedUnit.id}`
                        : structureReturnPath,
                    )
                  }
                >
                  ← {editorMode && selectedUnit ? t("routes.backToUnit") : t("routes.backToStructure")}
                </button>
              </div>

              {!office && (loading || loadingWorkspace) && (
                <div className="organization-empty-state organization-route-state" role="status">
                  <strong>{t("tree.loadingTitle")}</strong>
                  <span>{t("tree.loadingDescription")}</span>
                </div>
              )}

              {!office && !loading && !loadingWorkspace && (
                <div className="organization-empty-state organization-route-state">
                  <strong>{t("tree.noOfficeTitle")}</strong>
                  <span>{t("tree.noOfficeDescription")}</span>
                </div>
              )}

              {office && selectedUnitId && !selectedUnit && !loadingWorkspace && (
                <div className="organization-empty-state organization-route-state" role="alert">
                  <strong>{t("routes.unitUnavailable")}</strong>
                  <span>{t("routes.unitUnavailableDescription")}</span>
                </div>
              )}

              {office && selectedUnit && !editorMode && (
                <>
                  <header className="organization-unit-manager__header">
                    <div>
                      <span>{t("manage.eyebrow")}</span>
                      <h3>{selectedUnit.name}</h3>
                      <p>
                        {selectedUnit.orgUnitType.name} · {selectedUnit.code}
                      </p>
                    </div>
                  </header>

                  <div className="organization-unit-manager__content">
                    <div className="organization-unit-manager__main">
                      <div className="organization-detail-status-row">
                        <span
                          className={
                            selectedUnit.isActive
                              ? "organization-status organization-status--active"
                              : "organization-status"
                          }
                        >
                          {selectedUnit.isActive ? t("common.active") : t("common.inactive")}
                        </span>
                        <span className="organization-type-chip">
                          {selectedUnit.orgUnitType.name}
                        </span>
                      </div>

                      <dl className="organization-detail-facts">
                        <div>
                          <dt>{t("detail.parent")}</dt>
                          <dd>
                            {selectedUnit.parentOrgUnitId
                              ? findUnit(tree, selectedUnit.parentOrgUnitId)?.name ??
                                t("common.notAvailable")
                              : office.name}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("detail.people")}</dt>
                          <dd>{selectedDirectPeople.length}</dd>
                        </div>
                        <div>
                          <dt>{t("detail.children")}</dt>
                          <dd>{selectedUnit.children.length}</dd>
                        </div>
                        <div>
                          <dt>{t("detail.branchPeople")}</dt>
                          <dd>{selectedBranchPeopleCount}</dd>
                        </div>
                        <div>
                          <dt>{t("detail.updated")}</dt>
                          <dd>
                            {formatOrganizationDate(
                              selectedUnit.updatedAt,
                              locale,
                              t("common.notAvailable"),
                            )}
                          </dd>
                        </div>
                      </dl>

                      {selectedCanMutate ? (
                        <div className="organization-action-strip" aria-label={t("actions.aria")}>
                          {selectedActions.createChildUnit && (
                            <button
                              type="button"
                              onClick={() => openCreate(selectedUnit.id)}
                              disabled={!selectedUnit.isActive || activeTypes.length === 0}
                            >
                              {t("actions.createChild")}
                            </button>
                          )}
                          {selectedActions.renameUnit && (
                            <button type="button" onClick={openEdit}>
                              {t("actions.edit")}
                            </button>
                          )}
                          {selectedActions.moveUnit && (
                            <button type="button" onClick={openMove}>
                              {t("actions.move")}
                            </button>
                          )}
                          {selectedActions.changeUnitStatus && (
                            <button type="button" onClick={() => navigate(`/organization/units/${selectedUnit.id}/status`)}>
                              {selectedUnit.isActive
                                ? t("actions.deactivate")
                                : t("actions.activate")}
                            </button>
                          )}
                          {selectedActions.deleteUnit && (
                            <button
                              type="button"
                              className="organization-action-danger"
                              onClick={() => {
                                setDeleteConfirmation("");
                                navigate(`/organization/units/${selectedUnit.id}/delete`);
                              }}
                            >
                              {t("actions.delete")}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="organization-unit-readonly">
                          {t("readonly.unit")}
                        </div>
                      )}

                      {selectedActions.deleteBlockers.length > 0 && (
                        <div className="organization-delete-protection">
                          <strong>{t("manage.deleteProtected")}</strong>
                          <span>{t("manage.deleteProtectedDescription")}</span>
                          <ul>
                            {selectedActions.deleteBlockers.map((blocker) => (
                              <li key={blocker}>{blocker}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    <OrganizationPeoplePanel
                      accessToken={accessToken}
                      office={office}
                      tree={tree}
                      unit={selectedUnit}
                      people={structurePeople}
                      onChanged={refreshOrganization}
                    />
                  </div>
                </>
              )}

              {office && editorMode && (!selectedUnitId || selectedUnit) && (
                <section className="organization-inline-editor">
                  <header>
                    <div>
                      <span>{t("editor.eyebrow")}</span>
                      <h4>
                        {editorMode === "CREATE"
                          ? t("editor.createTitle")
                          : editorMode === "EDIT"
                            ? t("editor.editTitle")
                            : editorMode === "MOVE"
                              ? t("editor.moveTitle")
                              : editorMode === "DELETE"
                                ? t("editor.deleteTitle")
                                : selectedUnit?.isActive
                                  ? t("editor.deactivateTitle")
                                  : t("editor.activateTitle")}
                      </h4>
                    </div>
                    <button
                      type="button"
                      className="organization-editor-close"
                      onClick={() => {
                        setEditorError("");
                        setDeleteConfirmation("");
                        navigate(selectedUnit ? `/organization/units/${selectedUnit.id}` : structureReturnPath);
                      }}
                    >
                      {t("common.close")}
                    </button>
                  </header>

                  {editorError && (
                    <div className="organization-editor-error" role="alert">
                      {editorError}
                    </div>
                  )}

                  {editorMode === "CREATE" && (
                    <form className="organization-form" onSubmit={submitCreate}>
                      <label>
                        <span>{t("editor.parent")}</span>
                        <select
                          value={createForm.parentOrgUnitId ?? ""}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              parentOrgUnitId: event.target.value || null,
                            }))
                          }
                          disabled={saving}
                        >
                          <option value="">{office.name}</option>
                          {allUnits
                            .filter((unit) => unit.isActive)
                            .map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {unit.name} ({unit.code})
                              </option>
                            ))}
                        </select>
                      </label>

                      <label>
                        <span>{t("editor.type")}</span>
                        <select
                          value={createForm.orgUnitTypeId}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              orgUnitTypeId: event.target.value,
                            }))
                          }
                          disabled={saving}
                          required
                        >
                          <option value="">{t("editor.selectType")}</option>
                          {activeTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>{t("editor.code")}</span>
                        <input
                          value={createForm.code}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              code: event.target.value.toUpperCase(),
                            }))
                          }
                          maxLength={50}
                          disabled={saving}
                          required
                        />
                      </label>

                      <label>
                        <span>{t("editor.name")}</span>
                        <input
                          value={createForm.name}
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          maxLength={150}
                          disabled={saving}
                          required
                        />
                      </label>

                      <footer>
                        <button
                          type="button"
                          className="organization-button organization-button--secondary"
                          onClick={() => navigate(selectedUnit ? `/organization/units/${selectedUnit.id}` : structureReturnPath)}
                          disabled={saving}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="submit"
                          className="organization-button organization-button--primary"
                          disabled={saving}
                        >
                          {saving ? t("editor.saving") : t("editor.create")}
                        </button>
                      </footer>
                    </form>
                  )}

                  {editorMode === "EDIT" && (
                    <form className="organization-form" onSubmit={submitEdit}>
                      <label>
                        <span>{t("editor.code")}</span>
                        <input
                          value={editForm.code}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              code: event.target.value.toUpperCase(),
                            }))
                          }
                          maxLength={50}
                          disabled={saving}
                          required
                        />
                      </label>
                      <label>
                        <span>{t("editor.name")}</span>
                        <input
                          value={editForm.name}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          maxLength={150}
                          disabled={saving}
                          required
                        />
                      </label>
                      <footer>
                        <button
                          type="button"
                          className="organization-button organization-button--secondary"
                          onClick={() => navigate(selectedUnit ? `/organization/units/${selectedUnit.id}` : structureReturnPath)}
                          disabled={saving}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="submit"
                          className="organization-button organization-button--primary"
                          disabled={saving}
                        >
                          {saving ? t("editor.saving") : t("editor.save")}
                        </button>
                      </footer>
                    </form>
                  )}

                  {editorMode === "MOVE" && (
                    <form className="organization-form" onSubmit={submitMove}>
                      <label>
                        <span>{t("editor.newParent")}</span>
                        <select
                          value={moveForm.parentOrgUnitId ?? ""}
                          onChange={(event) =>
                            setMoveForm((current) => ({
                              ...current,
                              parentOrgUnitId: event.target.value || null,
                            }))
                          }
                          disabled={saving}
                        >
                          <option value="">{office.name}</option>
                          {moveCandidates.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.name} ({unit.code})
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="organization-editor-note">
                        {t("editor.moveNotice")}
                      </div>
                      <footer>
                        <button
                          type="button"
                          className="organization-button organization-button--secondary"
                          onClick={() => navigate(selectedUnit ? `/organization/units/${selectedUnit.id}` : structureReturnPath)}
                          disabled={saving}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="submit"
                          className="organization-button organization-button--primary"
                          disabled={saving}
                        >
                          {saving ? t("editor.saving") : t("editor.move")}
                        </button>
                      </footer>
                    </form>
                  )}

                  {editorMode === "STATUS" && selectedUnit && (
                    <div className="organization-status-editor">
                      <div
                        className={
                          selectedUnit.isActive && !selectedCanDeactivate
                            ? "organization-editor-note organization-editor-note--danger"
                            : "organization-editor-note"
                        }
                      >
                        {selectedUnit.isActive ? (
                          selectedCanDeactivate ? (
                            t("editor.deactivateReady")
                          ) : (
                            <>
                              <strong>{t("editor.deactivateBlocked")}</strong>
                              <ul className="organization-status-blockers">
                                {selectedActions.deactivationBlockers
                                  .activeMemberships > 0 && (
                                  <li>
                                    {t("editor.activeMemberships", {
                                      count:
                                        selectedActions.deactivationBlockers
                                          .activeMemberships,
                                    })}
                                  </li>
                                )}
                                {selectedActions.deactivationBlockers
                                  .activeLeadershipAssignments > 0 && (
                                  <li>
                                    {t("editor.activeLeadership", {
                                      count:
                                        selectedActions.deactivationBlockers
                                          .activeLeadershipAssignments,
                                    })}
                                  </li>
                                )}
                                {selectedActions.deactivationBlockers
                                  .activeChildUnits > 0 && (
                                  <li>
                                    {t("editor.activeChildren", {
                                      count:
                                        selectedActions.deactivationBlockers
                                          .activeChildUnits,
                                    })}
                                  </li>
                                )}
                              </ul>
                            </>
                          )
                        ) : (
                          t("editor.activateNotice")
                        )}
                      </div>
                      <footer>
                        <button
                          type="button"
                          className="organization-button organization-button--secondary"
                          onClick={() => navigate(selectedUnit ? `/organization/units/${selectedUnit.id}` : structureReturnPath)}
                          disabled={saving}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          className={
                            selectedUnit.isActive
                              ? "organization-button organization-button--danger"
                              : "organization-button organization-button--primary"
                          }
                          onClick={() => void submitStatus()}
                          disabled={
                            saving ||
                            (selectedUnit.isActive && !selectedCanDeactivate)
                          }
                        >
                          {saving
                            ? t("editor.saving")
                            : selectedUnit.isActive
                              ? t("actions.deactivate")
                              : t("actions.activate")}
                        </button>
                      </footer>
                    </div>
                  )}

                  {editorMode === "DELETE" && selectedUnit && (
                    <div className="organization-status-editor organization-delete-editor">
                      <div className="organization-editor-note organization-editor-note--danger">
                        {t("editor.deleteNotice", { name: selectedUnit.name })}
                      </div>
                      <label className="organization-delete-confirmation">
                        <span>{t("editor.deleteLabel")}</span>
                        <input
                          value={deleteConfirmation}
                          onChange={(event) => {
                            setDeleteConfirmation(event.target.value);
                            setEditorError("");
                          }}
                          placeholder="DELETE"
                          autoComplete="off"
                          disabled={saving}
                        />
                      </label>
                      <footer>
                        <button
                          type="button"
                          className="organization-button organization-button--secondary"
                          onClick={() => {
                            setDeleteConfirmation("");
                            navigate(`/organization/units/${selectedUnit.id}`);
                          }}
                          disabled={saving}
                        >
                          {t("common.cancel")}
                        </button>
                        <button
                          type="button"
                          className="organization-button organization-button--danger"
                          onClick={() => void submitDelete()}
                          disabled={saving || deleteConfirmation !== "DELETE"}
                        >
                          {saving ? t("editor.saving") : t("actions.delete")}
                        </button>
                      </footer>
                    </div>
                  )}
                </section>
              )}
            </section>
          )}
        </>
      ) : office ? (
        workspaceView === "LEADERSHIP" ? (
          <OrganizationLeadershipPanel accessToken={accessToken} office={office} tree={tree} />
        ) : (
          <OrganizationDelegationPanel accessToken={accessToken} office={office} tree={tree} />
        )
      ) : (
        <div className="organization-empty-state">
          <strong>{t("tree.noOfficeTitle")}</strong>
          <span>{t("tree.noOfficeDescription")}</span>
        </div>
      )}
    </section>
  );
}
