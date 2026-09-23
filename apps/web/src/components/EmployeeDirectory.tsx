import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { ProtectedAvatar } from "./ProtectedAvatar";
import { listDirectoryEmployees } from "../services/directory.service";
import {
  getOrganizationOffices,
  getOrganizationTree,
} from "../services/organization-v3.service";
import type {
  DirectoryAccountStatus,
  DirectoryActivationStatus,
  DirectoryEmployee,
  DirectoryEmploymentStatus,
  DirectoryListResponse,
  DirectoryRecordStatus,
} from "../types/directory";
import type {
  OrganizationOfficeSummary,
  OrganizationUnitNode,
} from "../types/organization-v3";

interface EmployeeDirectoryProps {
  accessToken: string;
  reloadKey?: number;
  onSelectEmployee?: (employeeId: string) => void;
  selectedEmployeeId?: string | null;
}

type EmploymentStatusFilter = DirectoryEmploymentStatus | "";
type AccountStatusFilter = DirectoryAccountStatus | "";
type ActivationStatusFilter = DirectoryActivationStatus | "";
type FormalType = "DIVISION" | "DEPARTMENT" | "SECTION" | "UNIT";

const PAGE_SIZE = 20;
const FORMAL_TYPES: FormalType[] = ["DIVISION", "DEPARTMENT", "SECTION", "UNIT"];

function getErrorMessage(error: unknown, t: TFunction<"directory">): string {
  return error instanceof Error ? error.message : t("list.errorFallback");
}

