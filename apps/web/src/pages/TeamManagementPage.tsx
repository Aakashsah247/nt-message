import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { TeamHierarchySelector } from "../components/team-management/TeamHierarchySelector";
import { useAuth } from "../context/AuthContext";
import { getTeamManagementContext, listOperationalTeams } from "../services/team-management.service";
import type { OperationalTeam, TeamManagementContext } from "../types/team-management";

function nameOf(employee: { empName?: string; name?: string }): string {
  return employee.empName ?? employee.name ?? "Employee";
}

function getError(error: unknown): string {
  return error instanceof Error ? error.message : "Team Management could not load.";
}

export function TeamManagementPage() {
  const { t } = useTranslation("teams");
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [context, setContext] = useState<TeamManagementContext | null>(null);
  const [teams, setTeams] = useState<OperationalTeam[]>([]);
  const [orgUnitId, setOrgUnitId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getTeamManagementContext(accessToken)
      .then((result) => { if (active) setContext(result); })
      .catch((requestError) => { if (active) setError(getError(requestError)); });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !context) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      listOperationalTeams(accessToken, { orgUnitId: orgUnitId || undefined, search: search || undefined })
        .then((result) => { if (active) { setTeams(result.data); setError(""); } })
        .catch((requestError) => { if (active) setError(getError(requestError)); })
        .finally(() => { if (active) setLoading(false); });
    }, 160);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, context, orgUnitId, search]);

  return (
    <main className="team-workspace team-workspace--list">
      <section className="team-page-heading team-page-heading--list">
        <div className="team-page-heading__content">
          <span>{t("simple.eyebrow")}</span>
          <h1>{t("simple.title")}</h1>
          <p>{t("simple.description")}</p>
        </div>
        <div className="team-page-heading__actions">
          <div className="team-page-heading__badge" aria-hidden="true">NT</div>
          <button className="team-primary-button" type="button" onClick={() => navigate("/team-management/new")} disabled={!context?.orgUnits.length}>
            {t("simple.create")}
          </button>
        </div>
      </section>

      <section className="team-toolbar team-toolbar--management">
        <label className="team-search-field team-search-field--prominent">
          <span>{t("simple.searchLabel")}</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("simple.searchPlaceholder")} />
        </label>
        <div className="team-toolbar__hierarchy">
          {context ? <TeamHierarchySelector units={context.orgUnits} value={orgUnitId} onChange={setOrgUnitId} allowAll /> : null}
        </div>
      </section>

      {error ? <div className="team-inline-message team-inline-message--error" role="alert">{error}</div> : null}

      {loading ? (
        <section className="team-empty-state"><p>{t("simple.loading")}</p></section>
      ) : teams.length === 0 ? (
        <section className="team-empty-state">
          <div className="team-empty-state__icon" aria-hidden="true">TM</div>
          <h2>{search ? t("simple.noMatch") : t("simple.empty")}</h2>
          <p>{search ? t("simple.noMatchHelp") : t("simple.emptyHelp")}</p>
          {!search ? <button type="button" className="team-primary-button" onClick={() => navigate("/team-management/new")}>{t("simple.create")}</button> : null}
        </section>
      ) : (
        <section className="team-card-grid" aria-label={t("simple.teamList") }>
          {teams.map((team, index) => (
            <article className="team-summary-card team-summary-card--interactive" key={team.id} style={{ "--team-card-order": index } as CSSProperties}>
              <div className="team-summary-card__top">
                <div className="team-summary-card__identity">
                  <div className="team-summary-card__mark" aria-hidden="true">{team.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <span>{team.orgUnit.name}</span>
                    <h2>{team.name}</h2>
                  </div>
                </div>
                <button type="button" onClick={() => navigate(`/team-management/${team.id}`)}>{t("simple.open")}</button>
              </div>
              <div className="team-summary-card__facts">
                <div><span>{t("simple.teamLead")}</span><strong>{team.lead ? nameOf(team.lead.employee) : t("simple.noLead")}</strong></div>
                <div><span>{t("simple.members")}</span><strong>{team.members.length}</strong></div>
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="team-removed-link-row"><button className="team-removed-link" type="button" onClick={() => navigate("/team-management/removed")}>{t("simple.viewRemoved")}</button></div>
    </main>
  );
}
