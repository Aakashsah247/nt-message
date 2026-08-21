import type { AccountRole } from "./auth";

export type AnnouncementAudienceType =
  | "ORGANIZATION"
  | "DIVISION"
  | "DEPARTMENT"
  | "OFFICIAL_GROUP";

export type AnnouncementPriority =
  | "NORMAL"
  | "IMPORTANT"
  | "URGENT"
  | "EMERGENCY";

export type AnnouncementStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "EXPIRED";

export type AnnouncementListFilter =
  | "ALL"
  | "UNREAD"
  | "ACTION_REQUIRED"
  | "DRAFTS"
  | "SCHEDULED"
  | "PUBLISHED"
  | "EXPIRED";

export type AnnouncementAttachmentCategory = "IMAGE" | "DOCUMENT" | "VIDEO";

export interface AnnouncementPublisher {
  id: string;
  displayName: string;
  role: AccountRole;
  designation: string | null;
}

export interface AnnouncementDivision {
  id: string;
  code: string;
  name: string;
}

export interface AnnouncementDepartment {
  id: string;
  divisionId: string;
  code: string;
  name: string;
}

export interface AnnouncementOfficialGroup {
  id: string;
  title: string;
}

export interface AnnouncementAudience {
  type: AnnouncementAudienceType;
  division: AnnouncementDivision | null;
  department: AnnouncementDepartment | null;
  officialGroup: AnnouncementOfficialGroup | null;
}

export interface AnnouncementViewerState {
  deliveredAt: string | null;
  firstReadAt: string | null;
  isRead: boolean;
  readRevision: number | null;
  isAcknowledged: boolean;
  acknowledgedRevision: number | null;
}

export interface AnnouncementAttachment {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  category: AnnouncementAttachmentCategory;
  scanStatus: string;
  expiresAt: string | null;
  expiredAt: string | null;
  isExpired: boolean;
  createdAt: string;
}

export interface AnnouncementRevisionSummary {
  revisionNumber: number;
  editor: AnnouncementPublisher;
  createdAt: string;
}

export interface AnnouncementListItem {
  id: string;
  title: string;
  bodyPreview: string;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  publisher: AnnouncementPublisher;
  requiresAcknowledgement: boolean;
  allowAttachmentDownload: boolean;
  isPinned: boolean;
  currentRevision: number;
  scheduledAt: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  recipientCount: number;
  viewerState: AnnouncementViewerState | null;
  attachmentCount: number;
  attachmentCategories: AnnouncementAttachmentCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementDetail
  extends Omit<
    AnnouncementListItem,
    "bodyPreview" | "attachmentCount" | "attachmentCategories" | "recipientCount"
  > {
  body: string;
  publishFailureReason: string | null;
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  attachments: AnnouncementAttachment[];
  revisions: AnnouncementRevisionSummary[];
  reporting: {
    recipientCount: number;
    acknowledgementHistoryCount: number;
  } | null;
}

export interface AnnouncementReport {
  announcementId: string;
  revisionNumber: number;
  recipients: number;
  delivered: number;
  read: number;
  acknowledged: number;
  pendingAcknowledgement: number;
}

export interface AnnouncementAudienceOptions {
  canTargetOrganization: boolean;
  divisions: AnnouncementDivision[];
  departments: Array<
    AnnouncementDepartment & {
      division: { name: string };
    }
  >;
  officialGroups: Array<{
    id: string;
    title: string;
    scopeType: string | null;
    divisionId: string | null;
    departmentId: string | null;
    activeMemberCount: number;
  }>;
}

export interface AnnouncementOfficialGroupReference {
  id: string;
  title: string;
  bodyPreview: string;
  priority: AnnouncementPriority;
  isPinned: boolean;
  requiresAcknowledgement: boolean;
  publisher: AnnouncementPublisher;
  publishedAt: string | null;
  expiresAt: string | null;
  attachmentCount: number;
  viewerState: AnnouncementViewerState | null;
}

export interface AnnouncementMutationInput {
  title?: string;
  body?: string;
  priority?: AnnouncementPriority;
  requiresAcknowledgement?: boolean;
  allowAttachmentDownload?: boolean;
  isPinned?: boolean;
  scheduledAt?: string | null;
  expiresAt?: string | null;
}

export interface CreateAnnouncementInput extends AnnouncementMutationInput {
  audienceType: AnnouncementAudienceType;
  divisionId?: string;
  departmentId?: string;
  officialConversationId?: string;
}

export interface AnnouncementListResponse {
  data: AnnouncementListItem[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface AnnouncementDetailResponse { data: AnnouncementDetail; }
export interface AnnouncementMutationResponse { message: string; data: AnnouncementDetail; }
export interface AnnouncementAudienceResponse { data: AnnouncementAudienceOptions; }
export interface AnnouncementReportResponse { data: AnnouncementReport; }
export interface AnnouncementActionResponse { message: string; }
export interface AnnouncementAttachmentResponse {
  message: string;
  data: AnnouncementAttachment | null;
}
export interface AnnouncementReadResponse {
  message: string;
  data: { announcementId: string; readRevision: number; readAt: string };
}
export interface AnnouncementAcknowledgementResponse {
  message: string;
  data: { announcementId: string; revisionNumber: number; acknowledgedAt: string };
}
export interface AnnouncementOfficialGroupReferencesResponse {
  data: AnnouncementOfficialGroupReference[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export interface AnnouncementRealtimePayload {
  announcementId: string;
  officialConversationId: string | null;
  action: "PUBLISHED" | "UPDATED" | "DELETED" | "READ" | "ACKNOWLEDGED";
  status: AnnouncementStatus;
  priority: AnnouncementPriority;
  requiresAcknowledgement: boolean;
  revisionNumber: number;
  actorAccountId: string;
  occurredAt: string;
}
