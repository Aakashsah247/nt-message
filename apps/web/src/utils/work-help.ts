import type {
  WorkHelpMaterialType,
  WorkHelpReason,
  WorkHelpRequestStatus,
} from "../types/work-main-parity";

export const WORK_HELP_REASON_LABELS: Record<WorkHelpReason, string> = {
  NEED_ANOTHER_EMPLOYEE: "Need another employee",
  TECHNICAL_GUIDANCE: "Need technical guidance",
  TOOLS_OR_MATERIALS: "Need tools or materials",
  FAP_MAINTENANCE: "FAP maintenance",
  SAFETY_CONCERN: "Safety problem",
  OTHER: "Other problem",
};

export const WORK_HELP_MATERIAL_LABELS: Record<WorkHelpMaterialType, string> = {
  STB: "STB",
  CPE: "CPE",
  DROP_FIBER: "Drop fiber",
};

export const WORK_HELP_STATUS_LABELS: Record<WorkHelpRequestStatus, string> = {
  PENDING: "Help requested",
  ACCEPTED: "Help accepted",
  DECLINED: "Help declined",
  CANCELLED: "Help cancelled",
};
