import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { EmergencyAlertButton } from "../components/EmergencyAlertButton";

import {
  ManagementIcon,
  type ManagementIconName,
} from "../components/layout/ManagementIcon";
import { useAuth } from "../context/AuthContext";
import { useOrganizationWorkspace } from "../context/organization-workspace-context";
import { listMyAccountRequests } from "../services/account-request.service";
import { listDirectoryEmployees } from "../services/directory.service";
import { getPersonalDashboardSummary } from "../services/messaging.service";
import { getOrganizationTree } from "../services/organization-v3.service";
import { listOperationalTeams } from "../services/team-management.service";
import {
  getDutyManagementSummary,
  getMyDutySummary,
  listWorkItems,
} from "../services/work-management.service";
import type {
  OrganizationUnitNode,
  OrganizationWorkspaceContext,
} from "../types/organization-v3";
import type {
  DutyManagementSummary,
  MyDutySummary,
  WorkItemSummary,
} from "../types/work-management";

interface DashboardSnapshot {
  context: OrganizationWorkspaceContext;
  activeWork: number;
  incomingWork: number;
  pendingApproval: number;
  newWork: number;
  dueToday: number;
  completedToday: number;
  needAttention: number;
  myWork: WorkItemSummary[];
  teamWork: WorkItemSummary[];
  dutyManagement: DutyManagementSummary | null;
  myDuty: MyDutySummary | null;
  operationalTeams: number | null;
  operationalTeamsWithoutLead: number | null;
  pendingAccountRequests: number | null;
  activeEmployees: number | null;
  activeOrgUnits: number | null;
  unreadNotifications: number;
  activeConversations: number;
  messagesToday: number;
  managerNeedAttention: number;
  generatedAt: string;
}

interface MetricCard {
  label: string;
  value: number | string;
  detail: string;
  icon: ManagementIconName;
  path?: string;
  tone?: "default" | "warning" | "danger" | "success";
}

