import { apiRequest } from "../lib/api";

import type {
  AcceptMessageRequestResponse,
  AddGroupMembersResponse,
  ConversationListView,
  ConversationListResponse,
  ConversationMuteSetting,
  ConversationPreferenceResponse,
  ConversationMessageSearchResponse,
  CreatePrivateConversationResponse,
  DeleteMessageForMeResponse,
  DeleteMessageResponse,
  ForwardMessagesResponse,
  GlobalMessagingSearchResponse,
  GroupConversationResponse,
  LeaveGroupResponse,
  MarkConversationReadResponse,
  MessageRequestActionResponse,
  MessageRequestListResponse,
  MessagingNotificationListResponse,
  MessagingPrivacySettingsResponse,
  MessagingBlockedAccountsResponse,
  MessagingBlockAccountResponse,
  MessagingUnblockAccountResponse,
  MessagingUserProfileResponse,
  MessagingAnalyticsResponse,
  MessagingSearchFilters,
  MessageInformationResponse,
  MessageListResponse,
  MessagePersonalStateResponse,
  MessageReactionResponse,
  PinnedMessagesResponse,
  StarredMessagesResponse,
  MessagingContactsResponse,
  OfficialGroupAuditResponse,
  OfficialGroupScopesResponse,
  OfficialGroupScopeType,
  ReconcileOfficialGroupsResponse,
  RemoveGroupMemberResponse,
  SendAttachmentMessageResponse,
  SendLocationMessageResponse,
  SendTextMessageResponse,
  UpdateLiveLocationMessageResponse,
  UpdateTextMessageResponse,
} from "../types/messaging";

function authorizationHeaders(
  accessToken: string,
): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

const MESSAGING_API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:4000/api/v1";

function messagingApiUrl(path: string): string {
  return `${MESSAGING_API_BASE_URL}${path}`;
}


