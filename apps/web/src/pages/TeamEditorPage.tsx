import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import { TeamHierarchySelector } from "../components/team-management/TeamHierarchySelector";
import { useAuth } from "../context/AuthContext";
import {
  createOperationalTeam,
  getOperationalTeam,
  getTeamManagementContext,
  listOperationalTeamMembers,
  updateOperationalTeam,
} from "../services/team-management.service";
import type { OperationalTeamMemberOption, TeamManagementContext } from "../types/team-management";

function getError(error: unknown): string {
  return error instanceof Error ? error.message : "The team could not be saved.";
}

export function TeamEditorPage() {
  const { t } = useTranslation("teams");
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const { teamId } = useParams();
  const editing = Boolean(teamId);
  const [context, setContext] = useState<TeamManagementContext | null>(null);
  const [orgUnitId, setOrgUnitId] = useState("");
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [leadEmployeeId, setLeadEmployeeId] = useState("");
  const [members, setMembers] = useState<OperationalTeamMemberOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    Promise.all([
      getTeamManagementContext(accessToken),
      teamId ? getOperationalTeam(accessToken, teamId) : Promise.resolve(null),
    ]).then(([nextContext, team]) => {
      if (!active) return;
      setContext(nextContext);
      if (team) {
        setOrgUnitId(team.orgUnitId);
        setName(team.name);
        setMemberIds(team.members.map((row) => row.employee.id));
        setLeadEmployeeId(team.lead?.employee.id ?? "");
        setMembers(team.members.map((row) => ({
          id: row.employee.id,
          empId: row.employee.empId,
          name: row.employee.empName ?? row.employee.name ?? "Employee",
          designation: row.employee.designation,
          teamCount: 0,
        })));
      } else if (nextContext.orgUnits.length === 1) {
        setOrgUnitId(nextContext.orgUnits[0]?.id ?? "");
      }
    }).catch((requestError) => { if (active) setError(getError(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, teamId]);

  useEffect(() => {
    if (!accessToken || !orgUnitId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      listOperationalTeamMembers(accessToken, { orgUnitId, search: search || undefined })
        .then((result) => {
          if (!active) return;
          setMembers((current) => {
            const selected = current.filter((member) => memberIds.includes(member.id));
            return [...new Map([...selected, ...result.data].map((member) => [member.id, member])).values()];
          });
        })
        .catch((requestError) => { if (active) setError(getError(requestError)); });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, memberIds, orgUnitId, search]);

  const selectedMembers = useMemo(() => {
    const byId = new Map(members.map((member) => [member.id, member]));
    return memberIds.map((id) => byId.get(id)).filter((member): member is OperationalTeamMemberOption => Boolean(member));
  }, [memberIds, members]);

  function toggleMember(id: string) {
    setMemberIds((current) => {
      const selected = current.includes(id);
      if (selected && leadEmployeeId === id) setLeadEmployeeId("");
      return selected ? current.filter((value) => value !== id) : [...current, id];
    });
  }

  async function save() {
    if (!accessToken || !orgUnitId || !name.trim() || memberIds.length === 0 || !leadEmployeeId) {
      setError(t("simple.validation"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const input = { name: name.trim(), memberEmployeeIds: memberIds, leadEmployeeId };
      const result = editing && teamId
        ? await updateOperationalTeam(accessToken, teamId, input)
        : await createOperationalTeam(accessToken, { ...input, orgUnitId });
      navigate(`/team-management/${result.team.id}`, { replace: true });
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="team-workspace"><section className="team-empty-state"><p>{t("simple.loading")}</p></section></main>;

  return (
    <main className="team-workspace team-workspace--editor">
      <section className="team-page-heading team-page-heading--compact team-page-heading--hero">
        <div className="team-page-heading__content">
          <span>{editing ? t("simple.editEyebrow") : t("simple.newEyebrow")}</span>
          <h1>{editing ? t("simple.editTitle") : t("simple.newTitle")}</h1>
          <p>{t("simple.editorHelp")}</p>
        </div>
        <div className="team-page-heading__actions">
          <div className="team-page-heading__badge">Nepal Telecom team setup</div>
          <button type="button" className="team-secondary-button" onClick={() => navigate(editing && teamId ? `/team-management/${teamId}` : "/team-management")}>{t("common.cancel")}</button>
        </div>
      </section>

      {error ? <div className="team-inline-message team-inline-message--error" role="alert">{error}</div> : null}

      <section className="team-editor-card team-editor-card--form">
        <div className="team-editor-section team-editor-section--surface">
          <div className="team-editor-section__intro">
            <h2>{t("simple.belongsTo")}</h2>
            <p>{editing ? t("simple.ownerLocked") : t("simple.belongsToHelp")}</p>
          </div>
          {context ? <TeamHierarchySelector units={context.orgUnits} value={orgUnitId} onChange={(value) => { setOrgUnitId(value); setMemberIds([]); setLeadEmployeeId(""); setMembers([]); }} disabled={editing} /> : null}
        </div>

        <label className="team-editor-field team-editor-field--feature">
          <span>{t("simple.teamName")}</span>
          <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={t("simple.teamNamePlaceholder")} />
        </label>

        <div className="team-editor-section team-editor-section--surface">
          <div className="team-editor-section__heading team-editor-section__heading--members">
            <div>
              <h2>{t("simple.chooseMembers")}</h2>
              <p>{t("simple.membersHelp")}</p>
            </div>
            <strong className="team-selection-badge">{t("simple.selectedCount", { count: memberIds.length })}</strong>
          </div>
          <div className="team-member-picker">
            <input className="team-member-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("simple.memberSearch")} disabled={!orgUnitId} />
            <div className="team-member-choice-list team-member-choice-list--elevated">
              {!orgUnitId ? <p>{t("simple.chooseBranchFirst")}</p> : members.length === 0 ? <p>{t("simple.noEmployees")}</p> : members.map((member) => {
                const checked = memberIds.includes(member.id);
                return <label key={member.id} className={checked ? "selected" : ""}>
                  <input type="checkbox" checked={checked} onChange={() => toggleMember(member.id)} />
                  <span><strong>{member.name}</strong><small>{member.empId}{member.designation ? ` · ${member.designation}` : ""}</small></span>
                  <em>{member.teamCount === 0 ? t("membership.none") : member.teamCount === 1 ? t("membership.one") : t("membership.many", { teamCount: member.teamCount })}</em>
                </label>;
              })}
            </div>
          </div>
        </div>

        <label className="team-editor-field team-editor-field--feature">
          <span>{t("simple.teamLead")}</span>
          <select value={leadEmployeeId} onChange={(event) => setLeadEmployeeId(event.target.value)} disabled={selectedMembers.length === 0}><option value="">{t("simple.chooseLead")}</option>{selectedMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.empId}</option>)}</select>
          <small>{t("simple.teamLeadHelp")}</small>
        </label>

        <footer className="team-editor-actions team-editor-actions--elevated"><button type="button" className="team-secondary-button" onClick={() => navigate(editing && teamId ? `/team-management/${teamId}` : "/team-management")}>{t("common.cancel")}</button><button type="button" className="team-primary-button" onClick={() => void save()} disabled={saving}>{saving ? t("simple.saving") : editing ? t("simple.save") : t("simple.create")}</button></footer>
      </section>
    </main>
  );
}
