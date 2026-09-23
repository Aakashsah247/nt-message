import { apiRequest } from "../lib/api";
import type {
  MonitoringActivityLogQuery,
  MonitoringActivityLogsResponse,
  RecordActivityEventPayload,
  SuperAdminMonitoringResponse,
  SystemAnalyticsRangeDays,
} from "../types/monitoring";

export function recordActivityEvent(
  accessToken: string,
  payload: RecordActivityEventPayload,
): Promise<{ recorded: true }> {
  return apiRequest<{ recorded: true }>("/monitoring/activity", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
}

export function getSuperAdminMonitoring(
  accessToken: string,
  days: SystemAnalyticsRangeDays = 1,
): Promise<SuperAdminMonitoringResponse> {
  return apiRequest<SuperAdminMonitoringResponse>(
    `/monitoring/superadmin?days=${days}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function getSuperAdminActivityLogs(
  accessToken: string,
  query: MonitoringActivityLogQuery,
): Promise<MonitoringActivityLogsResponse> {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "ALL") {
      return;
    }

    params.set(key, String(value));
  });

  return apiRequest<MonitoringActivityLogsResponse>(
    `/monitoring/superadmin/activity-logs?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}