function fallbackFormatValue(value: string): string {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatValue(value: string, t: TFunction<"directory">): string {
  return t(`values.${value}`, { defaultValue: fallbackFormatValue(value) });
}

function formatDate(value: string | null, locale: string, t: TFunction<"directory">): string {
  if (!value) return t("common.never");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("common.notAvailable");
  return new Intl.DateTimeFormat(locale === "ne" ? "ne-NP" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusClass(value: string): string {
  return value.toLowerCase().replaceAll("_", "-");
}

function getOrganizationRoleLabel(employee: DirectoryEmployee, t: TFunction<"directory">): string {
  if (employee.leadership.length === 0) {
    return employee.accountClass === "SUPER_ADMIN"
      ? t("organizationRole.superAdmin")
      : t("organizationRole.employee");
  }

  return employee.leadership.map((assignment) => {
    if (assignment.type === "OFFICE_HEAD") {
      return t("organizationRole.officeHead");
    }

    const typeCode = assignment.orgUnit?.typeCode ?? "UNIT";
    const key = typeCode === "DIVISION"
      ? "divisionHead"
      : typeCode === "DEPARTMENT"
        ? "departmentHead"
        : typeCode === "SECTION"
          ? "sectionHead"
          : "unitHead";
    return t(`organizationRole.${key}`);
  }).join(", ");
}

function flattenTree(nodes: OrganizationUnitNode[]): OrganizationUnitNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

function subtreeFromRoot(nodes: OrganizationUnitNode[], rootId: string): OrganizationUnitNode[] {
  const find = (items: OrganizationUnitNode[]): OrganizationUnitNode | null => {
    for (const item of items) {
      if (item.id === rootId) return item;
      const found = find(item.children);
      if (found) return found;
    }
    return null;
  };
  const root = find(nodes);
  return root ? [root, ...flattenTree(root.children)] : [];
}

export function EmployeeDirectory({
  accessToken,
  reloadKey = 0,
  onSelectEmployee,
  selectedEmployeeId = null,
}: EmployeeDirectoryProps) {
  const { t, i18n } = useTranslation("directory");
  const [response, setResponse] = useState<DirectoryListResponse | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatusFilter>("");
  const [recordStatus, setRecordStatus] = useState<DirectoryRecordStatus>("CURRENT");
  const [accountStatus, setAccountStatus] = useState<AccountStatusFilter>("");
  const [activationStatus, setActivationStatus] = useState<ActivationStatusFilter>("");
  const [page, setPage] = useState(1);
  const [completedRequestKey, setCompletedRequestKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [offices, setOffices] = useState<OrganizationOfficeSummary[]>([]);
  const [officeId, setOfficeId] = useState("");
  const [tree, setTree] = useState<OrganizationUnitNode[]>([]);
  const [treeOfficeId, setTreeOfficeId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [unitId, setUnitId] = useState("");

  const viewerIsSuperAdmin = response?.scope.accountClass === "SUPER_ADMIN";

  useEffect(() => {
    let active = true;
    getOrganizationOffices(accessToken)
      .then((result) => {
        if (active) setOffices(result.data.filter((office) => office.isActive));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [accessToken]);

  const resolvedTreeOfficeId = officeId || (response?.scope.accountClass !== "SUPER_ADMIN" ? response?.scope.office?.id ?? "" : "");

  useEffect(() => {
    if (!resolvedTreeOfficeId) return;

    let active = true;
    getOrganizationTree(accessToken, resolvedTreeOfficeId)
      .then((result) => {
        if (!active) return;
        setTree(result.tree);
        setTreeOfficeId(resolvedTreeOfficeId);
      })
      .catch(() => {
        if (!active) return;
        setTree([]);
        setTreeOfficeId(resolvedTreeOfficeId);
      });
    return () => { active = false; };
  }, [accessToken, resolvedTreeOfficeId]);

  const activeTree = treeOfficeId === resolvedTreeOfficeId ? tree : [];
  const formalScopeBase = response?.scope.type === "ORG_UNIT" && response.scope.orgUnit
    ? subtreeFromRoot(activeTree, response.scope.orgUnit.id)
    : flattenTree(activeTree);
  const visibleFormalUnits = formalScopeBase.filter((node) =>
    FORMAL_TYPES.includes(node.orgUnitType.code as FormalType) && node.isActive,
  );

  const byType = (type: FormalType, parentId?: string) => visibleFormalUnits.filter((node) =>
    node.orgUnitType.code === type && (parentId === undefined || node.parentOrgUnitId === parentId),
  );

  const divisionOptions = byType("DIVISION");
  const departmentOptions = byType("DEPARTMENT", divisionId || undefined);
  const sectionOptions = byType("SECTION", departmentId || undefined);
  const unitOptions = byType("UNIT", sectionId || undefined);
  const selectedOrgUnitId = unitId || sectionId || departmentId || divisionId || "";

  const directoryRequestKey = JSON.stringify({
    search,
    employmentStatus,
    recordStatus,
    accountStatus,
    activationStatus,
    officeId,
    selectedOrgUnitId,
    page,
    refreshKey,
    reloadKey,
  });
  const loading = completedRequestKey !== directoryRequestKey;

  useEffect(() => {
    let active = true;
    listDirectoryEmployees(accessToken, {
      search: search || undefined,
      employmentStatus: employmentStatus || undefined,
      recordStatus,
      accountStatus: accountStatus || undefined,
      activationStatus: activationStatus || undefined,
      officeId: officeId || undefined,
      orgUnitId: selectedOrgUnitId || undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return;
        setResponse(result);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(getErrorMessage(requestError, t));
      })
      .finally(() => {
        if (active) setCompletedRequestKey(directoryRequestKey);
      });
    return () => { active = false; };
  }, [accessToken, accountStatus, activationStatus, directoryRequestKey, employmentStatus, officeId, page, recordStatus, refreshKey, reloadKey, search, selectedOrgUnitId, t]);

  function resetHierarchy(nextOfficeId = officeId) {
    setOfficeId(nextOfficeId);
    setDivisionId("");
    setDepartmentId("");
    setSectionId("");
    setUnitId("");
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setEmploymentStatus("");
    setAccountStatus("");
    setActivationStatus("");
    if (viewerIsSuperAdmin) resetHierarchy("");
    else {
      setDivisionId(""); setDepartmentId(""); setSectionId(""); setUnitId(""); setPage(1);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const employees = response?.data ?? [];
  const pagination = response?.pagination;
  const firstVisible = pagination && pagination.total > 0 ? (pagination.page - 1) * PAGE_SIZE + 1 : 0;
  const lastVisible = pagination ? Math.min(pagination.page * PAGE_SIZE, pagination.total) : 0;
  const hasFilters = Boolean(search || employmentStatus || accountStatus || activationStatus || officeId || selectedOrgUnitId);

  const selectedOfficeName = officeId
    ? offices.find((office) => office.id === officeId)?.name ?? t("list.scope.allOffices")
    : response?.scope.office?.name ?? t("list.scope.allOffices");
  const selectedOrgUnitName = selectedOrgUnitId
    ? visibleFormalUnits.find((node) => node.id === selectedOrgUnitId)?.name ?? t("list.scope.allOrgUnits")
    : response?.scope.orgUnit?.name ?? null;

  return (
    <section className="directory-card" aria-busy={loading}>
      <header className="directory-header">
        <div className="directory-header__copy">
          <span>{t("list.eyebrow")}</span>
          <h2>{recordStatus === "ARCHIVED" ? t("list.archivedTitle") : t("list.defaultTitle")}</h2>
          <p>{recordStatus === "ARCHIVED" ? t("list.archivedDescription") : t("list.defaultDescription")}</p>
        </div>
        <div className="directory-total">
          <span>{recordStatus === "ARCHIVED" ? t("list.archivedRecords") : t("list.currentRecords")}</span>
          <strong>{pagination?.total ?? 0}</strong>
        </div>
      </header>

      {viewerIsSuperAdmin && (
        <nav className="directory-record-tabs" aria-label={t("list.recordSectionsAria")}>
          <button type="button" className={recordStatus === "CURRENT" ? "active" : ""} onClick={() => { setRecordStatus("CURRENT"); setPage(1); }}>
            {t("list.currentRecords")}
          </button>
          <button type="button" className={recordStatus === "ARCHIVED" ? "active" : ""} onClick={() => { setRecordStatus("ARCHIVED"); setPage(1); }}>
            {t("list.archivedRecords")}
          </button>
        </nav>
      )}

      {response?.scope && (
        <section className="directory-scope directory-scope--compact">
          <div>
            <span>{t("list.scope.title")}</span>
            <strong>{response.scope.type === "OFFICE" ? t("values.OFFICE") : t("values.ORG_UNIT")}</strong>
          </div>
          <div>
            <span>{t("list.scope.office")}</span>
            <strong>{selectedOfficeName}</strong>
          </div>
          <div>
            <span>{t("list.scope.orgUnit")}</span>
            <strong>{selectedOrgUnitName ? t("list.scope.branch", { name: selectedOrgUnitName }) : response.scope.type === "ORG_UNIT" ? t("list.scope.authorizedBranches") : t("list.scope.allOrgUnits")}</strong>
          </div>
        </section>
      )}

      <section className="directory-toolbar" aria-label={t("list.toolbarAria")}>
        <form className="directory-search" onSubmit={submitSearch}>
          <label>
            <span>{t("list.search.label")}</span>
            <div className="directory-search__control">
              <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={100} placeholder={t("list.search.placeholder")} />
              <button type="submit">{t("list.search.action")}</button>
            </div>
          </label>
        </form>

        <section className="directory-filters directory-filters--hierarchy">
          {viewerIsSuperAdmin && (
            <label>
              <span>{t("list.filters.office")}</span>
              <select value={officeId} onChange={(event) => resetHierarchy(event.target.value)}>
                <option value="">{t("list.scope.allOffices")}</option>
                {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
              </select>
            </label>
          )}

          {activeTree.length > 0 && divisionOptions.length > 0 && (
            <label>
              <span>{t("list.filters.division")}</span>
              <select value={divisionId} onChange={(event) => { setDivisionId(event.target.value); setDepartmentId(""); setSectionId(""); setUnitId(""); setPage(1); }}>
                <option value="">{t("list.filters.allDivisions")}</option>
                {divisionOptions.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>
          )}

          {divisionId && departmentOptions.length > 0 && (
            <label>
              <span>{t("list.filters.department")}</span>
              <select value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setSectionId(""); setUnitId(""); setPage(1); }}>
                <option value="">{t("list.filters.allDepartments")}</option>
                {departmentOptions.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>
          )}

          {departmentId && sectionOptions.length > 0 && (
            <label>
              <span>{t("list.filters.section")}</span>
              <select value={sectionId} onChange={(event) => { setSectionId(event.target.value); setUnitId(""); setPage(1); }}>
                <option value="">{t("list.filters.allSections")}</option>
                {sectionOptions.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>
          )}

          {sectionId && unitOptions.length > 0 && (
            <label>
              <span>{t("list.filters.unit")}</span>
              <select value={unitId} onChange={(event) => { setUnitId(event.target.value); setPage(1); }}>
                <option value="">{t("list.filters.allUnits")}</option>
                {unitOptions.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
              </select>
            </label>
          )}

          <label>
            <span>{t("list.filters.employment")}</span>
            <select value={employmentStatus} onChange={(event) => { setEmploymentStatus(event.target.value as EmploymentStatusFilter); setPage(1); }}>
              <option value="">{t("list.filters.allEmployment")}</option>
              <option value="ACTIVE">{t("values.ACTIVE")}</option>
              <option value="RESIGNED">{t("values.RESIGNED")}</option>
              <option value="RETIRED">{t("values.RETIRED")}</option>
              <option value="TERMINATED">{t("values.TERMINATED")}</option>
            </select>
          </label>

          <label>
            <span>{t("list.filters.accountStatus")}</span>
            <select value={accountStatus} onChange={(event) => { setAccountStatus(event.target.value as AccountStatusFilter); setPage(1); }}>
              <option value="">{t("list.filters.allAccounts")}</option>
              <option value="ENABLED">{t("values.ENABLED")}</option>
              <option value="DISABLED">{t("values.DISABLED")}</option>
              <option value="NO_ACCOUNT">{t("values.NO_ACCOUNT")}</option>
            </select>
          </label>

          <label>
            <span>{t("list.filters.activation")}</span>
            <select value={activationStatus} onChange={(event) => { setActivationStatus(event.target.value as ActivationStatusFilter); setPage(1); }}>
              <option value="">{t("list.filters.allActivation")}</option>
              <option value="ACTIVATED">{t("values.ACTIVATED")}</option>
              <option value="AWAITING_ACTIVATION">{t("values.AWAITING_ACTIVATION")}</option>
            </select>
          </label>

          <button type="button" className="directory-clear-button" onClick={clearFilters} disabled={!hasFilters}>{t("list.filters.clear")}</button>
        </section>
      </section>

      {error && <div className="directory-error" role="alert"><div><strong>{t("list.errorTitle")}</strong><p>{error}</p></div><button type="button" onClick={() => setRefreshKey((current) => current + 1)}>{t("common.tryAgain")}</button></div>}
      {loading && !response && <div className="directory-loading"><div className="spinner" /><p>{t("list.loading")}</p></div>}
      {!loading && !error && employees.length === 0 && <div className="directory-empty"><h3>{recordStatus === "ARCHIVED" ? t("list.empty.archivedTitle") : t("list.empty.currentTitle")}</h3><p>{recordStatus === "ARCHIVED" ? t("list.empty.archivedDescription") : t("list.empty.currentDescription")}</p></div>}

      {employees.length > 0 && (
        <>
          <div className="directory-results-bar"><div><strong>{recordStatus === "ARCHIVED" ? t("list.results.archivedEmployees") : t("list.results.employees")}</strong><span>{t("list.results.showing", { first: firstVisible, last: lastVisible, total: pagination?.total ?? 0 })}</span></div>{loading && response && <span className="directory-results-bar__updating">{t("list.results.updating")}</span>}</div>
          <div className="directory-table-wrap">
            <table className="directory-table">
              <caption className="sr-only">{t("list.table.caption")}</caption>
              <thead><tr><th>{t("common.employee")}</th><th>{t("list.table.organizationRole")}</th><th>{t("list.table.organization")}</th><th>{t("list.filters.employment")}</th><th>{t("list.table.account")}</th><th>{t("list.filters.activation")}</th>{viewerIsSuperAdmin && <th>{recordStatus === "ARCHIVED" ? t("list.table.archivedOn") : t("list.table.lastLogin")}</th>}<th aria-label={t("list.table.profileActions")} /></tr></thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className={selectedEmployeeId === employee.id ? "is-selected" : ""}>
                    <td>
                      <button type="button" className="directory-employee-button" onClick={() => onSelectEmployee?.(employee.id)}>
                        <ProtectedAvatar employeeId={employee.id} photoKey={employee.profilePhotoKey} displayName={employee.empName} className="directory-avatar" ariaLabel={t("list.avatarAria", { name: employee.empName })} />
                        <span><strong>{employee.empName}</strong><small>{employee.empId}</small>{employee.designation?.trim() ? <small>{employee.designation}</small> : null}</span>
                      </button>
                    </td>
                    <td><strong>{getOrganizationRoleLabel(employee, t)}</strong></td>
                    <td><strong>{employee.primaryOrgUnit?.name ?? t("list.table.noOrgUnit")}</strong><small>{employee.orgUnitBreadcrumb.length > 0 ? employee.orgUnitBreadcrumb.map((unit) => unit.name).join(" → ") : employee.office?.name ?? t("list.table.noOffice")}</small></td>
                    <td><span className={`directory-badge ${getStatusClass(employee.employmentStatus)}`}>{formatValue(employee.employmentStatus, t)}</span></td>
                    <td><span className={`directory-badge ${getStatusClass(employee.accountStatus)}`}>{formatValue(employee.accountStatus, t)}</span></td>
                    <td><span className={`directory-badge ${getStatusClass(employee.activationStatus)}`}>{formatValue(employee.activationStatus, t)}</span></td>
                    {viewerIsSuperAdmin && <td className="directory-date"><strong>{formatDate(recordStatus === "ARCHIVED" ? employee.archivedAt : employee.lastLoginAt, i18n.language, t)}</strong></td>}
                    <td className="directory-row-action"><button type="button" onClick={() => onSelectEmployee?.(employee.id)}><span>{t("common.view")}</span><span aria-hidden="true">›</span></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pagination && pagination.totalPages > 1 && (
        <footer className="directory-pagination"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1}>{t("list.pagination.previous")}</button><span>{t("list.pagination.page", { page: pagination.page, totalPages: pagination.totalPages })}</span><button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={loading || page >= pagination.totalPages}>{t("list.pagination.next")}</button></footer>
      )}
    </section>
  );
}
