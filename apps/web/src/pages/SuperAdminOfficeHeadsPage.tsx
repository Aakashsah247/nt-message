import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";

import { ProtectedAvatar } from "../components/ProtectedAvatar";
import { useAuth } from "../context/AuthContext";
import { transferOfficeHead } from "../services/directory.service";
import {
  assignOfficeHead,
  createOfficeHeadAccount,
  endOrganizationLeadership,
  getOrganizationLeadership,
  getOrganizationOffices,
  getOrganizationPeople,
  getOrganizationTree,
  replaceOfficeHead,
} from "../services/organization-v3.service";
import type {
  OrganizationLeadershipRecord,
  OrganizationOfficeSummary,
  OrganizationPersonSummary,
  OrganizationUnitNode,
} from "../types/organization-v3";

interface OfficeHeadAccountForm {
  empId: string;
  empName: string;
  phoneNumber: string;
  officialEmail: string;
  designation: string;
}

type HeadAction = "ASSIGN" | "CREATE" | "REPLACE" | "TRANSFER" | "END" | null;
type ReplacementMode = "EXISTING" | "NEW";
type TransferMode = "EMPLOYEE" | "OFFICE_HEAD";

const emptyAccountForm: OfficeHeadAccountForm = {
  empId: "",
  empName: "",
  phoneNumber: "",
  officialEmail: "",
  designation: "",
};

const FORMAL_TYPES = new Set(["DIVISION", "DEPARTMENT", "SECTION", "UNIT"]);

