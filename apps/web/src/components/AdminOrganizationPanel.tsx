import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { OrganizationLeadershipPanel } from "./organization/OrganizationLeadershipPanel";
import { OrganizationPeoplePanel } from "./organization/OrganizationPeoplePanel";
import { OrganizationTree } from "./organization/OrganizationTree";

import {
  createOrganizationUnit,
  getOrganizationActions,
  getOrganizationOffice,
  getOrganizationOffices,
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
  OrganizationUnitNode,
} from "../types/organization-v3";

interface AdminOrganizationPanelProps {
  accessToken: string;
}

type OrganizationWorkspaceView = "STRUCTURE" | "PEOPLE" | "LEADERSHIP";
type EditorMode = "CREATE" | "EDIT" | "MOVE" | "STATUS" | null;

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
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function AdminOrganizationPanel({
  accessToken,
}: AdminOrganizationPanelProps) {
  const { t, i18n } = useTranslation("organization");
  const locale = i18n.resolvedLanguage === "ne" ? "ne-NP" : "en-GB";

  const [workspaceView, setWorkspaceView] = useState<OrganizationWorkspaceView>("STRUCTURE");
  const [offices, setOffices] = useState<OrganizationOfficeSummary[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [office, setOffice] = useState<OrganizationOfficeDetail | null>(null);
  const [tree, setTree] = useState<OrganizationUnitNode[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [officeActions, setOfficeActions] =
    useState<OrganizationAvailableActions>(NO_ACTIONS);
  const [selectedActions, setSelectedActions] =
    useState<OrganizationAvailableActions>(NO_ACTIONS);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<OrganizationStatusFilter>("ALL");
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
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
  const matchingUnitCount = useMemo(
    () => flattenTree(filteredTree).length,
    [filteredTree],
  );
  const activeTypes = useMemo(
    () => office?.orgUnitTypes.filter((type) => type.isActive) ?? [],
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

  const activeUnitCount = allUnits.filter((unit) => unit.isActive).length;
  const teamCount = allUnits.filter((unit) => unit.orgUnitType.isTeam).length;
  const peopleCount = office?._count.memberships ?? 0;
  const leadershipCount = office?._count.leadershipAssignments ?? 0;
  const forceExpanded = normalizedSearch.length > 0 || statusFilter !== "ALL";

  useEffect(() => {
    let active = true;

    setLoading(true);
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

          return response.data.find((item) => item.isActive)?.id ??
            response.data[0]?.id ??
            "";
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
    if (!selectedOfficeId) {
      setOffice(null);
      setTree([]);
      setOfficeActions(NO_ACTIONS);
      return;
    }

    let active = true;
    setLoadingWorkspace(true);
    setEditorMode(null);
    setEditorError("");

    Promise.all([
      getOrganizationOffice(accessToken, selectedOfficeId),
      getOrganizationTree(accessToken, selectedOfficeId),
      getOrganizationActions(accessToken, selectedOfficeId, null),
    ])
      .then(([officeResponse, treeResponse, actionsResponse]) => {
        if (!active) {
          return;
        }

        setOffice(officeResponse.office);
        setTree(treeResponse.tree);
        setOfficeActions(actionsResponse.availableActions);
        setSelectedUnitId((current) =>
          current && findUnit(treeResponse.tree, current) ? current : null,
        );
        setExpandedIds(
          new Set(
            flattenTree(treeResponse.tree)
              .filter((unit) => unit.children.length > 0)
              .map((unit) => unit.id),
          ),
        );
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
    if (!selectedOfficeId || !selectedUnitId) {
      setSelectedActions(NO_ACTIONS);
      return;
    }

    let active = true;
    setSelectedActions(NO_ACTIONS);

    getOrganizationActions(accessToken, selectedOfficeId, selectedUnitId)
      .then((response) => {
        if (active) {
          setSelectedActions(response.availableActions);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            getErrorMessage(
              requestError,
              t("errors.actionContextFailed"),
            ),
          );
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, selectedOfficeId, selectedUnitId, refreshVersion, t]);

  function refreshOrganization(message?: string): void {
    if (message) {
      setSuccess(message);
    }
    setError("");
    setEditorError("");
    setEditorMode(null);
    setRefreshVersion((current) => current + 1);
  }

  function selectUnit(unitId: string): void {
    setSelectedUnitId(unitId);
    setEditorMode(null);
    setEditorError("");
    setSuccess("");
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
    const defaultType = activeTypes[0]?.id ?? "";
    setCreateForm({
      parentOrgUnitId,
      orgUnitTypeId: defaultType,
      code: "",
      name: "",
      sortOrder: "0",
    });
    setEditorMode("CREATE");
    setEditorError("");
    setSuccess("");
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
    setEditorMode("EDIT");
    setEditorError("");
    setSuccess("");
  }

  function openMove(): void {
    if (!selectedUnit) {
      return;
    }

    setMoveForm({
      parentOrgUnitId: selectedUnit.parentOrgUnitId,
      sortOrder: String(selectedUnit.sortOrder),
    });
    setEditorMode("MOVE");
    setEditorError("");
    setSuccess("");
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
      const response = await createOrganizationUnit(
        accessToken,
        selectedOfficeId,
        {
          orgUnitTypeId: createForm.orgUnitTypeId,
          parentOrgUnitId: createForm.parentOrgUnitId,
          code,
          name,
          sortOrder: parseOrganizationSortOrder(createForm.sortOrder),
        },
      );

      refreshOrganization(response.message);
    } catch (requestError: unknown) {
      setEditorError(
        getErrorMessage(requestError, t("errors.operationFailed", { ns: "organization" })),
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
    } catch (requestError: unknown) {
      setEditorError(
        getErrorMessage(requestError, t("errors.operationFailed", { ns: "organization" })),
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
    } catch (requestError: unknown) {
      setEditorError(
        getErrorMessage(requestError, t("errors.operationFailed", { ns: "organization" })),
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitStatus(): Promise<void> {
    if (!selectedOfficeId || !selectedUnit) {
      return;
    }

    setSaving(true);
    setEditorError("");

    try {
      const response = await setOrganizationUnitStatus(
        accessToken,
        selectedOfficeId,
        selectedUnit.id,
        {
          isActive: !selectedUnit.isActive,
        },
      );

      refreshOrganization(response.message);
    } catch (requestError: unknown) {
      setEditorError(
        getErrorMessage(requestError, t("errors.operationFailed", { ns: "organization" })),
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedCanMutate =
    selectedActions.createChildUnit ||
    selectedActions.renameUnit ||
    selectedActions.moveUnit ||
    selectedActions.changeUnitStatus;
  const workspaceCanMutate = officeActions.createChildUnit || selectedCanMutate;

  return (
    <section className="organization-workspace">
      <header className="organization-workspace__hero">
        <div className="organization-workspace__hero-copy">
          <span className="organization-eyebrow">{t("hero.eyebrow")}</span>
          <h2>{t("hero.title")}</h2>
          <p>{t("hero.description")}</p>
        </div>

        <div className="organization-workspace__hero-controls">
          {offices.length > 1 && (
            <label className="organization-office-select">
              <span>{t("hero.office")}</span>
              <select
                value={selectedOfficeId}
                onChange={(event) => {
                  setSelectedOfficeId(event.target.value);
                  setSelectedUnitId(null);
                  setSuccess("");
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
          <span>{t("readonly.description")}</span>
        </div>
      )}

      <nav className="organization-workspace-tabs" aria-label={t("tabs.aria")}>
        <button
          type="button"
          className={workspaceView === "STRUCTURE" ? "is-active" : ""}
          onClick={() => setWorkspaceView("STRUCTURE")}
          aria-current={workspaceView === "STRUCTURE" ? "page" : undefined}
        >
          {t("tabs.structure")}
        </button>
        <button
          type="button"
          className={workspaceView === "PEOPLE" ? "is-active" : ""}
          onClick={() => {
            setWorkspaceView("PEOPLE");
            setEditorMode(null);
          }}
          aria-current={workspaceView === "PEOPLE" ? "page" : undefined}
        >
          {t("tabs.people")}
        </button>
        <button
          type="button"
          className={workspaceView === "LEADERSHIP" ? "is-active" : ""}
          onClick={() => {
            setWorkspaceView("LEADERSHIP");
            setEditorMode(null);
          }}
          aria-current={workspaceView === "LEADERSHIP" ? "page" : undefined}
        >
          {t("tabs.leadership")}
        </button>
      </nav>

      {workspaceView === "STRUCTURE" ? (
        <>
      <section className="organization-summary-grid" aria-label={t("summary.aria")}>
        <article className="organization-summary-card">
          <span>{t("summary.units")}</span>
          <strong>{allUnits.length}</strong>
          <small>{t("summary.unitsDetail", { active: activeUnitCount })}</small>
        </article>
        <article className="organization-summary-card">
          <span>{t("summary.people")}</span>
          <strong>{peopleCount}</strong>
          <small>{t("summary.peopleDetail")}</small>
        </article>
        <article className="organization-summary-card">
          <span>{t("summary.leadership")}</span>
          <strong>{leadershipCount}</strong>
          <small>{t("summary.leadershipDetail")}</small>
        </article>
        <article className="organization-summary-card">
          <span>{t("summary.teams")}</span>
          <strong>{teamCount}</strong>
          <small>{t("summary.teamsDetail")}</small>
        </article>
      </section>

      <section className="organization-control-bar" aria-label={t("filters.aria")}>
        <label>
          <span>{t("filters.search")}</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("filters.placeholder")}
          />
        </label>

        <label>
          <span>{t("filters.status")}</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as OrganizationStatusFilter)
            }
          >
            <option value="ALL">{t("filters.all")}</option>
            <option value="ACTIVE">{t("filters.active")}</option>
            <option value="INACTIVE">{t("filters.inactive")}</option>
          </select>
        </label>

        <div className="organization-control-bar__result">
          <strong>{t("filters.matching", { count: matchingUnitCount })}</strong>
          <span>{office?.name ?? t("common.notAvailable")}</span>
        </div>

        {(searchTerm || statusFilter !== "ALL") && (
          <button
            type="button"
            className="organization-control-bar__clear"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("ALL");
            }}
          >
            {t("filters.clear")}
          </button>
        )}
      </section>

      <div className="organization-workspace__grid">
        <section className="organization-tree-panel">
          <header className="organization-panel-heading">
            <div>
              <span>{t("tree.eyebrow")}</span>
              <h3>{t("tree.title")}</h3>
              <p>{t("tree.description")}</p>
            </div>

            {officeActions.createChildUnit && (
              <button
                type="button"
                className="organization-button organization-button--primary"
                onClick={() => openCreate(null)}
                disabled={activeTypes.length === 0}
              >
                {t("actions.createRoot")}
              </button>
            )}
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
          ) : filteredTree.length === 0 ? (
            <div className="organization-empty-state">
              <strong>{t("tree.emptyTitle")}</strong>
              <span>{t("tree.emptyDescription")}</span>
            </div>
          ) : (
            <div className="organization-tree" role="tree">
              {filteredTree.map((node) => (
                <OrganizationTree
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedUnitId={selectedUnitId}
                  expandedIds={expandedIds}
                  forceExpanded={forceExpanded}
                  onSelect={selectUnit}
                  onToggle={toggleUnit}
                />
              ))}
            </div>
          )}
        </section>

        <section className="organization-detail-panel">
          <header className="organization-panel-heading">
            <div>
              <span>{selectedUnit ? selectedUnit.orgUnitType.name : t("detail.office")}</span>
              <h3>{selectedUnit?.name ?? office?.name ?? t("detail.title")}</h3>
              <p>
                {selectedUnit
                  ? t("detail.unitDescription", { code: selectedUnit.code })
                  : t("detail.officeDescription")}
              </p>
            </div>
          </header>

          {selectedUnit ? (
            <>
              <div className="organization-detail-status-row">
                <span
                  className={
                    selectedUnit.isActive
                      ? "organization-status is-active"
                      : "organization-status"
                  }
                >
                  {selectedUnit.isActive ? t("common.active") : t("common.inactive")}
                </span>
                <span className="organization-type-chip">
                  {selectedUnit.orgUnitType.code}
                </span>
              </div>

              <dl className="organization-detail-facts">
                <div>
                  <dt>{t("detail.code")}</dt>
                  <dd>{selectedUnit.code}</dd>
                </div>
                <div>
                  <dt>{t("detail.parent")}</dt>
                  <dd>
                    {selectedUnit.parentOrgUnitId
                      ? findUnit(tree, selectedUnit.parentOrgUnitId)?.name ?? t("common.notAvailable")
                      : t("detail.officeRoot")}
                  </dd>
                </div>
                <div>
                  <dt>{t("detail.people")}</dt>
                  <dd>{selectedUnit._count.memberships}</dd>
                </div>
                <div>
                  <dt>{t("detail.children")}</dt>
                  <dd>{selectedUnit._count.childOrgUnits}</dd>
                </div>
                <div>
                  <dt>{t("detail.leadership")}</dt>
                  <dd>{selectedUnit._count.leadershipAssignments}</dd>
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
                    <button type="button" onClick={() => setEditorMode("STATUS")}>
                      {selectedUnit.isActive ? t("actions.deactivate") : t("actions.activate")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="organization-unit-readonly">
                  {t("readonly.unit")}
                </div>
              )}
            </>
          ) : office ? (
            <div className="organization-office-overview">
              <div className="organization-detail-status-row">
                <span
                  className={
                    office.isActive
                      ? "organization-status is-active"
                      : "organization-status"
                  }
                >
                  {office.isActive ? t("common.active") : t("common.inactive")}
                </span>
                <span className="organization-type-chip">{office.code}</span>
              </div>
              <p>{t("detail.selectUnit")}</p>
              {officeActions.createChildUnit && (
                <button
                  type="button"
                  className="organization-button organization-button--primary"
                  onClick={() => openCreate(null)}
                  disabled={activeTypes.length === 0}
                >
                  {t("actions.createRoot")}
                </button>
              )}
            </div>
          ) : null}

          {editorMode && office && (
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
                          : selectedUnit?.isActive
                            ? t("editor.deactivateTitle")
                            : t("editor.activateTitle")}
                  </h4>
                </div>
                <button
                  type="button"
                  className="organization-editor-close"
                  onClick={() => {
                    setEditorMode(null);
                    setEditorError("");
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
                      disabled={saving || !officeActions.createChildUnit}
                    >
                      <option value="">{t("editor.officeRoot", { office: office.name })}</option>
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
                          {type.name} ({type.code})
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

                  <label>
                    <span>{t("editor.sortOrder")}</span>
                    <input
                      type="number"
                      value={createForm.sortOrder}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          sortOrder: event.target.value,
                        }))
                      }
                      disabled={saving}
                    />
                  </label>

                  <footer>
                    <button
                      type="button"
                      className="organization-button organization-button--secondary"
                      onClick={() => setEditorMode(null)}
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

              {editorMode === "EDIT" && selectedUnit && (
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
                  <label>
                    <span>{t("editor.sortOrder")}</span>
                    <input
                      type="number"
                      value={editForm.sortOrder}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          sortOrder: event.target.value,
                        }))
                      }
                      disabled={saving}
                    />
                  </label>
                  <footer>
                    <button
                      type="button"
                      className="organization-button organization-button--secondary"
                      onClick={() => setEditorMode(null)}
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

              {editorMode === "MOVE" && selectedUnit && (
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
                      <option value="">{t("editor.officeRoot", { office: office.name })}</option>
                      {moveCandidates.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name} ({unit.code})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t("editor.sortOrder")}</span>
                    <input
                      type="number"
                      value={moveForm.sortOrder}
                      onChange={(event) =>
                        setMoveForm((current) => ({
                          ...current,
                          sortOrder: event.target.value,
                        }))
                      }
                      disabled={saving}
                    />
                  </label>
                  <div className="organization-editor-note">
                    {t("editor.moveNotice")}
                  </div>
                  <footer>
                    <button
                      type="button"
                      className="organization-button organization-button--secondary"
                      onClick={() => setEditorMode(null)}
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
                  <div className="organization-editor-note">
                    {selectedUnit.isActive
                      ? t("editor.deactivateNotice")
                      : t("editor.activateNotice")}
                  </div>
                  <footer>
                    <button
                      type="button"
                      className="organization-button organization-button--secondary"
                      onClick={() => setEditorMode(null)}
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
                      disabled={saving}
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
            </section>
          )}
        </section>
      </div>
        </>
      ) : office ? (
        workspaceView === "PEOPLE" ? (
          <OrganizationPeoplePanel
            accessToken={accessToken}
            office={office}
            tree={tree}
          />
        ) : (
          <OrganizationLeadershipPanel
            accessToken={accessToken}
            office={office}
            tree={tree}
          />
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
