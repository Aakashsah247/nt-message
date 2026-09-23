import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { useAuth } from "../context/AuthContext";
import { listOperationalTeams, restoreOperationalTeam } from "../services/team-management.service";
import type { OperationalTeam } from "../types/team-management";

function getError(error: unknown): string {
  return error instanceof Error ? error.message : "Removed teams could not load.";
}

export function RemovedTeamsPage() {
  const { t } = useTranslation("teams");
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<OperationalTeam[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    listOperationalTeams(accessToken, { status: "removed" })
      .then((result) => {
        if (!active) return;
        setTeams(result.data);
        setError("");
      })
      .catch((requestError) => {
        if (active) setError(getError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  async function restore(teamId: string) {
    if (!accessToken) return;
    setLoading(true);
    try {
      await restoreOperationalTeam(accessToken, teamId);
      const result = await listOperationalTeams(accessToken, { status: "removed" });
      setTeams(result.data);
      setError("");
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="team-workspace team-workspace--removed">
      <section className="team-page-heading team-page-heading--compact team-page-heading--removed"><div className="team-page-heading__content"><span>{t("simple.removedEyebrow")}</span><h1>{t("simple.removedTitle")}</h1><p>{t("simple.removedHelp")}</p></div><button type="button" className="team-secondary-button" onClick={() => navigate("/team-management")}>{t("simple.back")}</button></section>
      {error ? <div className="team-inline-message team-inline-message--error" role="alert">{error}</div> : null}
      {loading ? <section className="team-empty-state"><p>{t("simple.loading")}</p></section> : teams.length === 0 ? <section className="team-empty-state team-empty-state--removed"><div className="team-empty-state__icon" aria-hidden="true">TM</div><h2>{t("simple.noRemoved")}</h2><p>{t("simple.noRemovedHelp")}</p></section> : <section className="team-removed-list">{teams.map((team) => <article key={team.id} className="team-removed-card"><div className="team-removed-card__identity"><span className="team-summary-card__mark" aria-hidden="true">{team.name.slice(0, 2).toUpperCase()}</span><div><span>{team.orgUnit.name}</span><h2>{team.name}</h2><small>{team.office.name}</small></div></div><button type="button" onClick={() => void restore(team.id)}>{t("simple.restore")}</button></article>)}</section>}
    </main>
  );
}