function flattenTree(
  nodes: OrganizationUnitNode[],
  prefix: string[] = [],
): Array<{ node: OrganizationUnitNode; path: string }> {
  return nodes.flatMap((node) => {
    const next = [...prefix, node.name];
    return [
      { node, path: next.join(" → ") },
      ...flattenTree(node.children, next),
    ];
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

export function SuperAdminOfficeHeadsPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOfficeId = searchParams.get("officeId") ?? "";
  const [offices, setOffices] = useState<OrganizationOfficeSummary[]>([]);
  const [officeId, setOfficeId] = useState("");
  const [leaders, setLeaders] = useState<OrganizationLeadershipRecord[]>([]);
  const [people, setPeople] = useState<OrganizationPersonSummary[]>([]);
  const [action, setAction] = useState<HeadAction>(null);
  const [replacementMode, setReplacementMode] = useState<ReplacementMode>("EXISTING");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [form, setForm] = useState<OfficeHeadAccountForm>(emptyAccountForm);
  const [reason, setReason] = useState("");
  const [targetOfficeId, setTargetOfficeId] = useState("");
  const [targetOrgUnitId, setTargetOrgUnitId] = useState("");
  const [targetTree, setTargetTree] = useState<OrganizationUnitNode[]>([]);
  const [targetTreeOfficeId, setTargetTreeOfficeId] = useState("");
  const [transferMode, setTransferMode] = useState<TransferMode>("EMPLOYEE");
  const [replacementEmployeeId, setReplacementEmployeeId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoadingOffices, setIsLoadingOffices] = useState(Boolean(accessToken));
  const [loadedLeadershipOfficeId, setLoadedLeadershipOfficeId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    void getOrganizationOffices(accessToken)
      .then((response) => {
        if (cancelled) return;
        setOffices(response.data);
        setLoadError("");
        setOfficeId((current) => {
          if (current && response.data.some((office) => office.id === current)) {
            return current;
          }
          if (
            requestedOfficeId &&
            response.data.some((office) => office.id === requestedOfficeId)
          ) {
            return requestedOfficeId;
          }
          return response.data[0]?.id ?? "";
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(errorMessage(error, "Unable to load offices."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOffices(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, requestedOfficeId]);

  async function refreshOfficeContext(selectedOfficeId = officeId) {
    if (!accessToken || !selectedOfficeId) return;

    const [leadership, officePeople] = await Promise.all([
      getOrganizationLeadership(accessToken, selectedOfficeId),
      getOrganizationPeople(accessToken, selectedOfficeId),
    ]);
    setLeaders(leadership.data);
    setPeople(officePeople.data);
    setLoadedLeadershipOfficeId(selectedOfficeId);
  }

  useEffect(() => {
    if (!accessToken || !officeId) return;

    let cancelled = false;

    void Promise.all([
      getOrganizationLeadership(accessToken, officeId),
      getOrganizationPeople(accessToken, officeId),
    ])
      .then(([leadership, officePeople]) => {
        if (cancelled) return;
        setLeaders(leadership.data);
        setPeople(officePeople.data);
        setLoadedLeadershipOfficeId(officeId);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLeaders([]);
          setPeople([]);
          setLoadedLeadershipOfficeId(officeId);
          setLoadError(
            errorMessage(error, "Unable to load Office Head information."),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, officeId]);

  useEffect(() => {
    if (!accessToken || !targetOfficeId || transferMode !== "EMPLOYEE") return;

    let cancelled = false;
    void getOrganizationTree(accessToken, targetOfficeId)
      .then((response) => {
        if (!cancelled) {
          setTargetTree(response.tree);
          setTargetTreeOfficeId(targetOfficeId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTargetTree([]);
          setTargetTreeOfficeId(targetOfficeId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, targetOfficeId, transferMode]);

  const selectedOffice = useMemo(
    () => offices.find((office) => office.id === officeId) ?? null,
    [officeId, offices],
  );

  const visibleLeaders = useMemo(
    () => (loadedLeadershipOfficeId === officeId ? leaders : []),
    [leaders, loadedLeadershipOfficeId, officeId],
  );
  const visiblePeople = useMemo(
    () => (loadedLeadershipOfficeId === officeId ? people : []),
    [loadedLeadershipOfficeId, officeId, people],
  );
  const isLoadingLeadership = Boolean(
    accessToken && officeId && loadedLeadershipOfficeId !== officeId,
  );

  const currentOfficeHead = useMemo(() => {
    return (
      visibleLeaders.find(
        (leader) =>
          leader.leadershipType === "OFFICE_HEAD" &&
          !leader.isActing &&
          leader.effectiveUntil === null,
      ) ?? null
    );
  }, [visibleLeaders]);

  const previousOfficeHeads = useMemo(() => {
    return visibleLeaders.filter(
      (leader) =>
        leader.leadershipType === "OFFICE_HEAD" &&
        !leader.isActing &&
        leader.effectiveUntil !== null,
    );
  }, [visibleLeaders]);

  const eligiblePeople = useMemo(
    () =>
      visiblePeople.filter(
        (person) => person.employee.id !== currentOfficeHead?.employee.id,
      ),
    [currentOfficeHead?.employee.id, visiblePeople],
  );

  const selectedPerson = useMemo(
    () =>
      eligiblePeople.find((person) => person.employee.id === selectedEmployeeId) ??
      null,
    [eligiblePeople, selectedEmployeeId],
  );

  const replacementPerson = useMemo(
    () =>
      eligiblePeople.find(
        (person) => person.employee.id === replacementEmployeeId,
      ) ?? null,
    [eligiblePeople, replacementEmployeeId],
  );

  const transferUnits = useMemo(
    () =>
      flattenTree(
        targetTreeOfficeId === targetOfficeId && transferMode === "EMPLOYEE"
          ? targetTree
          : [],
      ).filter(
        ({ node }) => node.isActive && FORMAL_TYPES.has(node.orgUnitType.code),
      ),
    [targetOfficeId, targetTree, targetTreeOfficeId, transferMode],
  );

  function openAction(nextAction: Exclude<HeadAction, null>) {
    setAction(nextAction);
    setReplacementMode("EXISTING");
    setSelectedEmployeeId("");
    setReplacementEmployeeId("");
    setTargetOfficeId("");
    setTargetOrgUnitId("");
    setTransferMode("EMPLOYEE");
    setForm(emptyAccountForm);
    setActionError("");
    setMessage("");
    setReason(
      nextAction === "ASSIGN"
        ? "Office Head assignment"
        : nextAction === "CREATE"
          ? "Initial Office Head provisioning"
          : nextAction === "REPLACE"
            ? "Office Head replacement"
            : nextAction === "TRANSFER"
              ? "Office Head transfer"
              : "Office Head assignment ended",
    );
  }

  async function completeAction(task: () => Promise<{ message: string }>) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setActionError("");
    setMessage("");
    try {
      const response = await task();
      setMessage(response.message);
      setAction(null);
      setForm(emptyAccountForm);
      await refreshOfficeContext();
    } catch (error: unknown) {
      setActionError(errorMessage(error, "The Office Head action could not be completed."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function submitExisting(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !officeId || !selectedEmployeeId || reason.trim().length < 3) return;

    if (action === "ASSIGN") {
      void completeAction(() =>
        assignOfficeHead(accessToken, officeId, {
          employeeId: selectedEmployeeId,
          reason: reason.trim(),
        }) as Promise<{ message: string }>,
      );
    } else if (action === "REPLACE") {
      void completeAction(() =>
        replaceOfficeHead(accessToken, officeId, {
          employeeId: selectedEmployeeId,
          reason: reason.trim(),
        }),
      );
    }
  }

  function submitNewAccount(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !officeId || reason.trim().length < 3) return;

    void completeAction(() =>
      createOfficeHeadAccount(accessToken, officeId, {
        empId: form.empId.trim(),
        empName: form.empName.trim(),
        phoneNumber: form.phoneNumber.trim(),
        officialEmail: form.officialEmail.trim(),
        designation: form.designation.trim(),
        reason: reason.trim(),
        replaceCurrent: action === "REPLACE",
      }),
    );
  }

  function submitTransfer(event: FormEvent) {
    event.preventDefault();
    if (
      !accessToken ||
      !currentOfficeHead ||
      !targetOfficeId ||
      !replacementEmployeeId ||
      reason.trim().length < 3 ||
      (transferMode === "EMPLOYEE" && !targetOrgUnitId)
    ) {
      return;
    }

    void completeAction(() =>
      transferOfficeHead(accessToken, currentOfficeHead.employee.id, {
        targetOfficeId,
        targetOrgUnitId:
          transferMode === "EMPLOYEE" ? targetOrgUnitId : undefined,
        replacementEmployeeId,
        transferAs: transferMode,
        reason: reason.trim(),
      }),
    );
  }

  function submitEnd(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !currentOfficeHead || reason.trim().length < 3) return;

    void completeAction(() =>
      endOrganizationLeadership(
        accessToken,
        officeId,
        currentOfficeHead.id,
        { reason: reason.trim() },
      ),
    );
  }

  return (
    <section className="organization-workspace organization-admin-page organization-admin-page--heads">
      <div className="organization-admin-scope-bar organization-admin-scope-bar--compact">
        <label>
          <span>Office</span>
          <select
            value={officeId}
            disabled={isLoadingOffices || offices.length === 0}
            onChange={(event) => {
              const nextOfficeId = event.target.value;
              setOfficeId(nextOfficeId);
              setAction(null);
              setMessage("");
              setActionError("");
              if (nextOfficeId) {
                setSearchParams({ officeId: nextOfficeId }, { replace: true });
              }
            }}
          >
            {offices.length === 0 ? <option value="">No offices available</option> : null}
            {offices.map((office) => (
              <option value={office.id} key={office.id}>
                {office.name} ({office.code})
              </option>
            ))}
          </select>
        </label>
        {selectedOffice ? (
          <div className="organization-admin-scope-summary">
            <strong>{selectedOffice.code}</strong>
            <span className={`organization-status${selectedOffice.isActive ? " is-active" : ""}`}>
              {selectedOffice.isActive ? "Active" : "Inactive"}
            </span>
          </div>
        ) : null}
      </div>

      {loadError ? (
        <div className="organization-feedback organization-feedback--error" role="alert">
          <span>{loadError}</span>
        </div>
      ) : null}
      {message ? (
        <div className="organization-feedback organization-feedback--success" role="status" aria-live="polite">
          <span>{message}</span>
        </div>
      ) : null}
      {actionError ? (
        <div className="organization-feedback organization-feedback--error" role="alert">
          <span>{actionError}</span>
        </div>
      ) : null}

      <section className="organization-tree-panel organization-admin-panel organization-admin-head-overview">
        <header className="organization-panel-heading organization-admin-panel-heading--actions">
          <div>
            <span>Permanent leadership</span>
            <h3>Office Head</h3>
            <p>{selectedOffice?.name ?? "Select an office"}</p>
          </div>
          {currentOfficeHead ? (
            <div className="organization-admin-head-actions">
              <button type="button" className="organization-button organization-button--secondary" onClick={() => openAction("REPLACE")}>Replace</button>
              <button type="button" className="organization-button organization-button--secondary" onClick={() => openAction("TRANSFER")}>Transfer</button>
              <button type="button" className="organization-button organization-button--danger-soft" onClick={() => openAction("END")}>End assignment</button>
            </div>
          ) : null}
        </header>

        {isLoadingLeadership ? (
          <div className="organization-empty-state organization-admin-loading" role="status">
            <strong>Loading Office Head</strong>
            <span>Retrieving the current permanent assignment.</span>
          </div>
        ) : currentOfficeHead ? (
          <div className="organization-admin-head-card organization-admin-head-card--compact">
            <div className="organization-admin-head-identity">
              <ProtectedAvatar
                employeeId={currentOfficeHead.employee.id}
                photoKey={currentOfficeHead.employee.profilePhotoKey}
                displayName={currentOfficeHead.employee.empName}
                className="organization-person-avatar"
                ariaLabel={`${currentOfficeHead.employee.empName} profile`}
              />
              <div>
                <strong>{currentOfficeHead.employee.empName}</strong>
                <small>
                  {currentOfficeHead.employee.empId}
                  {currentOfficeHead.employee.designation
                    ? ` · ${currentOfficeHead.employee.designation}`
                    : ""}
                </small>
              </div>
              <span className="organization-status is-active">Assigned</span>
            </div>
            <dl className="organization-detail-facts organization-admin-head-facts organization-admin-head-facts--compact">
              <div><dt>Effective from</dt><dd>{formatDate(currentOfficeHead.effectiveFrom)}</dd></div>
              <div><dt>Assigned by</dt><dd>{currentOfficeHead.assignedBy?.username ?? "System administration"}</dd></div>
            </dl>
          </div>
        ) : selectedOffice ? (
          <div className="organization-admin-vacancy">
            <div>
              <strong>No Office Head assigned</strong>
              <span>Assign an existing office member or create the first Office Head account.</span>
            </div>
            <div className="organization-admin-head-actions">
              <button type="button" className="organization-button organization-button--primary" onClick={() => openAction("ASSIGN")}>Assign existing member</button>
              <button type="button" className="organization-button organization-button--secondary" onClick={() => openAction("CREATE")}>Create new account</button>
            </div>
          </div>
        ) : (
          <div className="organization-empty-state organization-admin-loading">
            <strong>No office selected</strong>
            <span>Create an office before assigning its Office Head.</span>
          </div>
        )}

        {previousOfficeHeads.length ? (
          <details className="organization-admin-history">
            <summary>Previous Office Heads ({previousOfficeHeads.length})</summary>
            <div>
              {previousOfficeHeads.map((head) => (
                <article key={head.id}>
                  <strong>{head.employee.empName}</strong>
                  <span>{formatDate(head.effectiveFrom)} – {head.effectiveUntil ? formatDate(head.effectiveUntil) : "Current"}</span>
                  {head.endReason ? <small>{head.endReason}</small> : null}
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {action === "ASSIGN" || (action === "REPLACE" && replacementMode === "EXISTING") ? (
        <form className="organization-detail-panel organization-admin-action-panel" onSubmit={submitExisting}>
          <header className="organization-panel-heading organization-admin-panel-heading--actions">
            <div>
              <span>{action === "REPLACE" ? "Replacement" : "Assignment"}</span>
              <h3>{action === "REPLACE" ? "Replace with an existing member" : "Assign an existing office member"}</h3>
            </div>
            {action === "REPLACE" ? (
              <button type="button" className="organization-button organization-button--secondary" onClick={() => setReplacementMode("NEW")}>Use new account instead</button>
            ) : null}
          </header>

          <div className="organization-form organization-admin-action-form">
            <label className="organization-admin-form-span">
              <span>Office member</span>
              <select value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} required>
                <option value="">Select member</option>
                {eligiblePeople.map((person) => (
                  <option key={person.employee.id} value={person.employee.id}>
                    {person.employee.empName} ({person.employee.empId})
                  </option>
                ))}
              </select>
            </label>

            {selectedPerson ? (
              <div className="organization-admin-candidate organization-admin-form-span">
                <ProtectedAvatar
                  employeeId={selectedPerson.employee.id}
                  photoKey={selectedPerson.employee.profilePhotoKey}
                  displayName={selectedPerson.employee.empName}
                  className="organization-person-avatar"
                  ariaLabel={`${selectedPerson.employee.empName} profile`}
                />
                <div>
                  <strong>{selectedPerson.employee.empName}</strong>
                  <span>{selectedPerson.employee.empId}{selectedPerson.employee.designation ? ` · ${selectedPerson.employee.designation}` : ""}</span>
                </div>
              </div>
            ) : null}

            <label className="organization-admin-form-span">
              <span>Reason</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} required />
            </label>
            <footer className="organization-admin-form-span">
              <button type="button" className="organization-button organization-button--secondary" onClick={() => setAction(null)} disabled={isSubmitting}>Cancel</button>
              <button className="organization-button organization-button--primary" type="submit" disabled={isSubmitting || !selectedEmployeeId}>
                {isSubmitting ? "Saving…" : action === "REPLACE" ? "Replace Office Head" : "Assign Office Head"}
              </button>
            </footer>
          </div>
        </form>
      ) : null}

      {action === "CREATE" || (action === "REPLACE" && replacementMode === "NEW") ? (
        <form className="organization-detail-panel organization-admin-action-panel" onSubmit={submitNewAccount}>
          <header className="organization-panel-heading organization-admin-panel-heading--actions">
            <div>
              <span>{action === "REPLACE" ? "Replacement" : "New Office Head"}</span>
              <h3>{action === "REPLACE" ? "Create replacement account" : "Create Office Head account"}</h3>
              <p>New accounts must complete the normal activation, OTP and password setup.</p>
            </div>
            {action === "REPLACE" ? (
              <button type="button" className="organization-button organization-button--secondary" onClick={() => setReplacementMode("EXISTING")}>Use existing member instead</button>
            ) : null}
          </header>

          <div className="organization-form organization-admin-head-form">
            <label><span>Employee ID</span><input value={form.empId} onChange={(event) => setForm((current) => ({ ...current, empId: event.target.value }))} required /></label>
            <label><span>Full name</span><input value={form.empName} onChange={(event) => setForm((current) => ({ ...current, empName: event.target.value }))} required /></label>
            <label><span>Phone number</span><input value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} inputMode="tel" required /></label>
            <label><span>Official email</span><input type="email" value={form.officialEmail} onChange={(event) => setForm((current) => ({ ...current, officialEmail: event.target.value }))} required /></label>
            <label><span>Official designation</span><input value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} placeholder="e.g. Senior Engineer" required /></label>
            <label><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} required /></label>
            <footer className="organization-admin-form-span">
              <button type="button" className="organization-button organization-button--secondary" onClick={() => setAction(null)} disabled={isSubmitting}>Cancel</button>
              <button className="organization-button organization-button--primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : action === "REPLACE" ? "Create & replace Office Head" : "Create & assign Office Head"}
              </button>
            </footer>
          </div>
        </form>
      ) : null}

      {action === "TRANSFER" && currentOfficeHead ? (
        <form className="organization-detail-panel organization-admin-action-panel" onSubmit={submitTransfer}>
          <header className="organization-panel-heading">
            <div>
              <span>Office Head transfer</span>
              <h3>Transfer {currentOfficeHead.employee.empName}</h3>
              <p>The source Office must receive a replacement before the transfer completes.</p>
            </div>
          </header>
          <div className="organization-form organization-admin-head-form">
            <label>
              <span>Replacement for {selectedOffice?.code ?? "current office"}</span>
              <select value={replacementEmployeeId} onChange={(event) => setReplacementEmployeeId(event.target.value)} required>
                <option value="">Select replacement</option>
                {eligiblePeople.map((person) => <option key={person.employee.id} value={person.employee.id}>{person.employee.empName} ({person.employee.empId})</option>)}
              </select>
            </label>
            <label>
              <span>Target Office</span>
              <select
                value={targetOfficeId}
                onChange={(event) => {
                  setTargetOfficeId(event.target.value);
                  setTargetOrgUnitId("");
                }}
                required
              >
                <option value="">Select Office</option>
                {offices.filter((office) => office.id !== officeId && office.isActive).map((office) => <option key={office.id} value={office.id}>{office.name} ({office.code})</option>)}
              </select>
            </label>
            <label>
              <span>Transfer as</span>
              <select
                value={transferMode}
                onChange={(event) => {
                  setTransferMode(event.target.value as TransferMode);
                  setTargetOrgUnitId("");
                }}
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="OFFICE_HEAD">Office Head</option>
              </select>
            </label>
            {transferMode === "EMPLOYEE" ? (
              <label>
                <span>Target organization unit</span>
                <select value={targetOrgUnitId} onChange={(event) => setTargetOrgUnitId(event.target.value)} required>
                  <option value="">Select organization unit</option>
                  {transferUnits.map(({ node, path }) => <option key={node.id} value={node.id}>{path}</option>)}
                </select>
              </label>
            ) : (
              <div className="organization-admin-transfer-note">
                <strong>Transfer as Office Head</strong>
                <span>The target Office must not already have a permanent Office Head.</span>
              </div>
            )}
            {replacementPerson ? (
              <div className="organization-admin-candidate organization-admin-form-span">
                <ProtectedAvatar employeeId={replacementPerson.employee.id} photoKey={replacementPerson.employee.profilePhotoKey} displayName={replacementPerson.employee.empName} className="organization-person-avatar" ariaLabel={`${replacementPerson.employee.empName} profile`} />
                <div><strong>Replacement: {replacementPerson.employee.empName}</strong><span>{replacementPerson.employee.empId}{replacementPerson.employee.designation ? ` · ${replacementPerson.employee.designation}` : ""}</span></div>
              </div>
            ) : null}
            <label className="organization-admin-form-span"><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} required /></label>
            <footer className="organization-admin-form-span">
              <button type="button" className="organization-button organization-button--secondary" onClick={() => setAction(null)} disabled={isSubmitting}>Cancel</button>
              <button className="organization-button organization-button--primary" type="submit" disabled={isSubmitting || !replacementEmployeeId || !targetOfficeId || (transferMode === "EMPLOYEE" && !targetOrgUnitId)}>{isSubmitting ? "Transferring…" : "Transfer Office Head"}</button>
            </footer>
          </div>
        </form>
      ) : null}

      {action === "END" && currentOfficeHead ? (
        <form className="organization-detail-panel organization-admin-action-panel organization-admin-action-panel--danger" onSubmit={submitEnd}>
          <header className="organization-panel-heading">
            <div>
              <span>End leadership</span>
              <h3>End Office Head assignment</h3>
              <p>Use this before retirement, resignation or another leadership end. The Office stays vacant until a new Head is assigned.</p>
            </div>
          </header>
          <div className="organization-form organization-admin-action-form">
            <label className="organization-admin-form-span"><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} required /></label>
            <footer className="organization-admin-form-span">
              <button type="button" className="organization-button organization-button--secondary" onClick={() => setAction(null)} disabled={isSubmitting}>Cancel</button>
              <button className="organization-button organization-button--danger" type="submit" disabled={isSubmitting}>{isSubmitting ? "Ending…" : "End assignment"}</button>
            </footer>
          </div>
        </form>
      ) : null}
    </section>
  );
}