export function getMyMessagingProfile(
  accessToken: string,
): Promise<MessagingUserProfileResponse> {
  return apiRequest<MessagingUserProfileResponse>(
    "/conversations/profiles/me",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function getMessagingProfile(
  accessToken: string,
  accountId: string,
): Promise<MessagingUserProfileResponse> {
  return apiRequest<MessagingUserProfileResponse>(
    `/conversations/profiles/${accountId}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function updateMyMessagingProfile(
  accessToken: string,
  bio: string,
): Promise<MessagingUserProfileResponse> {
  return apiRequest<MessagingUserProfileResponse>(
    "/conversations/profiles/me",
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        bio,
      }),
    },
  );
}

export async function updateMyMessagingProfilePhoto(
  accessToken: string,
  file: File,
): Promise<MessagingUserProfileResponse> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(
    messagingApiUrl("/conversations/profiles/me/photo"),
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: formData,
    },
  );

  const body = await response.json().catch(() => null) as
    | MessagingUserProfileResponse
    | { message?: unknown }
    | null;

  if (!response.ok) {
    throw new Error(
      body && typeof (body as { message?: unknown } | null)?.message === "string"
        ? String((body as { message?: unknown }).message)
        : "Profile photo could not be uploaded.",
    );
  }

  if (!body || !("data" in body)) {
    throw new Error("Profile photo upload returned an invalid response.");
  }

  return body as MessagingUserProfileResponse;
}

export function deleteMyMessagingProfilePhoto(
  accessToken: string,
): Promise<MessagingUserProfileResponse> {
  return apiRequest<MessagingUserProfileResponse>(
    "/conversations/profiles/me/photo",
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export async function createMessagingProfilePhotoObjectUrl(
  accessToken: string,
  accountId: string,
): Promise<string> {
  const response = await fetch(
    messagingApiUrl(`/conversations/profiles/${accountId}/photo`),
    {
      cache: "no-store",
      credentials: "include",
      headers: authorizationHeaders(accessToken),
    },
  );

  if (!response.ok) {
    throw new Error("Profile photo could not be loaded.");
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function createDirectoryProfilePhotoObjectUrl(
  accessToken: string,
  employeeId: string,
): Promise<string> {
  const response = await fetch(
    messagingApiUrl(`/conversations/profiles/employees/${employeeId}/photo`),
    {
      cache: "no-store",
      credentials: "include",
      headers: authorizationHeaders(accessToken),
    },
  );

  if (!response.ok) {
    throw new Error("Directory profile photo could not be loaded.");
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function getMessagingPrivacySettings(
  accessToken: string,
): Promise<MessagingPrivacySettingsResponse> {
  return apiRequest<MessagingPrivacySettingsResponse>(
    "/conversations/settings",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function updateMessagingPrivacySettings(
  accessToken: string,
  settings: {
    showOnlineStatus?: boolean;
    showReadReceipts?: boolean;
  },
): Promise<MessagingPrivacySettingsResponse> {
  return apiRequest<MessagingPrivacySettingsResponse>(
    "/conversations/settings",
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(settings),
    },
  );
}

export function listBlockedMessagingAccounts(
  accessToken: string,
): Promise<MessagingBlockedAccountsResponse> {
  return apiRequest<MessagingBlockedAccountsResponse>(
    "/conversations/blocks",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function blockMessagingAccount(
  accessToken: string,
  accountId: string,
): Promise<MessagingBlockAccountResponse> {
  return apiRequest<MessagingBlockAccountResponse>(
    `/conversations/blocks/${accountId}`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function unblockMessagingAccount(
  accessToken: string,
  accountId: string,
): Promise<MessagingUnblockAccountResponse> {
  return apiRequest<MessagingUnblockAccountResponse>(
    `/conversations/blocks/${accountId}`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function searchMessagingContacts(
  accessToken: string,
  search = "",
  limit = 20,
): Promise<MessagingContactsResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (search.trim()) {
    params.set("search", search.trim());
  }

  return apiRequest<MessagingContactsResponse>(
    `/conversations/contacts?${params.toString()}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function listMessagingConversations(
  accessToken: string,
  cursor?: string,
  limit = 50,
  view: ConversationListView = "ACTIVE",
): Promise<ConversationListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  if (view !== "ACTIVE") {
    params.set("view", view);
  }

  return apiRequest<ConversationListResponse>(
    `/conversations?${params.toString()}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function updateConversationPreference(
  accessToken: string,
  conversationId: string,
  input: {
    isPinned?: boolean;
    isArchived?: boolean;
    markUnread?: boolean;
    mute?: ConversationMuteSetting;
    draftText?: string | null;
  },
): Promise<ConversationPreferenceResponse> {
  return apiRequest<ConversationPreferenceResponse>(
    `/conversations/${conversationId}/preferences`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function listOfficialGroupScopes(
  accessToken: string,
): Promise<OfficialGroupScopesResponse> {
  return apiRequest<OfficialGroupScopesResponse>(
    "/conversations/official-groups/scopes",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function createOfficialGroupConversation(
  accessToken: string,
  input: {
    title: string;
    description: string;
    scopeType: OfficialGroupScopeType;
    divisionId?: string;
    departmentId?: string;
  },
): Promise<GroupConversationResponse> {
  return apiRequest<GroupConversationResponse>(
    "/conversations/official-groups",
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
}

export function reconcileOfficialGroups(
  accessToken: string,
): Promise<ReconcileOfficialGroupsResponse> {
  return apiRequest<ReconcileOfficialGroupsResponse>(
    "/conversations/official-groups/reconcile",
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function listOfficialGroupAudit(
  accessToken: string,
  conversationId: string,
  limit = 30,
): Promise<OfficialGroupAuditResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  return apiRequest<OfficialGroupAuditResponse>(
    `/conversations/${conversationId}/group/audit?${params.toString()}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function createGroupConversation(
  accessToken: string,
  title: string,
  description: string,
  memberAccountIds: string[],
): Promise<GroupConversationResponse> {
  return apiRequest<GroupConversationResponse>(
    "/conversations/groups",
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        title,
        description,
        memberAccountIds,
      }),
    },
  );
}

export function updateGroupConversation(
  accessToken: string,
  conversationId: string,
  input: {
    title?: string;
    description?: string;
  },
): Promise<GroupConversationResponse> {
  return apiRequest<GroupConversationResponse>(
    `/conversations/${conversationId}/group`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(input),
    },
  );
}


export async function updateGroupPhoto(
  accessToken: string,
  conversationId: string,
  file: File,
): Promise<GroupConversationResponse> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch(
    messagingApiUrl(`/conversations/${conversationId}/group/photo`),
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: formData,
    },
  );

  const body = await response.json().catch(() => null) as
    | GroupConversationResponse
    | { message?: unknown }
    | null;

  if (!response.ok) {
    throw new Error(
      body && typeof (body as { message?: unknown } | null)?.message === "string"
        ? String((body as { message?: unknown }).message)
        : "Group photo could not be uploaded.",
    );
  }

  if (!body || !("data" in body)) {
    throw new Error("Group photo upload returned an invalid response.");
  }

  return body as GroupConversationResponse;
}

