import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { useAuth } from "../context/AuthContext";
import {
  createDepartmentTeam,
  deleteDepartmentTeam,
  getDepartmentTeam,
  getTeamManagementContext,
  listDepartmentTeamMembers,
  listDepartmentTeams,
  updateDepartmentTeam,
} from "../services/team-management.service";
import type {
  DepartmentTeam,
  TeamDepartmentOption,
  TeamManagementContext,
  TeamMemberOption,
} from "../types/team-management";

type FormMode = "CREATE" | "EDIT";

interface TeamFormState {
  mode: FormMode;
  teamId: string | null;
  departmentId: string;
  teamName: string;
  memberIds: string[];
  adminEmployeeId: string;
}

const emptyForm: TeamFormState = {
  mode: "CREATE",
  teamId: null,
  departmentId: "",
  teamName: "",
  memberIds: [],
  adminEmployeeId: "",
};

function errorMessage(error: unknown, t: TFunction<"teams">): string {
  return error instanceof Error
    ? error.message
    : t("errorFallback", { ns: "teams" });
}

function initials(name: string): string {
  const result = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return result || "TM";
}

function teamUseLabel(teamCount: number, t: TFunction<"teams">): string {
  if (teamCount === 0) {
    return t("membership.none", { ns: "teams" });
  }

  return teamCount === 1
    ? t("membership.one", { ns: "teams" })
    : t("membership.many", { ns: "teams", teamCount });
}

function departmentLabel(department: TeamDepartmentOption): string {
  return `${department.division.name} · ${department.name}`;
}

