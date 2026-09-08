import { apiDownload, apiRequest } from "../lib/api";
import type {
  WorkReportV3Context,
  WorkReportV3DutyCompatibility,
  WorkReportV3ExportDataset,
  WorkReportV3Overview,
  WorkReportV3PrintPayload,
  WorkReportV3Query,
  WorkReportV3RecordsQuery,
  WorkReportV3StageAnalysis,
  WorkReportV3TechnicalPerformance,
  WorkReportV3WorkRecords,
  WorkReportLegacyDutyQuery,
  WorkReportLegacyDutyResponse,
} from "../types/work-reports-v3";

function authHeader(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function officePath(officeId: string): string {
  return `/work-reports/v3/offices/${officeId}`;
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

export function getWorkReportV3Context(
  accessToken: string,
  officeId: string,
): Promise<WorkReportV3Context> {
  return apiRequest<WorkReportV3Context>(`${officePath(officeId)}/context`, {
    headers: authHeader(accessToken),
  });
}

export function getWorkReportV3Overview(
  accessToken: string,
  officeId: string,
  query: WorkReportV3Query,
): Promise<WorkReportV3Overview> {
  return apiRequest<WorkReportV3Overview>(
    `${officePath(officeId)}/overview${queryString(query)}`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkReportV3WorkRecords(
  accessToken: string,
  officeId: string,
  query: WorkReportV3RecordsQuery,
): Promise<WorkReportV3WorkRecords> {
  return apiRequest<WorkReportV3WorkRecords>(
    `${officePath(officeId)}/work-records${queryString(query)}`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkReportV3TechnicalPerformance(
  accessToken: string,
  officeId: string,
  query: WorkReportV3Query,
): Promise<WorkReportV3TechnicalPerformance> {
  return apiRequest<WorkReportV3TechnicalPerformance>(
    `${officePath(officeId)}/technical-performance${queryString(query)}`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkReportV3StageAnalysis(
  accessToken: string,
  officeId: string,
  query: WorkReportV3RecordsQuery,
): Promise<WorkReportV3StageAnalysis> {
  return apiRequest<WorkReportV3StageAnalysis>(
    `${officePath(officeId)}/stage-sla${queryString(query)}`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkReportV3PrintPayload(
  accessToken: string,
  officeId: string,
  dataset: WorkReportV3ExportDataset,
  query: WorkReportV3Query,
): Promise<WorkReportV3PrintPayload> {
  return apiRequest<WorkReportV3PrintPayload>(
    `${officePath(officeId)}/print-data${queryString({ ...query, dataset })}`,
    { headers: authHeader(accessToken) },
  );
}

export function getWorkReportV3DutyCompatibility(
  accessToken: string,
  officeId: string,
): Promise<WorkReportV3DutyCompatibility> {
  return apiRequest<WorkReportV3DutyCompatibility>(
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

export async function downloadWorkReportV3Csv(
  accessToken: string,
  officeId: string,
  dataset: WorkReportV3ExportDataset,
  query: WorkReportV3Query,
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
