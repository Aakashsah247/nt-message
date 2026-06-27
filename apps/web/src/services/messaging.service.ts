import { apiRequest } from "../lib/api";

import type {
  AcceptMessageRequestResponse,
  AddGroupMembersResponse,
  ConversationListResponse,
  CreatePrivateConversationResponse,
  DeleteMessageForMeResponse,
  DeleteMessageResponse,
  ForwardTextMessagesResponse,
  GroupConversationResponse,
  LeaveGroupResponse,
  MarkConversationReadResponse,
  MessageRequestActionResponse,
  MessageRequestListResponse,
  MessageListResponse,
  MessagingContactsResponse,
  RemoveGroupMemberResponse,
  SendTextMessageResponse,
  UpdateTextMessageResponse,
} from "../types/messaging";

function authorizationHeaders(
  accessToken: string,
): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
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
): Promise<ConversationListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return apiRequest<ConversationListResponse>(
    `/conversations?${params.toString()}`,
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

export function sendConversationTextMessage(
  accessToken: string,
  conversationId: string,
  text: string,
  replyToMessageId?: string,
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
      }),
    },
  );
}

export function forwardConversationTextMessage(
  accessToken: string,
  sourceConversationId: string,
  messageId: string,
  destinationConversationIds: string[],
  clientForwardId: string,
): Promise<ForwardTextMessagesResponse> {
  return apiRequest<ForwardTextMessagesResponse>(
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