export function TeamManagementPage() {
  const { t } = useTranslation("teams");
  const { accessToken } = useAuth();
  const [context, setContext] = useState<TeamManagementContext | null>(null);
  const [teams, setTeams] = useState<DepartmentTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<DepartmentTeam | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState<TeamFormState | null>(null);
  const [formSnapshot, setFormSnapshot] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [members, setMembers] = useState<TeamMemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DepartmentTeam | null>(null);
  const [deleting, setDeleting] = useState(false);

  const noticeTimerRef = useRef<number | null>(null);

  const filteredDepartments = useMemo(() => {
    if (!context) {
      return [];
    }

    return divisionId
      ? context.departments.filter(
          (department) => department.divisionId === divisionId,
        )
      : context.departments;
  }, [context, divisionId]);

  const selectedMembers = useMemo(() => {
    if (!form) {
      return [];
    }

    const memberMap = new Map(members.map((member) => [member.id, member]));
    return form.memberIds
      .map((id) => memberMap.get(id))
      .filter((member): member is TeamMemberOption => Boolean(member));
  }, [form, members]);

  const formChanged = useMemo(() => {
    if (!form) {
      return false;
    }

    return JSON.stringify(form) !== formSnapshot;
  }, [form, formSnapshot]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    getTeamManagementContext(accessToken)
      .then((result) => {
        if (!active) {
          return;
        }

        setContext(result);
        if (result.scope.type === "DEPARTMENT") {
          setDivisionId(result.scope.division?.id ?? "");
          setDepartmentId(result.scope.department?.id ?? "");
        } else if (result.scope.type === "DIVISION") {
          setDivisionId(result.scope.division?.id ?? "");
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(errorMessage(requestError, t));
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
  }, [accessToken, t]);

  useEffect(() => {
    if (!accessToken || !context) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError("");

      listDepartmentTeams(accessToken, {
        divisionId: divisionId || undefined,
        departmentId: departmentId || undefined,
        search: search || undefined,
      })
        .then((result) => {
          setTeams(result.items);
          if (selectedTeam) {
            const refreshed = result.items.find(
              (team) => team.id === selectedTeam.id,
            );
            if (refreshed) {
              setSelectedTeam(refreshed);
            }
          }
        })
        .catch((requestError) => {
          setError(errorMessage(requestError, t));
        })
        .finally(() => {
          setLoading(false);
        });
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, context, departmentId, divisionId, search, t]);

  useEffect(() => {
    if (!accessToken || !form?.departmentId) {
      setMembers([]);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMembersLoading(true);
      setFormError("");

      listDepartmentTeamMembers(accessToken, {
        departmentId: form.departmentId,
        search: memberSearch || undefined,
      })
        .then((result) => {
          setMembers((current) => {
            const selectedFromCurrent = current.filter((member) =>
              form.memberIds.includes(member.id),
            );
            const merged = new Map<string, TeamMemberOption>();
            [...selectedFromCurrent, ...result.items].forEach((member) => {
              merged.set(member.id, member);
            });
            return [...merged.values()].sort((a, b) =>
              a.name.localeCompare(b.name),
            );
          });
        })
        .catch((requestError) => {
          setFormError(errorMessage(requestError, t));
        })
        .finally(() => {
          setMembersLoading(false);
        });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, form?.departmentId, memberSearch, t]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  function showNotice(message: string): void {
    setNotice(message);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 3200);
  }

  function defaultDepartmentForCreate(): string {
    if (!context) {
      return "";
    }

    if (context.scope.type === "DEPARTMENT") {
      return context.scope.department?.id ?? "";
    }

    if (departmentId) {
      return departmentId;
    }

    return filteredDepartments.length === 1 ? filteredDepartments[0]?.id ?? "" : "";
  }

  function openCreateForm(): void {
    const nextForm: TeamFormState = {
      ...emptyForm,
      departmentId: defaultDepartmentForCreate(),
    };
    setForm(nextForm);
    setFormSnapshot(JSON.stringify(nextForm));
    setMemberSearch("");
    setMembers([]);
    setFormError("");
    setOpenMenuId(null);
  }

  async function openEditForm(team: DepartmentTeam): Promise<void> {
    if (!accessToken) {
      return;
    }

    setOpenMenuId(null);
    setFormError("");
    setMembersLoading(true);

    try {
      const detail = await getDepartmentTeam(accessToken, team.id);
      const nextForm: TeamFormState = {
        mode: "EDIT",
        teamId: detail.id,
        departmentId: detail.department.id,
        teamName: detail.name,
        memberIds: detail.members.map((member) => member.id),
        adminEmployeeId: detail.admin.id,
      };
      setMembers(
        detail.members.map((member) => ({
          id: member.id,
          empId: member.empId,
          name: member.name,
          designation: member.designation,
          teamCount: member.teamCount,
        })),
      );
      setForm(nextForm);
      setFormSnapshot(JSON.stringify(nextForm));
      setMemberSearch("");
    } catch (requestError) {
      setError(errorMessage(requestError, t));
    } finally {
      setMembersLoading(false);
    }
  }

  function requestCloseForm(): void {
    if (formChanged) {
      setShowDiscardConfirm(true);
      return;
    }

    closeForm();
  }

  function closeForm(): void {
    setForm(null);
    setFormSnapshot("");
    setMemberSearch("");
    setMembers([]);
    setFormError("");
    setShowDiscardConfirm(false);
  }

  function toggleMember(memberId: string): void {
    setForm((current) => {
      if (!current) {
        return current;
      }

      const selected = current.memberIds.includes(memberId);
      const memberIds = selected
        ? current.memberIds.filter((id) => id !== memberId)
        : [...current.memberIds, memberId];
      const adminEmployeeId =
        current.adminEmployeeId === memberId && selected
          ? ""
          : current.adminEmployeeId;

      return {
        ...current,
        memberIds,
        adminEmployeeId,
      };
    });
  }

  function removeSelectedMember(memberId: string): void {
    toggleMember(memberId);
  }

  function setFormDepartment(nextDepartmentId: string): void {
    setForm((current) =>
      current
        ? {
            ...current,
            departmentId: nextDepartmentId,
            memberIds: [],
            adminEmployeeId: "",
          }
        : current,
    );
    setMembers([]);
    setMemberSearch("");
  }

  async function saveTeam(): Promise<void> {
    if (!accessToken || !form) {
      return;
    }

    const teamName = form.teamName.trim();
    if (!form.departmentId) {
      setFormError(t("form.validationDepartment"));
      return;
    }
    if (!teamName) {
      setFormError(t("form.validationName"));
      return;
    }
    if (form.memberIds.length === 0) {
      setFormError(t("form.validationMembers"));
      return;
    }
    if (!form.adminEmployeeId) {
      setFormError(t("form.validationAdmin"));
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const input = {
        teamName,
        memberEmployeeIds: form.memberIds,
        adminEmployeeId: form.adminEmployeeId,
      };
      const result =
        form.mode === "CREATE"
          ? await createDepartmentTeam(accessToken, {
              ...input,
              departmentId: form.departmentId,
            })
          : await updateDepartmentTeam(accessToken, form.teamId ?? "", input);

      setTeams((current) => {
        const withoutSaved = current.filter((team) => team.id !== result.team.id);
        return [...withoutSaved, result.team].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      });
      if (selectedTeam?.id === result.team.id) {
        setSelectedTeam(result.team);
      }
      closeForm();
      showNotice(result.message);
    } catch (requestError) {
      setFormError(errorMessage(requestError, t));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!accessToken || !deleteTarget) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const result = await deleteDepartmentTeam(accessToken, deleteTarget.id);
      setTeams((current) =>
        current.filter((team) => team.id !== deleteTarget.id),
      );
      if (selectedTeam?.id === deleteTarget.id) {
        setSelectedTeam(null);
      }
      setDeleteTarget(null);
      showNotice(result.message);
    } catch (requestError) {
      setError(errorMessage(requestError, t));
    } finally {
      setDeleting(false);
    }
  }

  const scopeLabel =
    context?.scope.type === "DEPARTMENT"
      ? context.scope.department?.name
      : context?.scope.type === "DIVISION"
        ? context.scope.division?.name
        : t("page.teams");

  return (
    <main className="team-management-page">
      <div className="team-management-page__canvas">
        <section className="team-management-hero">
          <div>
            <span>{t("page.eyebrow")}</span>
            <h1>{t("page.title")}</h1>
            <p>{t("page.description")}</p>
          </div>
          <div className="team-management-hero__actions">
            <div className="team-management-scope">
              <small>{t("page.managing")}</small>
              <strong>{scopeLabel ?? t("page.teams")}</strong>
            </div>
            <button type="button" onClick={openCreateForm}>
              <span aria-hidden="true">+</span>
              {t("page.create")}
            </button>
          </div>
        </section>

        {notice ? (
          <div className="team-management-notice" role="status">
            {notice}
          </div>
        ) : null}

        <section className="team-management-toolbar" aria-label={t("page.filtersAria")}>
          <label className="team-management-search">
            <span>{t("search.label")}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("search.placeholder")}
            />
          </label>

          {context?.scope.type === "BRANCH" ? (
            <label>
              <span>{t("common.division")}</span>
              <select
                value={divisionId}
                onChange={(event) => {
                  setDivisionId(event.target.value);
                  setDepartmentId("");
                }}
              >
                <option value="">{t("common.allDivisions")}</option>
                {context.divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {context && context.scope.type !== "DEPARTMENT" ? (
            <label>
              <span>{t("common.department")}</span>
              <select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">{t("common.allDepartments")}</option>
                {filteredDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {context.scope.type === "BRANCH"
                      ? departmentLabel(department)
                      : department.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>

        {error ? (
          <section className="team-management-state team-management-state--error">
            <div>
              <strong>{t("state.loadError")}</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => window.location.reload()}>
              {t("state.tryAgain")}
            </button>
          </section>
        ) : loading && teams.length === 0 ? (
          <section className="team-management-state">
            <span className="team-management-loader" aria-hidden="true" />
            <p>{t("state.loading")}</p>
          </section>
        ) : teams.length === 0 ? (
          <section className="team-management-state team-management-state--empty">
            <div className="team-management-empty-icon" aria-hidden="true">TM</div>
            <h2>{search ? t("state.noSearch") : t("state.none")}</h2>
            {!search ? (
              <>
                <p>{t("state.noneDescription")}</p>
                <button type="button" onClick={openCreateForm}>{t("state.create")}</button>
              </>
            ) : null}
          </section>
        ) : (
          <section className="team-management-grid" aria-label={t("page.gridAria")}>
            {teams.map((team, index) => (
              <article
                className="team-card"
                key={team.id}
                style={{ "--team-card-index": index } as CSSProperties}
                onClick={() => setSelectedTeam(team)}
              >
                <header>
                  <div>
                    <small>{team.department.name}</small>
                    <h2>{team.name}</h2>
                  </div>
                  <div className="team-card__menu-wrap">
                    <button
                      type="button"
                      className="team-card__menu-button"
                      aria-label={t("card.actionsAria", { name: team.name })}
                      aria-expanded={openMenuId === team.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenuId((current) =>
                          current === team.id ? null : team.id,
                        );
                      }}
                    >
                      •••
                    </button>
                    {openMenuId === team.id ? (
                      <div className="team-card__menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openEditForm(team);
                          }}
                        >
                          {t("card.edit")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(team);
                            setOpenMenuId(null);
                          }}
                        >
                          {t("card.delete")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </header>

                <div className="team-card__admin">
                  <span>{initials(team.admin.name)}</span>
                  <div>
                    <small>{t("common.teamAdmin")}</small>
                    <strong>{team.admin.name}</strong>
                  </div>
                </div>

                <footer>
                  <div className="team-card__avatars" aria-label={t("card.membersAria", { count: team.memberCount })}>
                    {team.members.slice(0, 3).map((member) => (
                      <span key={member.id} title={member.name}>
                        {initials(member.name)}
                      </span>
                    ))}
                    {team.memberCount > 3 ? <span>+{team.memberCount - 3}</span> : null}
                  </div>
                  <strong>{t("card.memberCount", { count: team.memberCount })}</strong>
                </footer>
              </article>
            ))}
          </section>
        )}
      </div>

      {selectedTeam ? (
        <div className="team-detail-backdrop" onClick={() => setSelectedTeam(null)}>
          <aside
            className="team-detail-panel"
            aria-label={t("card.detailAria", { name: selectedTeam.name })}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>{selectedTeam.department.name}</small>
                <h2>{selectedTeam.name}</h2>
              </div>
              <button type="button" aria-label={t("card.closeDetails")} onClick={() => setSelectedTeam(null)}>×</button>
            </header>

            <section className="team-detail-admin">
              <span>{initials(selectedTeam.admin.name)}</span>
              <div>
                <small>{t("common.teamAdmin")}</small>
                <strong>{selectedTeam.admin.name}</strong>
                <p>{selectedTeam.admin.empId}{selectedTeam.admin.designation ? ` · ${selectedTeam.admin.designation}` : ""}</p>
              </div>
            </section>

            <section className="team-detail-members">
              <div>
                <h3>{t("common.members")}</h3>
                <span>{selectedTeam.memberCount}</span>
              </div>
              <ul>
                {selectedTeam.members.map((member) => (
                  <li key={member.id}>
                    <span>{initials(member.name)}</span>
                    <div>
                      <strong>{member.name}</strong>
                      <small>{member.empId}{member.designation ? ` · ${member.designation}` : ""}</small>
                    </div>
                    {member.isAdmin ? <em>{t("common.admin")}</em> : null}
                  </li>
                ))}
              </ul>
            </section>

            <footer>
              <button type="button" onClick={() => void openEditForm(selectedTeam)}>{t("card.edit")}</button>
            </footer>
          </aside>
        </div>
      ) : null}

      {form ? (
        <div className="team-form-backdrop" onClick={requestCloseForm}>
          <section
            className="team-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-form-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>{form.mode === "CREATE" ? t("form.new") : t("form.update")}</small>
                <h2 id="team-form-title">{form.mode === "CREATE" ? t("form.create") : t("form.edit")}</h2>
              </div>
              <button type="button" aria-label={t("form.close")} onClick={requestCloseForm}>×</button>
            </header>

            <div className="team-form-body">
              {formError ? <div className="team-form-error" role="alert">{formError}</div> : null}

              {form.mode === "CREATE" && context?.scope.type !== "DEPARTMENT" ? (
                <label className="team-form-field">
                  <span>{t("form.departmentRequired")}</span>
                  <select
                    value={form.departmentId}
                    onChange={(event) => setFormDepartment(event.target.value)}
                  >
                    <option value="">{t("form.chooseDepartment")}</option>
                    {context?.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {departmentLabel(department)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="team-form-field">
                <span>{t("form.nameRequired")}</span>
                <input
                  value={form.teamName}
                  maxLength={120}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, teamName: event.target.value } : current,
                    )
                  }
                  placeholder={t("form.namePlaceholder")}
                />
              </label>

              <section className="team-member-picker">
                <div className="team-member-picker__heading">
                  <div>
                    <span>{t("form.membersRequired")}</span>
                    <small>{t("form.selected", { count: form.memberIds.length })}</small>
                  </div>
                  <input
                    type="search"
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder={t("form.memberSearch")}
                    disabled={!form.departmentId}
                  />
                </div>

                {selectedMembers.length > 0 ? (
                  <div className="team-member-chips">
                    {selectedMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => removeSelectedMember(member.id)}
                      >
                        {member.name}<span aria-hidden="true">×</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="team-member-list">
                  {!form.departmentId ? (
                    <p>{t("form.chooseDepartmentFirst")}</p>
                  ) : membersLoading ? (
                    <p>{t("form.loadingEmployees")}</p>
                  ) : members.length === 0 ? (
                    <p>{t("form.noEmployees")}</p>
                  ) : (
                    members.map((member) => {
                      const checked = form.memberIds.includes(member.id);
                      return (
                        <label key={member.id} className={checked ? "selected" : ""}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMember(member.id)}
                          />
                          <span className="team-member-list__avatar">{initials(member.name)}</span>
                          <span className="team-member-list__copy">
                            <strong>{member.name}</strong>
                            <small>{member.empId}{member.designation ? ` · ${member.designation}` : ""}</small>
                          </span>
                          <em>{teamUseLabel(member.teamCount, t)}</em>
                        </label>
                      );
                    })
                  )}
                </div>
              </section>

              <label className="team-form-field">
                <span>{t("form.adminRequired")}</span>
                <select
                  value={form.adminEmployeeId}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, adminEmployeeId: event.target.value }
                        : current,
                    )
                  }
                  disabled={selectedMembers.length === 0}
                >
                  <option value="">{t("form.chooseAdmin")}</option>
                  {selectedMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.empId}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <footer>
              <button type="button" className="secondary" onClick={requestCloseForm}>{t("common.cancel")}</button>
              <button type="button" onClick={() => void saveTeam()} disabled={saving}>
                {saving ? t("form.saving") : form.mode === "CREATE" ? t("form.create") : t("form.save")}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {showDiscardConfirm ? (
        <div className="team-confirm-backdrop">
          <section className="team-confirm-dialog" role="alertdialog" aria-modal="true">
            <h2>{t("discard.title")}</h2>
            <p>{t("discard.description")}</p>
            <div>
              <button type="button" onClick={() => setShowDiscardConfirm(false)}>{t("discard.continue")}</button>
              <button type="button" className="danger" onClick={closeForm}>{t("discard.discard")}</button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="team-confirm-backdrop">
          <section className="team-confirm-dialog" role="alertdialog" aria-modal="true">
            <h2>{t("delete.title", { name: deleteTarget.name })}</h2>
            <p>{t("delete.description")}</p>
            <div>
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t("delete.keep")}</button>
              <button type="button" className="danger" onClick={() => void confirmDelete()} disabled={deleting}>
                {deleting ? t("delete.deleting") : t("delete.confirm")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
