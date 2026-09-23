import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import { useAuth } from "../context/AuthContext";
import { deleteOperationalTeam, getOperationalTeam } from "../services/team-management.service";
import type { OperationalTeam } from "../types/team-management";

function getError(error: unknown): string {
  return error instanceof Error ? error.message : "Team details could not load.";
}
function nameOf(employee: { empName?: string; name?: string }): string {
  return employee.empName ?? employee.name ?? "Employee";
}

export function TeamDetailPage() {
  const { t } = useTranslation("teams");
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [team, setTeam] = useState<OperationalTeam | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!accessToken || !teamId) return;
    let active = true;
    getOperationalTeam(accessToken, teamId)
      .then((result) => { if (active) setTeam(result); })
      .catch((requestError) => { if (active) setError(getError(requestError)); });
    return () => { active = false; };
  }, [accessToken, teamId]);

  async function remove() {
    if (!accessToken || !teamId || !team) return;
    const confirmed = window.confirm(t("simple.deleteConfirm", { name: team.name }));
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteOperationalTeam(accessToken, teamId);
      navigate("/team-management", { replace: true });
    } catch (requestError) {
      setError(getError(requestError));
      setDeleting(false);
    }
  }

  if (!team) return <main className="team-workspace"><section className="team-empty-state"><p>{error || t("simple.loading")}</p></section></main>;

  return (
    <main className="team-workspace team-workspace--detail">
      <section className="team-page-heading team-page-heading--compact team-page-heading--detail">
        <div className="team-page-heading__content team-page-heading__content--detail">
          <div className="team-page-heading__team-mark" aria-hidden="true">{team.name.slice(0, 2).toUpperCase()}</div>
          <div><span>{team.orgUnit.name}</span><h1>{team.name}</h1><p>{t("simple.detailHelp")}</p></div>
        </div>
        <button type="button" className="team-secondary-button" onClick={() => navigate("/team-management")}>{t("simple.back")}</button>
      </section>

      {error ? <div className="team-inline-message team-inline-message--error" role="alert">{error}</div> : null}

      <section className="team-detail-card team-detail-card--polished">
        <div className="team-detail-summary team-detail-summary--cards">
          <div><span>{t("simple.belongsTo")}</span><strong>{team.orgUnit.name}</strong><small>{team.office.name}</small></div>
          <div><span>{t("simple.teamLead")}</span><strong>{team.lead ? nameOf(team.lead.employee) : t("simple.noLead")}</strong>{team.lead ? <small>{team.lead.employee.empId}</small> : null}</div>
          <div><span>{t("simple.members")}</span><strong>{team.members.length}</strong></div>
        </div>

        <div className="team-detail-members team-detail-members--surface">
          <div className="team-detail-members__heading"><h2>{t("simple.members")}</h2><span className="team-selection-badge team-selection-badge--compact">{team.members.length}</span></div>
          <div className="team-detail-member-list">
            {team.members.map((row) => <div key={row.membershipId} className={team.lead?.employee.id === row.employee.id ? "team-detail-member team-detail-member--lead" : "team-detail-member"}><div className="team-detail-member__identity"><span className="team-detail-member__avatar" aria-hidden="true">{nameOf(row.employee).slice(0, 2).toUpperCase()}</span><div><strong>{nameOf(row.employee)}</strong><small>{row.employee.empId}{row.employee.designation ? ` · ${row.employee.designation}` : ""}</small></div></div>{team.lead?.employee.id === row.employee.id ? <em>{t("simple.teamLead")}</em> : null}</div>)}
          </div>
        </div>

        <footer className="team-detail-actions team-detail-actions--elevated">
          <button type="button" className="team-secondary-button" onClick={() => navigate(`/team-management/${team.id}/edit`)}>{t("simple.edit")}</button>
          <button type="button" className="team-danger-button" onClick={() => void remove()} disabled={deleting}>{deleting ? t("simple.deleting") : t("simple.delete")}</button>
        </footer>
      </section>
    </main>
  );
}