export function deleteGroupPhoto(
  accessToken: string,
  conversationId: string,
): Promise<GroupConversationResponse> {
  return apiRequest<GroupConversationResponse>(
    `/conversations/${conversationId}/group/photo`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export async function createGroupPhotoObjectUrl(
  accessToken: string,
  conversationId: string,
): Promise<string> {
  const response = await fetch(
    messagingApiUrl(`/conversations/${conversationId}/group/photo`),
    {
      cache: "no-store",
      credentials: "include",
      headers: authorizationHeaders(accessToken),
    },
  );

  if (!response.ok) {
    throw new Error("Group photo could not be loaded.");
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function addGroupMembers(
  accessToken: string,
  conversationId: string,
  memberAccountIds: string[],
): Promise<AddGroupMembersResponse> {
  return apiRequest<AddGroupMembersResponse>(
    `/conversations/${conversationId}/group/members`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        memberAccountIds,
      }),
    },
  );
}

export function updateGroupMemberRole(
  accessToken: string,
  conversationId: string,
  accountId: string,
  role: "ADMIN" | "MEMBER",
): Promise<GroupConversationResponse> {
  return apiRequest<GroupConversationResponse>(
    `/conversations/${conversationId}/group/members/${accountId}/role`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        role,
      }),
    },
  );
}

