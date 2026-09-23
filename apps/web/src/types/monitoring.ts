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
export type MonitoringAccountClass = "SUPER_ADMIN" | "OFFICE_USER";

export interface RecordActivityEventPayload {
  eventType: ActivityEventType;
  pagePath?: string;
  elementLabel?: string;
}

export interface MonitoringOrgScope {
  officeId: string | null;
  officeCode: string | null;
  officeName: string | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  orgUnitType: string | null;
}

export interface MonitoringEmployeeRow extends MonitoringOrgScope {
  accountId: string;
  employeeName: string;
  accountClass: MonitoringAccountClass;
  designation: string | null;
  profilePhotoKey: string | null;
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

export interface MonitoringActivityLogRow extends MonitoringOrgScope {
  id: string;
  occurredAt: string;
  accountId: string;
  employeeName: string;
  accountClass: MonitoringAccountClass;
  designation: string | null;
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
  accountClass?: MonitoringAccountClass;
  officeId?: string;
  orgUnitId?: string;
  eventType?: ActivityEventType | "ALL";
  search?: string;
  page?: number;
  limit?: number;
}

export type SystemAnalyticsRangeDays = 1 | 7 | 30;

export interface SuperAdminMonitoringResponse {
  generatedAt: string;
  privacyNotice: string;
  retention: {
    detailedActivityDays: number;
    dailySummaryDays: number;
  };
  period: {
    days: SystemAnalyticsRangeDays;
    startDate: string;
    endDate: string;
    timezone: "Asia/Kathmandu";
  };
  totals: {
    active: number;
    idle: number;
    offline: number;
    activeMinutes: number;
    idleMinutes: number;
    actions: number;
    emergencyAlerts: number;
    periodActions: number;
    periodActiveMinutes: number;
    periodIdleMinutes: number;
    periodEmergencyAlerts: number;
    periodAccountRequests: number;
  };
  accountHealth: {
    totalAccounts: number;
    enabledAccounts: number;
    disabledAccounts: number;
    activeEmployees: number;
    inactiveEmployees: number;
    unactivatedEmployees: number;
  };
  organizationHealth: {
    activeOffices: number;
    inactiveOffices: number;
    activeUnits: number;
    inactiveUnits: number;
    activeFormalUnits: number;
    officeHeadsAssigned: number;
    officesWithoutHead: number;
    orgUnitHeadsAssigned: number;
    orgUnitsWithoutHead: number;
    activePrimaryPlacements: number;
    historicalPlacementRecords: number;
    employeesWithoutPlacement: number;
    placementPending: number;
    activeUnitsWithoutPeople: number;
    officesWithoutStructure: number;
  };
  emergencyDelivery: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
    skippedNoPhone: number;
    deliveryRate: number | null;
  };
  officeHealth: Array<{
    officeId: string;
    name: string;
    isActive: boolean;
    activePeople: number;
    historicalPlacementRecords: number;
    activeUnits: number;
    inactiveUnits: number;
    formalUnits: number;
    headedFormalUnits: number;
    officeHeadAssigned: boolean;
    placementPending: number;
    activeUnitsWithoutPeople: number;
    setupStatus: "HEALTHY" | "SETUP_INCOMPLETE" | "INACTIVE";
  }>;
  trend: Array<{
    date: string;
    activeAccounts: number;
    actions: number;
    activeMinutes: number;
    emergencyAlerts: number;
    accountRequests: number;
  }>;
  employees: MonitoringEmployeeRow[];
}
