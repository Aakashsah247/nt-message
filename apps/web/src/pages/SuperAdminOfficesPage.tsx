import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "../context/AuthContext";
import {
  createOrganizationOffice,
  getOrganizationOffices,
} from "../services/organization-v3.service";
import type { OrganizationOfficeSummary } from "../types/organization-v3";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function SuperAdminOfficesPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<OrganizationOfficeSummary[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(accessToken));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function refreshOffices() {
    if (!accessToken) return;
    const response = await getOrganizationOffices(accessToken);
    setItems(response.data);
  }

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    void getOrganizationOffices(accessToken)
      .then((response) => {
        if (cancelled) return;
        setItems(response.data);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(errorMessage(requestError, "Unable to load offices."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const activeOfficeCount = useMemo(
    () => items.filter((office) => office.isActive).length,
    [items],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || isSubmitting) return;

    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await createOrganizationOffice(accessToken, {
        code: code.trim(),
        name: name.trim(),
      });
      setMessage(response.message);
      setCode("");
      setName("");
      setShowCreate(false);
      await refreshOffices();
    } catch (requestError: unknown) {
      setError(
        errorMessage(
          requestError,
          "Unable to create the office. Check the office code and try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="organization-workspace organization-admin-page organization-admin-page--offices">
      <div className="organization-admin-toolbar">
        <div>
          <span className="organization-eyebrow">Office registry</span>
          <strong>
            {items.length} {items.length === 1 ? "office" : "offices"} · {activeOfficeCount} active
          </strong>
        </div>
        <button
          type="button"
          className="organization-button organization-button--primary"
          onClick={() => {
            setShowCreate((current) => !current);
            setMessage("");
            setError("");
          }}
        >
          {showCreate ? "Close" : "Create office"}
        </button>
      </div>

      {message ? (
        <div className="organization-feedback organization-feedback--success" role="status" aria-live="polite">
          <span>{message}</span>
        </div>
      ) : null}
      {error ? (
        <div className="organization-feedback organization-feedback--error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {showCreate ? (
        <form className="organization-detail-panel organization-admin-inline-create" onSubmit={submit}>
          <header className="organization-panel-heading">
            <div>
              <span>New office</span>
              <h3>Create office</h3>
              <p>Add the official Nepal Telecom office code and full office name.</p>
            </div>
          </header>
          <div className="organization-form organization-admin-inline-create__form">
            <label>
              <span>Office code</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. PATAN" autoComplete="off" required />
            </label>
            <label>
              <span>Office name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Patan Telecom Office" autoComplete="organization" required />
            </label>
            <footer>
              <button type="button" className="organization-button organization-button--secondary" onClick={() => setShowCreate(false)} disabled={isSubmitting}>Cancel</button>
              <button className="organization-button organization-button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create office"}</button>
            </footer>
          </div>
        </form>
      ) : null}

      <section className="organization-tree-panel organization-admin-panel organization-admin-registry-panel">
        <header className="organization-panel-heading">
          <div>
            <span>Registered offices</span>
            <h3>Office directory</h3>
          </div>
        </header>

        {isLoading ? (
          <div className="organization-empty-state organization-admin-loading" role="status">
            <strong>Loading offices</strong>
            <span>Retrieving the latest office registry.</span>
          </div>
        ) : items.length ? (
          <div className="organization-admin-registry organization-admin-registry--simple">
            {items.map((office) => (
              <article key={office.id} className="organization-admin-registry-row organization-admin-registry-row--simple">
                <div className="organization-admin-registry-identity">
                  <span className="organization-person-avatar" aria-hidden="true">{office.code.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{office.name}</strong>
                    <small>{office.code}</small>
                  </div>
                </div>
                <div className="organization-admin-registry-inline-meta">
                  <span>{office.currentPeopleCount ?? office._count.memberships} people</span>
                  <span>{office._count.orgUnits} org units</span>
                </div>
                <span className={`organization-status${office.isActive ? " is-active" : ""}`}>{office.isActive ? "Active" : "Inactive"}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="organization-empty-state organization-admin-loading">
            <strong>No offices registered</strong>
            <span>Create the first office to begin organization setup.</span>
          </div>
        )}
      </section>
    </section>
  );
}
