import { apiDownload, apiRequest } from "../lib/api";
import type {
  WorkReportContext,
  WorkReportDutyCompatibility,
  WorkReportExportDataset,
  WorkReportOverview,
  WorkReportPrintPayload,
  WorkReportQuery,
  WorkReportRecordsQuery,
  WorkReportTechnicalPerformance,
  WorkReportWorkRecords,
  WorkReportLegacyDutyQuery,
  WorkReportLegacyDutyResponse,
} from "../types/work-reports";

function authHeader(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function officePath(officeId: string): string {
  return `/work-reports/offices/${officeId}`;
}

function queryString<T extends object>(query: T): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function getWorkReportContext(
  accessToken: string,
  officeId: string,
): Promise<WorkReportContext> {
  return apiRequest<WorkReportContext>(`${officePath(officeId)}/context`, {
    headers: authHeader(accessToken),
  });
}

export function getWorkReportOverview(
  accessToken: string,
  officeId: string,
  query: WorkReportQuery,
): Promise<WorkReportOverview> {
  return apiRequest<WorkReportOverview>(
    `${officePath(officeId)}/overview${queryString(query)}`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkReportWorkRecords(
  accessToken: string,
  officeId: string,
  query: WorkReportRecordsQuery,
): Promise<WorkReportWorkRecords> {
  return apiRequest<WorkReportWorkRecords>(
    `${officePath(officeId)}/work-records${queryString(query)}`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkReportTechnicalPerformance(
  accessToken: string,
  officeId: string,
  query: WorkReportQuery,
): Promise<WorkReportTechnicalPerformance> {
  return apiRequest<WorkReportTechnicalPerformance>(
    `${officePath(officeId)}/technical-performance${queryString(query)}`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkReportPrintPayload(
  accessToken: string,
  officeId: string,
  dataset: WorkReportExportDataset,
  query: WorkReportQuery,
): Promise<WorkReportPrintPayload> {
  return apiRequest<WorkReportPrintPayload>(
    `${officePath(officeId)}/print-data${queryString({ ...query, dataset })}`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkReportDutyCompatibility(
  accessToken: string,
  officeId: string,
): Promise<WorkReportDutyCompatibility> {
  return apiRequest<WorkReportDutyCompatibility>(
    `${officePath(officeId)}/duty-compatibility`,
    { headers: authHeader(accessToken) },
  );
}

export function getLegacyDutyReportPage(
  accessToken: string,
  query: WorkReportLegacyDutyQuery,
): Promise<WorkReportLegacyDutyResponse> {
  return apiRequest<WorkReportLegacyDutyResponse>(
    `/work-reports/drilldown${queryString({ ...query, dataset: "DUTY_ASSIGNMENTS" })}`,
    { headers: authHeader(accessToken) },
  );
}

export async function downloadLegacyDutyReportCsv(
  accessToken: string,
  query: WorkReportLegacyDutyQuery,
): Promise<string> {
  const result = await apiDownload(
    `/work-reports/export${queryString({ ...query, dataset: "DUTY_ASSIGNMENTS" })}`,
    { headers: authHeader(accessToken) },
  );
  const objectUrl = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = result.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return result.filename;
}

export async function downloadWorkReportCsv(
  accessToken: string,
  officeId: string,
  dataset: WorkReportExportDataset,
  query: WorkReportQuery,
): Promise<string> {
  const result = await apiDownload(
    `${officePath(officeId)}/export${queryString({ ...query, dataset })}`,
    { headers: authHeader(accessToken) },
  );
  const objectUrl = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = result.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return result.filename;
}