export function removeGroupMember(
  accessToken: string,
  conversationId: string,
  accountId: string,
): Promise<RemoveGroupMemberResponse> {
  return apiRequest<RemoveGroupMemberResponse>(
    `/conversations/${conversationId}/group/members/${accountId}`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function leaveGroupConversation(
  accessToken: string,
  conversationId: string,
): Promise<LeaveGroupResponse> {
  return apiRequest<LeaveGroupResponse>(
    `/conversations/${conversationId}/group/leave`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function createPrivateConversation(
  accessToken: string,
  participantAccountId: string,
): Promise<CreatePrivateConversationResponse> {
  return apiRequest<CreatePrivateConversationResponse>(
    "/conversations/private",
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        participantAccountId,
      }),
    },
  );
}

export function listMessageRequests(
  accessToken: string,
): Promise<MessageRequestListResponse> {
  return apiRequest<MessageRequestListResponse>(
    "/conversations/requests",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function getMessagingAnalytics(
  accessToken: string,
): Promise<MessagingAnalyticsResponse> {
  return apiRequest<MessagingAnalyticsResponse>(
    "/conversations/analytics",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function listMessagingNotifications(
  accessToken: string,
): Promise<MessagingNotificationListResponse> {
  return apiRequest<MessagingNotificationListResponse>(
    "/conversations/notifications",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function markAllMessagingNotificationsRead(
  accessToken: string,
): Promise<MessagingNotificationListResponse> {
  return apiRequest<MessagingNotificationListResponse>(
    "/conversations/notifications/read",
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function markMessagingNotificationRead(
  accessToken: string,
  notificationId: string,
): Promise<MessagingNotificationListResponse> {
  return apiRequest<MessagingNotificationListResponse>(
    `/conversations/notifications/${notificationId}/read`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function deleteMessagingNotification(
  accessToken: string,
  notificationId: string,
): Promise<MessagingNotificationListResponse> {
  return apiRequest<MessagingNotificationListResponse>(
    `/conversations/notifications/${notificationId}`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function deleteReadMessagingNotifications(
  accessToken: string,
): Promise<MessagingNotificationListResponse> {
  return apiRequest<MessagingNotificationListResponse>(
    "/conversations/notifications/read",
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function acceptMessageRequest(
  accessToken: string,
  requestId: string,
): Promise<AcceptMessageRequestResponse> {
  return apiRequest<AcceptMessageRequestResponse>(
    `/conversations/requests/${requestId}/accept`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function declineMessageRequest(
  accessToken: string,
  requestId: string,
): Promise<MessageRequestActionResponse> {
  return apiRequest<MessageRequestActionResponse>(
    `/conversations/requests/${requestId}/decline`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function blockMessageRequest(
  accessToken: string,
  requestId: string,
): Promise<MessageRequestActionResponse> {
  return apiRequest<MessageRequestActionResponse>(
    `/conversations/requests/${requestId}/block`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
    },
  );
}


function messagingSearchParams(
  filters: MessagingSearchFilters,
): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(filters.limit ?? 25),
  });

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.senderAccountId) {
    params.set("senderAccountId", filters.senderAccountId);
  }

  if (filters.contentType) {
    params.set("contentType", filters.contentType);
  }

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  return params;
}

export function searchConversationMessages(
  accessToken: string,
  conversationId: string,
  filters: MessagingSearchFilters,
): Promise<ConversationMessageSearchResponse> {
  const params = messagingSearchParams(filters);

  return apiRequest<ConversationMessageSearchResponse>(
    `/conversations/${conversationId}/messages/search?${params.toString()}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function searchMessaging(
  accessToken: string,
  filters: MessagingSearchFilters,
): Promise<GlobalMessagingSearchResponse> {
  const params = messagingSearchParams(filters);

  return apiRequest<GlobalMessagingSearchResponse>(
    `/conversations/search?${params.toString()}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function listConversationMessages(
  accessToken: string,
  conversationId: string,
  cursor?: string,
  limit = 50,
): Promise<MessageListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return apiRequest<MessageListResponse>(
    `/conversations/${conversationId}/messages?${params.toString()}`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function listStarredMessages(
  accessToken: string,
): Promise<StarredMessagesResponse> {
  return apiRequest<StarredMessagesResponse>(
    "/conversations/starred/messages",
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function listConversationPinnedMessages(
  accessToken: string,
  conversationId: string,
): Promise<PinnedMessagesResponse> {
  return apiRequest<PinnedMessagesResponse>(
    `/conversations/${conversationId}/pinned-messages`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function sendConversationTextMessage(
  accessToken: string,
  conversationId: string,
  text: string,
  replyToMessageId?: string,
  mentionedAccountIds: string[] = [],
): Promise<SendTextMessageResponse> {
  return apiRequest<SendTextMessageResponse>(
    `/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        clientMessageId: crypto.randomUUID(),
        text,
        ...(replyToMessageId
          ? {
              replyToMessageId,
            }
          : {}),
        ...(mentionedAccountIds.length > 0
          ? {
              mentionedAccountIds,
            }
          : {}),
      }),
    },
  );
}

export function sendConversationLocationMessage(
  accessToken: string,
  conversationId: string,
  location: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    headingDegrees?: number;
    speedMetersPerSecond?: number;
    label?: string;
    live?: boolean;
    liveDurationMinutes?: 15 | 60 | 480;
  },
): Promise<SendLocationMessageResponse> {
  return apiRequest<SendLocationMessageResponse>(
    `/conversations/${conversationId}/location`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        clientMessageId: crypto.randomUUID(),
        ...location,
      }),
    },
  );
}

export function updateConversationLiveLocationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
  location: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    headingDegrees?: number;
    speedMetersPerSecond?: number;
  },
): Promise<UpdateLiveLocationMessageResponse> {
  return apiRequest<UpdateLiveLocationMessageResponse>(
    `/conversations/${conversationId}/messages/${messageId}/live-location`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify(location),
    },
  );
}

export function stopConversationLiveLocationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<UpdateLiveLocationMessageResponse> {
  return apiRequest<UpdateLiveLocationMessageResponse>(
    `/conversations/${conversationId}/messages/${messageId}/live-location/stop`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export async function sendConversationAttachmentMessage(
  accessToken: string,
  conversationId: string,
  file: File,
  caption?: string,
  replyToMessageId?: string,
  attachmentKind?: 'VOICE_NOTE',
): Promise<SendAttachmentMessageResponse> {
  const formData = new FormData();

  formData.set("clientMessageId", crypto.randomUUID());
  formData.set("file", file);

  if (caption?.trim()) {
    formData.set("caption", caption.trim());
  }

  if (replyToMessageId) {
    formData.set("replyToMessageId", replyToMessageId);
  }

  if (attachmentKind) {
    // Voice-note uploads are still protected attachments, but the backend stores their UI kind.
    formData.set("attachmentKind", attachmentKind);
  }

  const response = await fetch(
    messagingApiUrl(`/conversations/${conversationId}/attachments`),
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: formData,
    },
  );

  const body = await response.json().catch(() => null) as
    | SendAttachmentMessageResponse
    | { message?: unknown }
    | null;

  if (!response.ok) {
    throw new Error(
      body && typeof (body as { message?: unknown } | null)?.message === "string"
        ? String((body as { message?: unknown }).message)
        : "Attachment could not be uploaded.",
    );
  }

  if (!body || !("data" in body)) {
    throw new Error("Attachment upload returned an invalid response.");
  }

  return body as SendAttachmentMessageResponse;
}

async function fetchAttachmentBlobWithXhrFallback(
  url: string,
  accessToken: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("GET", url);
    request.responseType = "blob";
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`);

    request.onload = () => {
      if (request.status >= 200 && request.status < 300 && request.response) {
        resolve(request.response);
        return;
      }

      reject(new Error(`Attachment could not be downloaded. HTTP ${request.status}`));
    };

    request.onerror = () => {
      reject(new Error("Attachment could not be downloaded. Check the API server and CORS configuration."));
    };

    request.send();
  });
}

async function fetchConversationAttachmentBlob(
  accessToken: string,
  conversationId: string,
  messageId: string,
  attachmentId: string,
): Promise<Blob> {
  const url = messagingApiUrl(
    `/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}/download`,
  );

  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      headers: authorizationHeaders(accessToken),
    });

    if (!response.ok) {
      let message = "Attachment could not be downloaded.";

      try {
        const errorBody = await response.json() as { message?: unknown };

        if (typeof errorBody.message === "string") {
          message = errorBody.message;
        }
      } catch {
        // Binary responses and empty error bodies are both possible.
      }

      throw new Error(message);
    }

    return response.blob();
  } catch (error) {
    if (error instanceof TypeError) {
      return fetchAttachmentBlobWithXhrFallback(url, accessToken);
    }

    throw error;
  }
}

export async function createConversationAttachmentObjectUrl(
  accessToken: string,
  conversationId: string,
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const blob = await fetchConversationAttachmentBlob(
    accessToken,
    conversationId,
    messageId,
    attachmentId,
  );

  return URL.createObjectURL(blob);
}

export async function downloadConversationAttachment(
  accessToken: string,
  conversationId: string,
  messageId: string,
  attachmentId: string,
  fileName: string,
): Promise<void> {
  const objectUrl = await createConversationAttachmentObjectUrl(
    accessToken,
    conversationId,
    messageId,
    attachmentId,
  );

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function forwardConversationMessage(
  accessToken: string,
  sourceConversationId: string,
  messageId: string,
  destinationConversationIds: string[],
  clientForwardId: string,
): Promise<ForwardMessagesResponse> {
  // This endpoint forwards text and stored attachments without re-uploading media.
  return apiRequest<ForwardMessagesResponse>(
    `/conversations/${sourceConversationId}/messages/${messageId}/forward`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        clientForwardId,
        destinationConversationIds,
      }),
    },
  );
}

export function editConversationTextMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
  text: string,
): Promise<UpdateTextMessageResponse> {
  return apiRequest<UpdateTextMessageResponse>(
    `/conversations/${conversationId}/messages/${messageId}`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        text,
      }),
    },
  );
}

export function deleteConversationMessageForMe(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<DeleteMessageForMeResponse> {
  return apiRequest<DeleteMessageForMeResponse>(
    `/conversations/${conversationId}/messages/${messageId}/me`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function deleteConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<DeleteMessageResponse> {
  return apiRequest<DeleteMessageResponse>(
    `/conversations/${conversationId}/messages/${messageId}`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function markConversationRead(
  accessToken: string,
  conversationId: string,
): Promise<MarkConversationReadResponse> {
  return apiRequest<MarkConversationReadResponse>(
    `/conversations/${conversationId}/read`,
    {
      method: "PATCH",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function getConversationMessageInformation(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<MessageInformationResponse> {
  return apiRequest<MessageInformationResponse>(
    `/conversations/${conversationId}/messages/${messageId}/info`,
    {
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function starConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<MessagePersonalStateResponse> {
  return apiRequest<MessagePersonalStateResponse>(
    `/conversations/${conversationId}/messages/${messageId}/star`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function unstarConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<MessagePersonalStateResponse> {
  return apiRequest<MessagePersonalStateResponse>(
    `/conversations/${conversationId}/messages/${messageId}/star`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function pinConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<MessagePersonalStateResponse> {
  return apiRequest<MessagePersonalStateResponse>(
    `/conversations/${conversationId}/messages/${messageId}/pin`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function unpinConversationMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<MessagePersonalStateResponse> {
  return apiRequest<MessagePersonalStateResponse>(
    `/conversations/${conversationId}/messages/${messageId}/pin`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}

export function reactToMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
  reaction: string,
): Promise<MessageReactionResponse> {
  return apiRequest<MessageReactionResponse>(
    `/conversations/${conversationId}/messages/${messageId}/reactions`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        reaction,
      }),
    },
  );
}

export function removeMessageReaction(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<MessageReactionResponse> {
  return apiRequest<MessageReactionResponse>(
    `/conversations/${conversationId}/messages/${messageId}/reactions`,
    {
      method: "DELETE",
      headers: authorizationHeaders(accessToken),
    },
  );
}
