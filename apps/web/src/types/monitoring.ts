export type ActivityEventType =
  | "LOGIN"
  | "LOGOUT"
  | "PAGE_VIEW"
  | "BUTTON_CLICK"
  | "ACTIVE_HEARTBEAT"
  | "IDLE_STARTED"
  | "IDLE_HEARTBEAT"
  | "ACTIVE_RESUMED"
  | "EMERGENCY_ALERT_SENT"
  | "SESSION_POLICY_LOGOUT";

export type MonitoringStatus = "ACTIVE" | "IDLE" | "OFFLINE";
export type MonitoringEventStatus = "SUCCESS";

export interface RecordActivityEventPayload {
  eventType: ActivityEventType;
  pagePath?: string;
  elementLabel?: string;
}

export interface MonitoringEmployeeRow {
  accountId: string;
  employeeName: string;
  role: string;
  designation: string | null;
  division: string | null;
  department: string | null;
  status: MonitoringStatus;
  currentPage: string | null;
  lastActiveAt: string | null;
  firstLoginAt: string | null;
  lastLogoutAt: string | null;
  totalActiveMinutesToday: number;
  idleMinutesToday: number;
  pagesVisited: number;
  actionsCount: number;
  emergencyAlertsSent: number;
  lastEventType: ActivityEventType | null;
  lastEventLabel: string | null;
}

export interface MonitoringActivityLogRow {
  id: string;
  occurredAt: string;
  accountId: string;
  employeeName: string;
  role: string;
  designation: string | null;
  department: string | null;
  pageName: string | null;
  eventType: ActivityEventType;
  actionLabel: string;
  details: string;
  status: MonitoringEventStatus;
  sessionLabel: string;
  isOfficeHours: boolean;
}

export interface MonitoringActivityLogsResponse {
  generatedAt: string;
  privacyNotice: string;
  filters: {
    date: string;
    fromTime: string;
    toTime: string;
    timezone: "Asia/Kathmandu";
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  records: MonitoringActivityLogRow[];
}

export interface MonitoringActivityLogQuery {
  date?: string;
  fromTime?: string;
  toTime?: string;
  accountId?: string;
  role?: string;
  department?: string;
  eventType?: ActivityEventType | "ALL";
  search?: string;
  page?: number;
  limit?: number;
}

export interface SuperAdminMonitoringResponse {
  generatedAt: string;
  privacyNotice: string;
  retention: {
    detailedActivityDays: number;
    dailySummaryDays: number;
  };
  totals: {
    active: number;
    idle: number;
    offline: number;
    activeMinutes: number;
    idleMinutes: number;
    actions: number;
    emergencyAlerts: number;
  };
  employees: MonitoringEmployeeRow[];
}
