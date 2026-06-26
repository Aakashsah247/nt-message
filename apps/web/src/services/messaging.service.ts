import { apiRequest } from "../lib/api";

import type {
  ConversationListResponse,
  CreatePrivateConversationResponse,
  MarkConversationReadResponse,
  MessageListResponse,
  MessagingContactsResponse,
  SendTextMessageResponse,
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
): Promise<SendTextMessageResponse> {
  return apiRequest<SendTextMessageResponse>(
    `/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        clientMessageId: crypto.randomUUID(),
        text,
      }),
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
