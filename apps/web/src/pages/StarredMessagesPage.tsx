import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router";

import { useAuth } from "../context/AuthContext";
import { listStarredMessages } from "../services/messaging.service";
import type { StarredMessageItem } from "../types/messaging";

const SELECTED_CONVERSATION_STORAGE_KEY = "nt-message:selected-conversation";
const HIGHLIGHT_MESSAGE_STORAGE_KEY = "nt-message:highlight-message";

function formatStarredTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function starredMessagePreview(item: StarredMessageItem): string {
  const message = item.message;

  if (message.isDeleted) {
    return "This message was deleted.";
  }

  if (message.textContent?.trim()) {
    return message.textContent.trim();
  }

  if (message.contentType === "LOCATION") {
    return message.payload && typeof message.payload === "object"
      ? "Location message"
      : "Shared location";
  }

  if ((message.attachments?.length ?? 0) > 0) {
    return message.attachments[0]?.originalFileName ?? "Attachment message";
  }

  return "Message";
}

export function StarredMessagesPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [items, setItems] = useState<StarredMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const token = accessToken;

    async function loadStarredMessages(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await listStarredMessages(token);

        if (!cancelled) {
          setItems(response.data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Starred messages could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStarredMessages();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const groupedItems = useMemo(() => items, [items]);

  function openOriginalMessage(item: StarredMessageItem): void {
    try {
      // MessageAppPage reads these keys to reopen and highlight the source message.
      window.sessionStorage.setItem(
        SELECTED_CONVERSATION_STORAGE_KEY,
        item.conversation.id,
      );
      window.sessionStorage.setItem(
        HIGHLIGHT_MESSAGE_STORAGE_KEY,
        item.message.id,
      );
    } catch {
      // Navigation still works if storage is unavailable.
    }

    navigate("/messages");
  }

  return (
    <main className="message-starred-page">
      <header className="message-starred-header">
        <button type="button" onClick={() => navigate("/messages")}>← Back</button>
        <div>
          <span>M1 Starred Messages</span>
          <h1>Starred messages</h1>
          <p>Messages you personally marked as important.</p>
        </div>
      </header>

      {loading ? (
        <section className="message-starred-state">
          <span className="message-small-spinner" />
          <p>Loading starred messages...</p>
        </section>
      ) : error ? (
        <section className="message-starred-state danger">
          <h2>Could not load starred messages</h2>
          <p>{error}</p>
        </section>
      ) : groupedItems.length === 0 ? (
        <section className="message-starred-state">
          <h2>No starred messages yet</h2>
          <p>Use the Star action from any message to save it here.</p>
        </section>
      ) : (
        <section className="message-starred-list" aria-label="Starred messages">
          {groupedItems.map((item) => (
            <article key={`${item.message.id}:${item.starredAt}`}>
              <div>
                <strong>{item.conversation.title ?? "Conversation"}</strong>
                <span>{formatStarredTime(item.starredAt)}</span>
              </div>

              <p>{starredMessagePreview(item)}</p>

              <button
                type="button"
                onClick={() => openOriginalMessage(item)}
              >
                Open original
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
