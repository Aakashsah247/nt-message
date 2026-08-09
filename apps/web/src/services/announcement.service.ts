import { apiRequest } from "../lib/api";
import type {
  AnnouncementAcknowledgementResponse,
  AnnouncementActionResponse,
  AnnouncementAttachmentResponse,
  AnnouncementAudienceResponse,
  AnnouncementDetailResponse,
  AnnouncementListFilter,
  AnnouncementListResponse,
  AnnouncementMutationInput,
  AnnouncementMutationResponse,
  AnnouncementOfficialGroupReferencesResponse,
  AnnouncementReadResponse,
  AnnouncementReportResponse,
  CreateAnnouncementInput,
} from "../types/announcements";

const API_URL =
  import.meta.env.VITE_API_URL ??
  "http://localhost:4000/api/v1";

function authorizationHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join(" ");
    if (typeof message === "string") return message;
  }
  return fallback;
}

export function listAnnouncementAudiences(accessToken: string): Promise<AnnouncementAudienceResponse> {
  return apiRequest<AnnouncementAudienceResponse>("/announcements/audiences", {
    headers: authorizationHeaders(accessToken),
  });
}

export function listAnnouncements(
  accessToken: string,
  input: {
    filter?: AnnouncementListFilter;
    search?: string;
    officialConversationId?: string;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<AnnouncementListResponse> {
  const query = new URLSearchParams();
  if (input.filter) query.set("filter", input.filter);
  if (input.search?.trim()) query.set("search", input.search.trim());
  if (input.officialConversationId) {
    query.set("officialConversationId", input.officialConversationId);
  }
  if (input.cursor) query.set("cursor", input.cursor);
  query.set("limit", String(input.limit ?? 40));
  return apiRequest<AnnouncementListResponse>(`/announcements?${query.toString()}`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function getAnnouncement(accessToken: string, announcementId: string): Promise<AnnouncementDetailResponse> {
  return apiRequest<AnnouncementDetailResponse>(`/announcements/${announcementId}`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function createAnnouncementDraft(
  accessToken: string,
  input: CreateAnnouncementInput,
): Promise<AnnouncementMutationResponse> {
  return apiRequest<AnnouncementMutationResponse>("/announcements", {
    method: "POST",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function updateAnnouncement(
  accessToken: string,
  announcementId: string,
  input: AnnouncementMutationInput,
): Promise<AnnouncementMutationResponse> {
  return apiRequest<AnnouncementMutationResponse>(`/announcements/${announcementId}`, {
    method: "PATCH",
    headers: authorizationHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function deleteAnnouncement(accessToken: string, announcementId: string): Promise<AnnouncementActionResponse> {
  return apiRequest<AnnouncementActionResponse>(`/announcements/${announcementId}`, {
    method: "DELETE",
    headers: authorizationHeaders(accessToken),
  });
}

export function publishAnnouncement(accessToken: string, announcementId: string): Promise<AnnouncementMutationResponse> {
  return apiRequest<AnnouncementMutationResponse>(`/announcements/${announcementId}/publish`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
  });
}

export function markAnnouncementRead(accessToken: string, announcementId: string): Promise<AnnouncementReadResponse> {
  return apiRequest<AnnouncementReadResponse>(`/announcements/${announcementId}/read`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
  });
}

export function acknowledgeAnnouncement(
  accessToken: string,
  announcementId: string,
): Promise<AnnouncementAcknowledgementResponse> {
  return apiRequest<AnnouncementAcknowledgementResponse>(`/announcements/${announcementId}/acknowledge`, {
    method: "POST",
    headers: authorizationHeaders(accessToken),
  });
}

export function getAnnouncementReport(accessToken: string, announcementId: string): Promise<AnnouncementReportResponse> {
  return apiRequest<AnnouncementReportResponse>(`/announcements/${announcementId}/report`, {
    headers: authorizationHeaders(accessToken),
  });
}

export function listOfficialGroupAnnouncementReferences(
  accessToken: string,
  conversationId: string,
  limit = 5,
): Promise<AnnouncementOfficialGroupReferencesResponse> {
  return apiRequest<AnnouncementOfficialGroupReferencesResponse>(
    `/announcements/official-groups/${conversationId}/references?limit=${limit}`,
    { headers: authorizationHeaders(accessToken) },
  );
}

export interface AnnouncementUploadProgress {
  loadedBytes: number;
  totalBytes: number | null;
  progressPercent: number;
}

export function uploadAnnouncementAttachment(
  accessToken: string,
  announcementId: string,
  file: File,
  onProgress?: (progress: AnnouncementUploadProgress) => void,
): Promise<AnnouncementAttachmentResponse> {
  const formData = new FormData();
  formData.set("file", file);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_URL}/announcements/${announcementId}/attachments`);
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    request.responseType = "text";

    request.upload.onprogress = (event) => {
      const totalBytes = event.lengthComputable && event.total > 0 ? event.total : null;
      onProgress?.({
        loadedBytes: event.loaded,
        totalBytes,
        progressPercent: totalBytes
          ? Math.min(99, Math.max(1, Math.round((event.loaded / totalBytes) * 100)))
          : 0,
      });
    };

    request.onload = () => {
      let body: unknown = null;
      try { body = JSON.parse(request.responseText || "null"); } catch { body = null; }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(parseErrorMessage(body, "Announcement attachment could not be uploaded.")));
        return;
      }
      onProgress?.({ loadedBytes: file.size, totalBytes: file.size, progressPercent: 100 });
      resolve(body as AnnouncementAttachmentResponse);
    };
    request.onerror = () => reject(new Error("Announcement attachment upload failed. Check your connection and try again."));
    request.onabort = () => reject(new Error("Announcement attachment upload was cancelled."));
    request.send(formData);
  });
}

export function removeAnnouncementAttachment(
  accessToken: string,
  announcementId: string,
  attachmentId: string,
): Promise<AnnouncementActionResponse> {
  return apiRequest<AnnouncementActionResponse>(
    `/announcements/${announcementId}/attachments/${attachmentId}`,
    { method: "DELETE", headers: authorizationHeaders(accessToken) },
  );
}

async function fetchAnnouncementAttachment(
  accessToken: string,
  announcementId: string,
  attachmentId: string,
  disposition: "inline" | "download",
): Promise<Response> {
  const response = await fetch(
    `${API_URL}/announcements/${announcementId}/attachments/${attachmentId}?disposition=${disposition}`,
    {
      cache: "no-store",
      credentials: "include",
      headers: authorizationHeaders(accessToken),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseErrorMessage(body, "Announcement attachment could not be opened."));
  }
  return response;
}

export async function createAnnouncementAttachmentObjectUrl(
  accessToken: string,
  announcementId: string,
  attachmentId: string,
): Promise<string> {
  const response = await fetchAnnouncementAttachment(accessToken, announcementId, attachmentId, "inline");
  return URL.createObjectURL(await response.blob());
}

export async function downloadAnnouncementAttachment(
  accessToken: string,
  announcementId: string,
  attachmentId: string,
  fileName: string,
): Promise<void> {
  const response = await fetchAnnouncementAttachment(accessToken, announcementId, attachmentId, "download");
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
