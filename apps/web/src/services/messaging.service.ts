import { apiRequest } from "../lib/api";

import type {
  AcceptMessageRequestResponse,
  ConversationListResponse,
  CreatePrivateConversationResponse,
  DeleteMessageForMeResponse,
  DeleteMessageResponse,
  MarkConversationReadResponse,
  MessageRequestActionResponse,
  MessageRequestListResponse,
  MessageListResponse,
  MessagingContactsResponse,
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