function formatTime(value: string | null | undefined, locale: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ne" ? "ne-NP" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ne" ? "ne-NP" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isSameLocalDay(value: string | null | undefined, reference: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function needsEmployeeAttention(work: WorkItemSummary, now: Date): boolean {
  if (["BLOCKED", "HELP_REQUESTED", "REOPENED"].includes(work.status)) {
    return true;
  }

  if (work.status === "COMPLETED_PENDING_REVIEW") {
    return false;
  }

  const dueAt = new Date(work.dueAt);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < now.getTime();
}

function personalWorkPriority(work: WorkItemSummary, now: Date): number {
  if (needsEmployeeAttention(work, now)) return 0;
  if (work.status === "ASSIGNED") return 1;
  if (isSameLocalDay(work.dueAt, now)) return 2;
  if (work.status === "IN_PROGRESS") return 3;
  if (work.status === "ACKNOWLEDGED") return 4;
  return 5;
}

function countActiveOrgUnits(nodes: OrganizationUnitNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total +
      (node.isActive ? 1 : 0) +
      countActiveOrgUnits(node.children),
    0,
  );
}

function findOrgUnitNode(
  nodes: OrganizationUnitNode[],
  orgUnitId: string,
): OrganizationUnitNode | null {
  for (const node of nodes) {
    if (node.id === orgUnitId) return node;
    const child = findOrgUnitNode(node.children, orgUnitId);
    if (child) return child;
  }
  return null;
}

function countScopedActiveOrgUnits(
  nodes: OrganizationUnitNode[],
  orgUnitId: string | null | undefined,
): number {
  if (!orgUnitId) return countActiveOrgUnits(nodes);
  const root = findOrgUnitNode(nodes, orgUnitId);
  return root ? (root.isActive ? 1 : 0) + countActiveOrgUnits(root.children) : 0;
}

async function loadDashboard(
  accessToken: string,
  context: OrganizationWorkspaceContext,
  accountId: string,
): Promise<DashboardSnapshot> {
  const officeIds = context.scope.officeIds;
  const [workResponse, historyWorkResponse] = await Promise.all([
    context.features.workManagement || context.features.myWork
      ? listWorkItems(accessToken, { view: "ACTIVE", page: 1, limit: 100 })
      : Promise.resolve(null),
    context.features.myWork
      ? listWorkItems(accessToken, { view: "HISTORY", page: 1, limit: 100 })
      : Promise.resolve(null),
  ]);

  const visibleWork = (workResponse?.data ?? []).filter((work) =>
    officeIds.includes(work.officeId),
  );
  const visibleHistory = (historyWorkResponse?.data ?? []).filter((work) =>
    officeIds.includes(work.officeId),
  );
  const isAssignedToCurrentUser = (work: WorkItemSummary) =>
    work.assignments.some((assignment) => assignment.assignee.id === accountId);
  const now = new Date();
  const myWork = visibleWork
    .filter(isAssignedToCurrentUser)
    .sort((left, right) => {
      const priorityDifference =
        personalWorkPriority(left, now) - personalWorkPriority(right, now);
      if (priorityDifference !== 0) return priorityDifference;
      return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    });
  const myHistory = visibleHistory.filter(isAssignedToCurrentUser);
  const teamWork = visibleWork.filter((work) => Boolean(work.assignedOperationalTeamId));

  const isOfficeHead = context.authority.isOfficeHead;
  const isScopedHead = context.authority.isOrgUnitHead;
  const isHierarchyHead = isOfficeHead || isScopedHead;
  const officeId = context.primaryPlacement?.office.id ?? officeIds[0] ?? null;
  const optionalRequests = await Promise.allSettled([
    context.features.dutyRoster
      ? getDutyManagementSummary(accessToken)
      : Promise.resolve(null),
    context.features.myDuty ? getMyDutySummary(accessToken) : Promise.resolve(null),
    context.features.teamManagement
      ? listOperationalTeams(accessToken)
      : Promise.resolve(null),
    context.features.accountRequests
      ? listMyAccountRequests(accessToken, "PENDING_APPROVAL", 1, 1)
      : Promise.resolve(null),
    getPersonalDashboardSummary(accessToken),
    isHierarchyHead && context.features.directory
      ? listDirectoryEmployees(accessToken, { status: "ACTIVE", page: 1, limit: 1 })
      : Promise.resolve(null),
    isHierarchyHead && context.features.organizationView && officeId
      ? getOrganizationTree(accessToken, officeId)
      : Promise.resolve(null),
  ]);

  const pendingApproval = visibleWork.filter(
    (work) => work.status === "COMPLETED_PENDING_REVIEW",
  ).length;
  const newWork = myWork.filter((work) => work.status === "ASSIGNED").length;
  const dueToday = myWork.filter(
    (work) =>
      work.status !== "COMPLETED_PENDING_REVIEW" &&
      isSameLocalDay(work.dueAt, now),
  ).length;
  const completedToday =
    myWork.filter(
      (work) =>
        work.status === "COMPLETED_PENDING_REVIEW" &&
        isSameLocalDay(work.completedAt, now),
    ).length +
    myHistory.filter(
      (work) => work.status === "CLOSED" && isSameLocalDay(work.closedAt, now),
    ).length;
  const needAttention = myWork.filter((work) => needsEmployeeAttention(work, now)).length;

  const dutyManagement =
    optionalRequests[0].status === "fulfilled" ? optionalRequests[0].value : null;
  const myDuty =
    optionalRequests[1].status === "fulfilled" ? optionalRequests[1].value : null;
  const teams = optionalRequests[2].status === "fulfilled" ? optionalRequests[2].value : null;
  const accountRequests =
    optionalRequests[3].status === "fulfilled" ? optionalRequests[3].value : null;
  const messaging =
    optionalRequests[4].status === "fulfilled" ? optionalRequests[4].value : null;
  const directory =
    optionalRequests[5].status === "fulfilled" ? optionalRequests[5].value : null;
  const organizationTree =
    optionalRequests[6].status === "fulfilled" ? optionalRequests[6].value : null;
  const managerNeedAttention = visibleWork.filter((work) =>
    needsEmployeeAttention(work, now),
  ).length;

  return {
    context,
    activeWork: visibleWork.length,
    incomingWork: visibleWork.filter((work) => work.status === "ASSIGNED").length,
    pendingApproval,
    newWork,
    dueToday,
    completedToday,
    needAttention,
    myWork,
    teamWork,
    dutyManagement,
    myDuty,
    operationalTeams: teams?.total ?? null,
    operationalTeamsWithoutLead:
      teams?.data.filter((team) => team.isActive && !team.lead).length ?? null,
    pendingAccountRequests: accountRequests?.pagination.total ?? null,
    activeEmployees: directory?.pagination.total ?? null,
    activeOrgUnits: organizationTree
      ? countScopedActiveOrgUnits(
          organizationTree.tree,
          isScopedHead ? context.primaryPlacement?.orgUnit?.id : null,
        )
      : null,
    unreadNotifications: messaging?.totals.unreadNotifications ?? 0,
    activeConversations: messaging?.totals.activeConversations ?? 0,
    messagesToday: messaging?.totals.messagesToday ?? 0,
    managerNeedAttention,
    generatedAt: new Date().toISOString(),
  };
}

export function OfficeDashboardPage() {
  const { account, accessToken } = useAuth();
  const { context: workspaceContext } = useOrganizationWorkspace();
  const { t, i18n } = useTranslation("workspace");
  const [refreshKey, setRefreshKey] = useState(0);
  const accountId = account?.id ?? null;
  const requestKey = accountId ? `${accountId}:${refreshKey}` : null;
  const [result, setResult] = useState<{
    requestKey: string;
    snapshot: DashboardSnapshot | null;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (!accessToken || !accountId || !requestKey || !workspaceContext) return;
    let active = true;

    void loadDashboard(accessToken, workspaceContext, accountId)
      .then((snapshot) => {
        if (active) setResult({ requestKey, snapshot, error: "" });
      })
      .catch((requestError: unknown) => {
        if (active) {
          setResult((current) => ({
            requestKey,
            snapshot:
              current?.requestKey === requestKey ? current.snapshot : null,
            error:
              requestError instanceof Error
                ? requestError.message
                : t("dashboardV3.loadError"),
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, accountId, requestKey, t, workspaceContext]);

  const currentResult = result?.requestKey === requestKey ? result : null;
  const snapshot = currentResult?.snapshot ?? null;
  const loading = Boolean(requestKey) && currentResult === null;
  const error = requestKey ? currentResult?.error ?? "" : t("dashboardV3.sessionError");
  const placement = snapshot?.context.primaryPlacement ?? workspaceContext?.primaryPlacement ?? null;
  const placementLabel = placement?.orgUnit?.name ?? placement?.office.name ?? null;

  const metrics = useMemo<MetricCard[]>(() => {
    if (!snapshot) return [];
    const { context } = snapshot;

    if (context.authority.isOfficeHead || context.authority.isOrgUnitHead) {
      const isScopedHead = context.authority.isOrgUnitHead;
      const pendingActions =
        snapshot.pendingApproval +
        snapshot.managerNeedAttention +
        (snapshot.pendingAccountRequests ?? 0) +
        (snapshot.operationalTeamsWithoutLead ?? 0);
      const scheduled = snapshot.dutyManagement?.totals.scheduledToday ?? 0;
      const onDuty = snapshot.dutyManagement?.totals.onDutyNow ?? 0;
      const prefix = isScopedHead
        ? "dashboardV3.scopedHead.metrics"
        : "dashboardV3.officeHead.metrics";

      return [
        {
          label: t(`${prefix}.people`),
          value: snapshot.activeEmployees ?? "—",
          detail: t(`${prefix}.peopleDetail`),
          icon: "directory",
          path: "/directory",
        },
        {
          label: t(`${prefix}.activeWork`),
          value: snapshot.activeWork,
          detail: t(`${prefix}.activeWorkDetail`),
          icon: "work",
          path: "/work",
        },
        {
          label: t(`${prefix}.pendingActions`),
          value: pendingActions,
          detail: t(`${prefix}.pendingActionsDetail`),
          icon: "monitoring",
          tone: pendingActions > 0 ? "warning" : "success",
        },
        {
          label: t(`${prefix}.dutyCoverage`),
          value: `${onDuty}/${scheduled}`,
          detail: t(`${prefix}.dutyCoverageDetail`),
          icon: "duty",
          path: "/duty-management",
          tone: scheduled > 0 && onDuty < scheduled ? "warning" : "success",
        },
        {
          label: t(`${prefix}.communication`),
          value: snapshot.unreadNotifications,
          detail: t(`${prefix}.communicationDetail`),
          icon: "messages",
          path: "/messages",
          tone: snapshot.unreadNotifications > 0 ? "default" : "success",
        },
      ];
    }

    return [
      {
        label: t("dashboardV3.metrics.newWork"),
        value: snapshot.newWork,
        detail: t("dashboardV3.metrics.newWorkDetail"),
        icon: "work",
        path: "/my-work",
      },
      {
        label: t("dashboardV3.metrics.dueToday"),
        value: snapshot.dueToday,
        detail: t("dashboardV3.metrics.dueTodayDetail"),
        icon: "duty",
        path: "/my-work",
        tone: snapshot.dueToday > 0 ? "warning" : "default",
      },
      {
        label: t("dashboardV3.metrics.completedToday"),
        value: snapshot.completedToday,
        detail: t("dashboardV3.metrics.completedTodayDetail"),
        icon: "dashboard",
        path: "/my-work",
        tone: "success",
      },
      {
        label: t("dashboardV3.metrics.needAttention"),
        value: snapshot.needAttention,
        detail: t("dashboardV3.metrics.needAttentionDetail"),
        icon: "monitoring",
        path: "/my-work",
        tone: snapshot.needAttention > 0 ? "danger" : "default",
      },
    ];
  }, [snapshot, t]);

  const headNamespace = snapshot?.context.authority.isOrgUnitHead
    ? "dashboardV3.scopedHead"
    : "dashboardV3.officeHead";

  const managerAttention = useMemo(() => {
    if (
      !snapshot ||
      !(snapshot.context.authority.isOfficeHead || snapshot.context.authority.isOrgUnitHead)
    ) {
      return [];
    }
    return [
      snapshot.managerNeedAttention > 0
        ? {
            label: t(`${headNamespace}.attention.workExceptions`, {
              count: snapshot.managerNeedAttention,
            }),
            path: "/work",
            tone: "danger",
          }
        : null,
      snapshot.pendingApproval > 0
        ? {
            label: t("dashboardV3.attention.approvals", { count: snapshot.pendingApproval }),
            path: "/work",
            tone: "warning",
          }
        : null,
      (snapshot.pendingAccountRequests ?? 0) > 0
        ? {
            label: t("dashboardV3.attention.accountRequests", {
              count: snapshot.pendingAccountRequests ?? 0,
            }),
            path: "/account-requests",
            tone: "info",
          }
        : null,
      (snapshot.operationalTeamsWithoutLead ?? 0) > 0
        ? {
            label: t(`${headNamespace}.attention.teamLeadership`, {
              count: snapshot.operationalTeamsWithoutLead ?? 0,
            }),
            path: "/team-management",
            tone: "warning",
          }
        : null,
      (snapshot.dutyManagement?.totals.cancelledToday ?? 0) > 0
        ? {
            label: t(`${headNamespace}.attention.cancelledDuty`, {
              count: snapshot.dutyManagement?.totals.cancelledToday ?? 0,
            }),
            path: "/duty-management",
            tone: "warning",
          }
        : null,
    ].filter((item): item is { label: string; path: string; tone: string } => Boolean(item));
  }, [headNamespace, snapshot, t]);

  const isOfficeHead = Boolean(snapshot?.context.authority.isOfficeHead);
  const isScopedHead = Boolean(snapshot?.context.authority.isOrgUnitHead);
  const isProfessionalHead = isOfficeHead || isScopedHead;
  const headActionCount = snapshot
    ? snapshot.managerNeedAttention +
      snapshot.pendingApproval +
      (snapshot.pendingAccountRequests ?? 0) +
      (snapshot.operationalTeamsWithoutLead ?? 0)
    : 0;
  const officeHeadActionCount = snapshot
    ? snapshot.pendingApproval +
      snapshot.managerNeedAttention +
      (snapshot.pendingAccountRequests ?? 0) +
      (snapshot.operationalTeamsWithoutLead ?? 0)
    : 0;
  const isManager = Boolean(
    snapshot?.context.authority.isOfficeHead || snapshot?.context.authority.isOrgUnitHead,
  );

  const dutyCard = useMemo(() => {
    if (!snapshot || isManager) return null;
    const duty = snapshot.myDuty;
    const current = duty?.current ?? null;
    const next = duty?.next ?? null;

    if (current) {
      return {
        tone: "on-duty",
        title: t("dashboardV3.dutyCard.onDutyTitle"),
        detail: t("dashboardV3.dutyCard.shiftDetail", {
          shift: current.shift.name,
          start: formatTime(current.startsAt, i18n.language),
          end: formatTime(current.endsAt, i18n.language),
        }),
        meta: current.reportingLocation || current.orgUnit?.name || null,
      };
    }

    if (duty?.effectiveStatus === "LEAVE") {
      return {
        tone: "exception",
        title: t("dashboardV3.dutyCard.leaveTitle"),
        detail: t("dashboardV3.dutyCard.leaveDetail"),
        meta: duty.exception?.note ?? null,
      };
    }

    if (duty?.effectiveStatus === "HOLIDAY") {
      return {
        tone: "exception",
        title: t("dashboardV3.dutyCard.holidayTitle"),
        detail: t("dashboardV3.dutyCard.holidayDetail"),
        meta: duty.exception?.note ?? null,
      };
    }

    if (duty?.effectiveStatus === "UPCOMING" && next) {
      return {
        tone: "upcoming",
        title: t("dashboardV3.dutyCard.upcomingTitle"),
        detail: t("dashboardV3.dutyCard.shiftDetail", {
          shift: next.shift.name,
          start: formatTime(next.startsAt, i18n.language),
          end: formatTime(next.endsAt, i18n.language),
        }),
        meta: next.reportingLocation || next.orgUnit?.name || null,
      };
    }

    return {
      tone: "off-duty",
      title: t("dashboardV3.dutyCard.offDutyTitle"),
      detail: next
        ? t("dashboardV3.dutyCard.nextDutyDetail", {
            value: formatDateTime(next.startsAt, i18n.language),
          })
        : t("dashboardV3.dutyCard.offDutyDetail"),
      meta: null,
    };
  }, [snapshot, isManager, t, i18n.language]);

  return (
    <main className="management-page manager-home">
      <section className="manager-home__canvas">
        <header className="manager-home__hero manager-home__hero--compact">
          <div className="manager-home__hero-copy">
            <span>{t("dashboardV3.eyebrow")}</span>
            <h1>
              {t("dashboardV3.greeting", {
                name: account?.displayName ?? t("dashboardV3.officeUser"),
              })}
            </h1>
            {placementLabel ? (
              <div
                className="manager-home__placement"
                title={placement?.orgUnit?.orgUnitType.name ?? placement?.office.name}
              >
                <ManagementIcon name={isOfficeHead ? "management" : "organization"} />
                <strong>
                  {isOfficeHead
                    ? t("dashboardV3.officeHead.roleWithOffice", { office: placementLabel })
                    : isScopedHead
                      ? t("dashboardV3.scopedHead.roleWithUnit", {
                          type: placement?.orgUnit?.orgUnitType.name ?? t("dashboardV3.scopedHead.unit"),
                          unit: placementLabel,
                        })
                      : placementLabel}
                </strong>
              </div>
            ) : null}
            <p>
              {isOfficeHead
                ? t("dashboardV3.officeHead.description")
                : isScopedHead
                  ? t("dashboardV3.scopedHead.description")
                  : isManager
                    ? t("dashboardV3.managerDescription")
                  : t("dashboardV3.employeeDescription")}
            </p>
            {isOfficeHead && snapshot ? (
              <div
                className={`manager-home__office-status ${officeHeadActionCount > 0 ? "manager-home__office-status--attention" : "manager-home__office-status--stable"}`}
              >
                <span aria-hidden="true" />
                <strong>
                  {officeHeadActionCount > 0
                    ? t("dashboardV3.officeHead.status.attention", { count: officeHeadActionCount })
                    : t("dashboardV3.officeHead.status.stable")}
                </strong>
                <small>{t("dashboardV3.officeHead.status.detail")}</small>
              </div>
            ) : null}
            {isScopedHead && snapshot ? (
              <div
                className={`manager-home__office-status ${headActionCount > 0 ? "manager-home__office-status--attention" : "manager-home__office-status--stable"}`}
              >
                <span aria-hidden="true" />
                <strong>
                  {headActionCount > 0
                    ? t("dashboardV3.scopedHead.status.attention", { count: headActionCount })
                    : t("dashboardV3.scopedHead.status.stable")}
                </strong>
                <small>{t("dashboardV3.scopedHead.status.detail")}</small>
              </div>
            ) : null}
          </div>
          <div className="manager-home__hero-actions">
            {snapshot ? (
              <small className="manager-home__updated">
                {t("dashboardV3.updated", {
                  value: formatDateTime(snapshot.generatedAt, i18n.language),
                })}
              </small>
            ) : null}
            <button
              type="button"
              className="manager-home__primary-action"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loading}
            >
              {loading ? t("dashboardV3.refreshing") : t("dashboardV3.refresh")}
            </button>
          </div>
        </header>

        {error ? (
          <section className="manager-workspace-state manager-workspace-state--error" role="alert">
            <div>
              <strong>{t("dashboardV3.unavailable")}</strong>
              <p>{error}</p>
            </div>
          </section>
        ) : null}

        {loading ? (
          <section className="manager-home__metrics" aria-label={t("dashboardV3.loading")}>
            {[0, 1, 2, 3].map((value) => (
              <article className="manager-home__metric manager-home__metric--skeleton" key={value} />
            ))}
          </section>
        ) : null}

        {snapshot ? (
          <>
            {!isManager && dutyCard ? (
              <section className={`manager-home__duty-card manager-home__duty-card--${dutyCard.tone}`}>
                <div className="manager-home__duty-icon" aria-hidden="true">
                  <ManagementIcon name="duty" />
                </div>
                <div className="manager-home__duty-copy">
                  <span>{t("dashboardV3.dutyCard.eyebrow")}</span>
                  <h2>{dutyCard.title}</h2>
                  <p>{dutyCard.detail}</p>
                  {dutyCard.meta ? <small>{dutyCard.meta}</small> : null}
                </div>
                <Link to="/my-duty">
                  {t("dashboardV3.dutyCard.openMyDuty")}
                  <span aria-hidden="true">→</span>
                </Link>
              </section>
            ) : null}

            <section
              className={`manager-home__metrics ${isProfessionalHead ? "manager-home__metrics--office-head" : ""}`}
              aria-label={t("dashboardV3.summaryAria")}
            >
              {metrics.map((metric) => {
                const content = (
                  <>
                    <div className="manager-home__metric-label">
                      <span className="manager-home__metric-icon" aria-hidden="true">
                        <ManagementIcon name={metric.icon} />
                      </span>
                      <span>{metric.label}</span>
                    </div>
                    <strong>{metric.value}</strong>
                    <small>{metric.detail}</small>
                  </>
                );
                return metric.path ? (
                  <Link
                    className={`manager-home__metric manager-home__metric--${metric.tone ?? "default"}`}
                    key={metric.label}
                    to={metric.path}
                  >
                    {content}
                  </Link>
                ) : (
                  <article
                    className={`manager-home__metric manager-home__metric--${metric.tone ?? "default"}`}
                    key={metric.label}
                  >
                    {content}
                  </article>
                );
              })}
            </section>

            {isProfessionalHead ? (
              <>
                <section className="manager-home__office-command-grid">
                  <article className="manager-home__panel manager-home__office-attention">
                    <header>
                      <div>
                        <span>{t(`${headNamespace}.attention.eyebrow`)}</span>
                        <h2>{t(`${headNamespace}.attention.title`)}</h2>
                        <p>{t(`${headNamespace}.attention.description`)}</p>
                      </div>
                    </header>
                    {managerAttention.length ? (
                      <div className="manager-home__attention-list manager-home__attention-list--office">
                        {managerAttention.map((item) => (
                          <Link key={item.label} to={item.path}>
                            <span
                              className={`manager-home__attention-dot manager-home__attention-dot--${item.tone}`}
                            />
                            <strong>{item.label}</strong>
                            <span aria-hidden="true">→</span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="manager-home__empty manager-home__empty--positive">
                        <span className="manager-home__empty-icon" aria-hidden="true">✓</span>
                        <strong>{t(`${headNamespace}.attention.clearTitle`)}</strong>
                        <p>{t(`${headNamespace}.attention.clearDescription`)}</p>
                      </div>
                    )}
                  </article>

                  <article className="manager-home__panel manager-home__office-pulse">
                    <header>
                      <div>
                        <span>{t(`${headNamespace}.pulse.eyebrow`)}</span>
                        <h2>{t(`${headNamespace}.pulse.title`)}</h2>
                      </div>
                    </header>
                    <div className="manager-home__pulse-list">
                      <Link to="/organization">
                        <ManagementIcon name="organization" />
                        <span>
                          <strong>{t(`${headNamespace}.pulse.orgUnits`)}</strong>
                          <small>{t(`${headNamespace}.pulse.orgUnitsDetail`, { count: snapshot.activeOrgUnits ?? 0 })}</small>
                        </span>
                        <b>{snapshot.activeOrgUnits ?? "—"}</b>
                      </Link>
                      <Link to="/team-management">
                        <ManagementIcon name="teams" />
                        <span>
                          <strong>{t(`${headNamespace}.pulse.teams`)}</strong>
                          <small>{t(`${headNamespace}.pulse.teamsDetail`, { count: snapshot.operationalTeams ?? 0 })}</small>
                        </span>
                        <b>{snapshot.operationalTeams ?? "—"}</b>
                      </Link>
                      <Link to="/account-requests">
                        <ManagementIcon name="requests" />
                        <span>
                          <strong>{t(`${headNamespace}.pulse.accountRequests`)}</strong>
                          <small>{t(`${headNamespace}.pulse.accountRequestsDetail`)}</small>
                        </span>
                        <b>{snapshot.pendingAccountRequests ?? "—"}</b>
                      </Link>
                    </div>
                  </article>
                </section>

                <section className="manager-home__domain-grid" aria-label={t(`${headNamespace}.domains.aria`)}>
                  <article className="manager-home__domain-card manager-home__domain-card--people">
                    <header>
                      <span className="manager-home__domain-icon"><ManagementIcon name="organization" /></span>
                      <div>
                        <span>{t(`${headNamespace}.domains.organization.eyebrow`)}</span>
                        <h2>{t(`${headNamespace}.domains.organization.title`)}</h2>
                      </div>
                    </header>
                    <div className="manager-home__domain-stats">
                      <div><strong>{snapshot.activeEmployees ?? "—"}</strong><span>{t(`${headNamespace}.domains.organization.people`)}</span></div>
                      <div><strong>{snapshot.activeOrgUnits ?? "—"}</strong><span>{t(`${headNamespace}.domains.organization.units`)}</span></div>
                      <div><strong>{snapshot.pendingAccountRequests ?? "—"}</strong><span>{t(`${headNamespace}.domains.organization.requests`)}</span></div>
                    </div>
                    <footer>
                      <Link to="/organization">{t(`${headNamespace}.domains.organization.openOrganization`)} <span aria-hidden="true">→</span></Link>
                      <Link to="/directory">{t(`${headNamespace}.domains.organization.openDirectory`)}</Link>
                    </footer>
                  </article>

                  <article className="manager-home__domain-card manager-home__domain-card--work">
                    <header>
                      <span className="manager-home__domain-icon"><ManagementIcon name="work" /></span>
                      <div>
                        <span>{t(`${headNamespace}.domains.work.eyebrow`)}</span>
                        <h2>{t(`${headNamespace}.domains.work.title`)}</h2>
                      </div>
                    </header>
                    <div className="manager-home__work-pipeline">
                      <div><span>{t(`${headNamespace}.domains.work.active`)}</span><strong>{snapshot.activeWork}</strong></div>
                      <div><span>{t(`${headNamespace}.domains.work.incoming`)}</span><strong>{snapshot.incomingWork}</strong></div>
                      <div><span>{t(`${headNamespace}.domains.work.review`)}</span><strong>{snapshot.pendingApproval}</strong></div>
                      <div className={snapshot.managerNeedAttention > 0 ? "is-attention" : ""}><span>{t(`${headNamespace}.domains.work.attention`)}</span><strong>{snapshot.managerNeedAttention}</strong></div>
                    </div>
                    <div className="manager-home__pipeline-bar" aria-hidden="true">
                      <span style={{ flex: Math.max(snapshot.incomingWork, 1) }} />
                      <span style={{ flex: Math.max(snapshot.activeWork - snapshot.incomingWork - snapshot.pendingApproval, 1) }} />
                      <span style={{ flex: Math.max(snapshot.pendingApproval, 1) }} />
                    </div>
                    <footer>
                      <Link to="/work">{t(`${headNamespace}.domains.work.openWork`)} <span aria-hidden="true">→</span></Link>
                      {snapshot.context.features.reports ? <Link to="/work-reports">{t(`${headNamespace}.domains.work.openReports`)}</Link> : null}
                    </footer>
                  </article>

                  <article className="manager-home__domain-card manager-home__domain-card--duty">
                    <header>
                      <span className="manager-home__domain-icon"><ManagementIcon name="duty" /></span>
                      <div>
                        <span>{t(`${headNamespace}.domains.duty.eyebrow`)}</span>
                        <h2>{t(`${headNamespace}.domains.duty.title`)}</h2>
                      </div>
                    </header>
                    <div className="manager-home__coverage-visual">
                      <div>
                        <strong>{snapshot.dutyManagement?.totals.onDutyNow ?? 0}</strong>
                        <span>{t(`${headNamespace}.domains.duty.onDuty`)}</span>
                      </div>
                      <span aria-hidden="true">/</span>
                      <div>
                        <strong>{snapshot.dutyManagement?.totals.scheduledToday ?? 0}</strong>
                        <span>{t(`${headNamespace}.domains.duty.scheduled`)}</span>
                      </div>
                    </div>
                    <div className="manager-home__domain-note">
                      <span>{t(`${headNamespace}.domains.duty.leave`, { count: snapshot.dutyManagement?.totals.leaveToday ?? 0 })}</span>
                      <span>{t(`${headNamespace}.domains.duty.teams`, { count: snapshot.operationalTeams ?? 0 })}</span>
                    </div>
                    <footer>
                      <Link to="/duty-management">{t(`${headNamespace}.domains.duty.openDuty`)} <span aria-hidden="true">→</span></Link>
                      {snapshot.context.features.teamManagement ? <Link to="/team-management">{t(`${headNamespace}.domains.duty.openTeams`)}</Link> : null}
                    </footer>
                  </article>

                  <article className="manager-home__domain-card manager-home__domain-card--communication">
                    <header>
                      <span className="manager-home__domain-icon"><ManagementIcon name="messages" /></span>
                      <div>
                        <span>{t(`${headNamespace}.domains.communication.eyebrow`)}</span>
                        <h2>{t(`${headNamespace}.domains.communication.title`)}</h2>
                      </div>
                    </header>
                    <div className="manager-home__domain-stats manager-home__domain-stats--communication">
                      <div><strong>{snapshot.unreadNotifications}</strong><span>{t(`${headNamespace}.domains.communication.unread`)}</span></div>
                      <div><strong>{snapshot.messagesToday}</strong><span>{t(`${headNamespace}.domains.communication.today`)}</span></div>
                      <div><strong>{snapshot.activeConversations}</strong><span>{t(`${headNamespace}.domains.communication.conversations`)}</span></div>
                    </div>
                    <p className="manager-home__privacy-note">{t(`${headNamespace}.domains.communication.privacy`)}</p>
                    <footer>
                      <Link to="/messages">{t(`${headNamespace}.domains.communication.openMessages`)} <span aria-hidden="true">→</span></Link>
                      <Link to="/messages/announcements">{t(`${headNamespace}.domains.communication.openAnnouncements`)}</Link>
                    </footer>
                  </article>
                </section>

                <section className="manager-home__workspace-tools">
                  <header>
                    <div>
                      <span>{t(`${headNamespace}.tools.eyebrow`)}</span>
                      <h2>{t(`${headNamespace}.tools.title`)}</h2>
                      <p>{t(`${headNamespace}.tools.description`)}</p>
                    </div>
                  </header>
                  <div className="manager-home__tool-grid">
                    {snapshot.context.features.organizationManage ? <Link to="/organization"><ManagementIcon name="organization" /><span><strong>{t(`${headNamespace}.tools.organization`)}</strong><small>{t(`${headNamespace}.tools.organizationDetail`)}</small></span><b>→</b></Link> : null}
                    {snapshot.context.features.accountRequests ? <Link to="/account-requests"><ManagementIcon name="requests" /><span><strong>{t(`${headNamespace}.tools.accounts`)}</strong><small>{t(`${headNamespace}.tools.accountsDetail`)}</small></span><b>→</b></Link> : null}
                    {snapshot.context.features.workManagement ? <Link to="/work"><ManagementIcon name="work" /><span><strong>{t(`${headNamespace}.tools.work`)}</strong><small>{t(`${headNamespace}.tools.workDetail`)}</small></span><b>→</b></Link> : null}
                    {snapshot.context.features.workTypes ? <Link to="/work-types"><ManagementIcon name="management" /><span><strong>{t(`${headNamespace}.tools.workTypes`)}</strong><small>{t(`${headNamespace}.tools.workTypesDetail`)}</small></span><b>→</b></Link> : null}
                    {snapshot.context.features.dutyRoster ? <Link to="/duty-management"><ManagementIcon name="duty" /><span><strong>{t(`${headNamespace}.tools.duty`)}</strong><small>{t(`${headNamespace}.tools.dutyDetail`)}</small></span><b>→</b></Link> : null}
                    {snapshot.context.features.teamManagement ? <Link to="/team-management"><ManagementIcon name="teams" /><span><strong>{t(`${headNamespace}.tools.teams`)}</strong><small>{t(`${headNamespace}.tools.teamsDetail`)}</small></span><b>→</b></Link> : null}
                    {snapshot.context.features.reports ? <Link to="/work-reports"><ManagementIcon name="reports" /><span><strong>{t(`${headNamespace}.tools.reports`)}</strong><small>{t(`${headNamespace}.tools.reportsDetail`)}</small></span><b>→</b></Link> : null}
                    {snapshot.context.features.messages ? <Link to="/messages"><ManagementIcon name="messages" /><span><strong>{t(`${headNamespace}.tools.messages`)}</strong><small>{t(`${headNamespace}.tools.messagesDetail`)}</small></span><b>→</b></Link> : null}
                    {snapshot.context.features.settings ? <Link to="/settings"><ManagementIcon name="settings" /><span><strong>{t(`${headNamespace}.tools.settings`)}</strong><small>{t(`${headNamespace}.tools.settingsDetail`)}</small></span><b>→</b></Link> : null}
                    {snapshot.context.features.emergency ? (
                      <div className="manager-home__tool-emergency">
                        <div className="manager-home__tool-emergency-copy">
                          <ManagementIcon name="monitoring" />
                          <span><strong>{t(`${headNamespace}.tools.emergency`)}</strong><small>{t(`${headNamespace}.tools.emergencyDetail`)}</small></span>
                        </div>
                        <EmergencyAlertButton />
                      </div>
                    ) : null}
                  </div>
                </section>
              </>
            ) : (
              <section className="manager-home__dashboard-grid">
              {isManager ? (
                <article className="manager-home__panel">
                  <header>
                    <div>
                      <span>{t("dashboardV3.attention.eyebrow")}</span>
                      <h2>{t("dashboardV3.attention.title")}</h2>
                    </div>
                  </header>
                  {managerAttention.length ? (
                    <div className="manager-home__attention-list">
                      {managerAttention.map((item) => (
                        <Link key={item.label} to={item.path}>
                          <span
                            className={`manager-home__attention-dot manager-home__attention-dot--${item.tone}`}
                          />
                          <strong>{item.label}</strong>
                          <span aria-hidden="true">→</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="manager-home__empty">
                      <strong>{t("dashboardV3.attention.clearTitle")}</strong>
                      <p>{t("dashboardV3.attention.clearDescription")}</p>
                    </div>
                  )}
                </article>
              ) : (
                <article className="manager-home__panel">
                  <header>
                    <div>
                      <span>{t("dashboardV3.myWork.eyebrow")}</span>
                      <h2>{t("dashboardV3.myWork.title")}</h2>
                    </div>
                    <Link to="/my-work">{t("dashboardV3.viewAll")}</Link>
                  </header>
                  {snapshot.myWork.length ? (
                    <div className="manager-home__work-list">
                      {snapshot.myWork.slice(0, 4).map((work) => (
                        <Link key={work.id} to={`/work/${work.officeId}/${work.id}?source=my-work`}>
                          <div>
                            <strong>{work.title}</strong>
                            <small>
                              {work.ticketNumber} · {work.workTypeVersion.name}
                            </small>
                          </div>
                          <span>{work.status.replaceAll("_", " ")}</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="manager-home__empty manager-home__empty--positive">
                      <span className="manager-home__empty-icon" aria-hidden="true">✓</span>
                      <strong>{t("dashboardV3.myWork.emptyTitle")}</strong>
                      <p>{t("dashboardV3.myWork.emptyDescription")}</p>
                    </div>
                  )}
                </article>
              )}

              <article className="manager-home__panel manager-home__panel--compact">
                <header>
                  <div>
                    <span>{t("dashboardV3.today.eyebrow")}</span>
                    <h2>
                      {isManager
                        ? t("dashboardV3.today.managementTitle")
                        : t("dashboardV3.today.employeeTitle")}
                    </h2>
                  </div>
                </header>
                <div className="manager-home__today-list">
                  {isManager ? (
                    <>
                      <Link to="/duty-management">
                        <ManagementIcon name="duty" />
                        <span>
                          <strong>{t("dashboardV3.today.dutyCoverage")}</strong>
                          <small>
                            {t("dashboardV3.today.dutyCoverageDetail", {
                              scheduled: snapshot.dutyManagement?.totals.scheduledToday ?? 0,
                              onDuty: snapshot.dutyManagement?.totals.onDutyNow ?? 0,
                            })}
                          </small>
                        </span>
                      </Link>
                      {snapshot.context.features.teamManagement ? (
                        <Link to="/team-management">
                          <ManagementIcon name="teams" />
                          <span>
                            <strong>{t("dashboardV3.today.operationalTeams")}</strong>
                            <small>
                              {t("dashboardV3.today.operationalTeamsDetail", {
                                count: snapshot.operationalTeams ?? 0,
                              })}
                            </small>
                          </span>
                        </Link>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Link to="/my-duty">
                        <ManagementIcon name="duty" />
                        <span>
                          <strong>{t("dashboardV3.today.myDuty")}</strong>
                          <small>
                            {snapshot.myDuty?.current
                              ? `${formatTime(snapshot.myDuty.current.startsAt, i18n.language)} – ${formatTime(
                                  snapshot.myDuty.current.endsAt,
                                  i18n.language,
                                )}`
                              : t("dashboardV3.today.noCurrentDuty")}
                          </small>
                        </span>
                      </Link>
                      <Link to="/messages">
                        <ManagementIcon name="messages" />
                        <span>
                          <strong>{t("dashboardV3.today.messages")}</strong>
                          <small>
                            {t("dashboardV3.today.messagesDetail", {
                              count: snapshot.unreadNotifications,
                            })}
                          </small>
                        </span>
                      </Link>
                      {snapshot.needAttention > 0 ? (
                        <Link to="/my-work" className="manager-home__today-attention">
                          <ManagementIcon name="monitoring" />
                          <span>
                            <strong>{t("dashboardV3.today.workAttention")}</strong>
                            <small>
                              {t("dashboardV3.today.workAttentionDetail", {
                                count: snapshot.needAttention,
                              })}
                            </small>
                          </span>
                        </Link>
                      ) : null}
                    </>
                  )}
                </div>
              </article>
              </section>
            )}

            {!isManager && snapshot.context.authority.isOperationalTeamLead ? (
              <section className="manager-home__lead-responsibilities">
                <header>
                  <div>
                    <span>{t("dashboardV3.lead.eyebrow")}</span>
                    <h2>{t("dashboardV3.lead.title")}</h2>
                    <p>{t("dashboardV3.lead.description")}</p>
                  </div>
                  <Link to="/my-work">{t("dashboardV3.lead.openTeamWork")}</Link>
                </header>
                {snapshot.teamWork.length ? (
                  <div className="manager-home__lead-grid">
                    {snapshot.teamWork.slice(0, 4).map((work) => (
                      <Link key={work.id} to={`/work/${work.officeId}/${work.id}?source=my-work`}>
                        <span>
                          {work.assignedOperationalTeam?.name ?? t("dashboardV3.lead.teamWork")}
                        </span>
                        <strong>{work.title}</strong>
                        <small>
                          {work.dueAt
                            ? t("dashboardV3.lead.due", {
                                value: formatDateTime(work.dueAt, i18n.language),
                              })
                            : t("dashboardV3.lead.noDue")}
                        </small>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="manager-home__empty">
                    <strong>{t("dashboardV3.lead.emptyTitle")}</strong>
                    <p>{t("dashboardV3.lead.emptyDescription")}</p>
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
