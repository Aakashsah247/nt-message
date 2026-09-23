import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentTime } from "../utils/use-current-time";
import {
  createConversationAttachmentObjectUrl,
  createConversationAttachmentStreamUrl,
} from "../services/messaging.service";
import { formatMessagingConversationTime as formatConversationTime } from "../utils/messaging-date-time";
import type { MessagingMessage } from "../types/messaging";
import {
  MESSAGE_TEXT_LINK_PATTERN,
  attachmentTypeTranslationKey,
  attachmentVisualKind,
  canPreviewAttachment,
  escapeRegExp,
  formatFileSize,
  formatLocationCoordinate,
  formatLocationUpdatedAt,
  formatRecordingDuration,
  getMessageLocationPayload,
  getMessageMentions,
  initials,
  isAudioAttachment,
  isImageAttachment,
  isLiveLocationActive,
  isPdfAttachment,
  isVideoAttachment,
  normalizeMessageLink,
} from "./message-app-foundation";
import type {
  AttachmentGlyphName,
  LocationMessageCardProps,
  MessageAttachmentCardProps,
  MessageNavigationIconName,
  MessageStatusGlyphName,
  SharedMediaThumbnailProps,
} from "./message-app-foundation";

export function AttachmentGlyph({ name }: { name: AttachmentGlyphName }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "image":
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="8.5" cy="9" r="1.6" />
          <path d="m5 17 4.5-4.5 3.2 3.2 2-2L19 18" />
        </svg>
      );
    case "video":
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="14" height="14" rx="3" />
          <path d="m10 9 4 3-4 3Z" />
          <path d="m17 10 4-2v8l-4-2" />
        </svg>
      );
    case "audio":
      return (
        <svg {...commonProps}>
          <path d="M9 18V6l8-2v12" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="14" cy="16" r="3" />
        </svg>
      );
    case "location":
      return (
        <svg {...commonProps}>
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case "microphone":
      return (
        <svg {...commonProps}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...commonProps}>
          <path d="M6 3h8l4 4v14H6Z" />
          <path d="M14 3v5h5" />
          <path d="M8.5 15h7M8.5 18h5" />
        </svg>
      );
    case "document":
      return (
        <svg {...commonProps}>
          <path d="M6 3h8l4 4v14H6Z" />
          <path d="M14 3v5h5M9 12h6M9 16h6" />
        </svg>
      );
    case "copy":
      return (
        <svg {...commonProps}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      );
    case "download":
      return (
        <svg {...commonProps}>
          <path d="M12 3v12" />
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...commonProps}>
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
          <path d="m13.5 8.5 3 3" />
        </svg>
      );
    case "forward":
      return (
        <svg {...commonProps}>
          <path d="m14 5 6 7-6 7v-4H9c-3.3 0-5.7 1.1-7 3 1-5.4 4-8 9-8h3V5Z" />
        </svg>
      );
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </svg>
      );
    case "pause":
      return (
        <svg {...commonProps}>
          <path d="M9 7v10M15 7v10" />
        </svg>
      );
    case "pin":
      return (
        <svg {...commonProps}>
          <path d="m9 3 6 0-.8 5 3 3H6.8l3-3L9 3Z" />
          <path d="M12 11v10" />
        </svg>
      );
    case "retry":
      return (
        <svg {...commonProps}>
          <path d="M20 7v5h-5" />
          <path d="M18.2 16a8 8 0 1 1 .7-8.5L20 12" />
        </svg>
      );
    case "star":
      return (
        <svg {...commonProps}>
          <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
        </svg>
      );
    case "trash":
      return (
        <svg {...commonProps}>
          <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
        </svg>
      );
    case "play":
    default:
      return (
        <svg {...commonProps}>
          <path d="m9 7 8 5-8 5Z" />
        </svg>
      );
  }
}

export function CompactAttachmentAudio({
  src,
  voiceNote,
  senderDisplayName,
  senderPhotoUrl,
  onMediaLayoutReady,
}: {
  src: string;
  voiceNote: boolean;
  senderDisplayName?: string;
  senderPhotoUrl?: string | null;
  onMediaLayoutReady?: () => void;
}) {
  const { t } = useTranslation("messaging");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const waveformBars = voiceNote ? 34 : 24;
  const progressRatio = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) {
        return;
      }

      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    });

    return () => {
      active = false;
    };
  }, [src]);

  function togglePlayback() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
      return;
    }

    audio.pause();
  }

  function handleSeek(nextTime: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div
      className={`message-audio-player-v3${voiceNote ? " voice-note" : " audio-file"}`}
    >
      <span className="message-audio-avatar-v3" aria-hidden="true">
        <span className="message-audio-avatar-visual-v3">
          {voiceNote && senderPhotoUrl ? (
            <img src={senderPhotoUrl} alt="" />
          ) : voiceNote ? (
            <span>
              {initials(senderDisplayName ?? t("attachment.voiceMessage"))}
            </span>
          ) : (
            <AttachmentGlyph name="audio" />
          )}
        </span>
        {voiceNote && (
          <span className="message-audio-microphone-v3">
            <AttachmentGlyph name="microphone" />
          </span>
        )}
      </span>

      <button
        type="button"
        className="message-audio-play-v3"
        onClick={togglePlayback}
        aria-label={
          playing ? t("attachment.pauseAudio") : t("attachment.playAudio")
        }
      >
        <AttachmentGlyph name={playing ? "pause" : "play"} />
      </button>

      <div className="message-audio-content-v3">
        <div className="message-audio-waveform-v3" aria-hidden="true">
          {Array.from({ length: waveformBars }, (_, index) => (
            <i
              key={index}
              className={
                (index + 1) / waveformBars <= progressRatio ? "is-played" : ""
              }
            />
          ))}
        </div>

        <input
          className="message-audio-seek-v3"
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={0.1}
          value={Math.min(currentTime, Math.max(duration, 1))}
          onChange={(event) => handleSeek(Number(event.target.value))}
          aria-label={t("attachment.audioPlaybackPosition")}
        />

        <div className="message-audio-meta-v3">
          <span>
            {formatRecordingDuration(currentTime > 0 ? currentTime : duration)}
          </span>
          <span>
            {voiceNote ? t("attachment.voiceMessage") : t("attachment.audio")}
          </span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          );
          onMediaLayoutReady?.();
        }}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />
    </div>
  );
}

export function MessageAttachmentCard({
  accessToken,
  conversationId,
  messageId,
  attachment,
  isVoiceNote,
  senderDisplayName,
  senderPhotoUrl,
  onPreview,
  onMediaLayoutReady,
}: MessageAttachmentCardProps) {
  const { t } = useTranslation("messaging");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRequestVersion, setPreviewRequestVersion] = useState(0);
  const [previewEligible, setPreviewEligible] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const visualKind = attachmentVisualKind(attachment);
  const canPreview = canPreviewAttachment(attachment);
  const mediaPreview =
    isImageAttachment(attachment) || isVideoAttachment(attachment);
  const audioPreview = isAudioAttachment(attachment);
  const needsProtectedPreview =
    !attachment.isExpired && (mediaPreview || audioPreview);

  useEffect(() => {
    let active = true;

    if (!needsProtectedPreview) {
      queueMicrotask(() => {
        if (active) {
          setPreviewEligible(false);
        }
      });

      return () => {
        active = false;
      };
    }

    const element = cardRef.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => {
        if (active) {
          setPreviewEligible(true);
        }
      });

      return () => {
        active = false;
      };
    }

    queueMicrotask(() => {
      if (active) {
        setPreviewEligible(false);
      }
    });
    const scrollRoot = element.closest<HTMLElement>(".message-thread");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        // Attachment binaries are private API resources. Delay fetching them
        // until the card is close to the viewport so opening a conversation
        // does not start dozens of image/video/audio requests at once.
        setPreviewEligible(true);
        observer.disconnect();
      },
      {
        root: scrollRoot,
        rootMargin: "480px 0px",
      },
    );

    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [attachment.id, needsProtectedPreview]);

  const attachmentPreviewUsesStream =
    isVideoAttachment(attachment) || isAudioAttachment(attachment);

  useEffect(() => {
    if (!accessToken || !needsProtectedPreview || !previewEligible) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    queueMicrotask(() => {
      if (!cancelled) {
        setPreviewUrl(null);
        setPreviewError(null);
      }
    });

    // Images keep the authenticated Blob preview. Video/audio use a short-lived
    // protected URL so the browser can request only the byte ranges it needs.
    const previewRequest = attachmentPreviewUsesStream
      ? createConversationAttachmentStreamUrl(
          accessToken,
          conversationId,
          messageId,
          attachment.id,
        )
      : createConversationAttachmentObjectUrl(
          accessToken,
          conversationId,
          messageId,
          attachment.id,
        );

    void previewRequest
      .then((url) => {
        if (cancelled) {
          if (url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }
          return;
        }

        objectUrl = url;
        setPreviewUrl(url);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setPreviewError(
          error instanceof Error
            ? error.message
            : t("attachment.previewLoadError"),
        );
      });

    return () => {
      cancelled = true;

      if (objectUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    accessToken,
    attachment.id,
    attachmentPreviewUsesStream,
    conversationId,
    messageId,
    needsProtectedPreview,
    previewEligible,
    previewRequestVersion,
    t,
  ]);

  const displayName = isVoiceNote
    ? t("attachment.voiceNote")
    : attachment.originalFileName;
  const attachmentMeta = `${t(attachmentTypeTranslationKey(attachment))} · ${formatFileSize(
    attachment.fileSizeBytes,
  )}`;

  return (
    <article
      ref={cardRef}
      className={`message-attachment-card-v2 message-attachment-${visualKind}-v2${attachment.isExpired ? " is-expired" : ""}${
        previewError ? " has-preview-error" : ""
      }`}
      aria-label={`${displayName}, ${attachmentMeta}`}
    >
      {attachment.isExpired && (
        <div className="message-attachment-expired-v2" role="status">
          <span
            className="message-attachment-expired-icon-v2"
            aria-hidden="true"
          >
            <AttachmentGlyph name={visualKind} />
          </span>
          <span>
            <strong>{displayName}</strong>
            <small>{t("attachment.expired")}</small>
          </span>
        </div>
      )}

      {!attachment.isExpired && mediaPreview && (
        <div className="message-attachment-media-v2">
          {previewUrl ? (
            <button
              type="button"
              className="message-attachment-media-open-v2"
              onClick={() => onPreview(attachment)}
              aria-label={t("attachment.previewNamed", {
                name: attachment.originalFileName,
              })}
            >
              {isImageAttachment(attachment) ? (
                <img
                  src={previewUrl}
                  alt={attachment.originalFileName}
                  onLoad={onMediaLayoutReady}
                  onError={onMediaLayoutReady}
                />
              ) : (
                <video
                  src={previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={onMediaLayoutReady}
                  onError={onMediaLayoutReady}
                />
              )}
              {isVideoAttachment(attachment) && (
                <span className="message-attachment-media-overlay-v2">
                  <AttachmentGlyph name="play" />
                </span>
              )}
            </button>
          ) : previewError ? (
            <div className="message-attachment-preview-state-v2 error">
              <AttachmentGlyph name="retry" />
              <strong>{t("attachment.previewUnavailable")}</strong>
              <button
                type="button"
                onClick={() => setPreviewRequestVersion((value) => value + 1)}
              >
                {t("actions.tryAgain")}
              </button>
            </div>
          ) : (
            <div
              className={`message-attachment-preview-state-v2 loading ${visualKind}`}
              role="status"
              aria-live="polite"
            >
              <span className="message-attachment-loading-icon-v2">
                <AttachmentGlyph name={visualKind} />
              </span>
              <span className="message-small-spinner" />
              <strong>
                {t("attachment.loadingMedia", {
                  type: isVideoAttachment(attachment)
                    ? t("attachment.types.video").toLowerCase()
                    : t("attachment.types.image").toLowerCase(),
                })}
              </strong>
            </div>
          )}
        </div>
      )}

      {!attachment.isExpired &&
        audioPreview &&
        (previewUrl ? (
          <CompactAttachmentAudio
            src={previewUrl}
            voiceNote={isVoiceNote}
            senderDisplayName={senderDisplayName}
            senderPhotoUrl={senderPhotoUrl}
            onMediaLayoutReady={onMediaLayoutReady}
          />
        ) : previewError ? (
          <div className="message-attachment-preview-state-v2 error audio">
            <AttachmentGlyph name="audio" />
            <span>{t("attachment.audioUnavailable")}</span>
            <button
              type="button"
              onClick={() => setPreviewRequestVersion((value) => value + 1)}
            >
              {t("actions.retry")}
            </button>
          </div>
        ) : (
          <div
            className="message-audio-loading-v3"
            role="status"
            aria-live="polite"
          >
            <span className="message-audio-loading-icon-v3">
              <AttachmentGlyph name={isVoiceNote ? "microphone" : "audio"} />
            </span>
            <span className="message-small-spinner" />
            <span>
              {isVoiceNote
                ? t("attachment.loadingVoiceMessage")
                : t("attachment.loadingAudio")}
            </span>
          </div>
        ))}

      {!attachment.isExpired && !needsProtectedPreview && (
        <button
          type="button"
          className="message-attachment-document-v2"
          onClick={() => {
            if (canPreview) {
              onPreview(attachment);
            }
          }}
          disabled={!canPreview}
          aria-label={
            canPreview ? `Preview ${attachment.originalFileName}` : undefined
          }
        >
          <span className="message-attachment-document-icon-v2">
            <AttachmentGlyph
              name={isPdfAttachment(attachment) ? "pdf" : "document"}
            />
          </span>
          <span>
            <strong>{displayName}</strong>
            <small>{attachmentMeta}</small>
          </span>
        </button>
      )}
    </article>
  );
}

export function MessageTextWithMentions(
  message: MessagingMessage,
): ReactNode[] {
  const text = message.textContent ?? "";

  if (!text) {
    return [text];
  }

  const mentions = getMessageMentions(message);
  const tokens: Array<{
    start: number;
    end: number;
    node: ReactNode;
  }> = [];

  if (mentions.length > 0) {
    const mentionPattern = new RegExp(
      `@(${mentions
        .map((mention) => escapeRegExp(mention.displayName))
        .sort((first, second) => second.length - first.length)
        .join("|")})(?=\\s|$|[.,!?;:])`,
      "gi",
    );

    let mentionMatch: RegExpExecArray | null;

    while ((mentionMatch = mentionPattern.exec(text)) !== null) {
      const matchedText = mentionMatch[0];
      const displayName = matchedText.slice(1);
      const mention = mentions.find(
        (item) => item.displayName.toLowerCase() === displayName.toLowerCase(),
      );

      tokens.push({
        start: mentionMatch.index,
        end: mentionMatch.index + matchedText.length,
        node: (
          <span
            key={`${mention?.accountId ?? displayName}-${mentionMatch.index}`}
            className="message-mention-highlight"
          >
            {matchedText}
          </span>
        ),
      });
    }
  }

  const linkPattern = new RegExp(
    MESSAGE_TEXT_LINK_PATTERN.source,
    MESSAGE_TEXT_LINK_PATTERN.flags,
  );
  let linkMatch: RegExpExecArray | null;

  while ((linkMatch = linkPattern.exec(text)) !== null) {
    const displayUrl = linkMatch[0].replace(/[.,;:!?]+$/g, "");
    const normalizedUrl = normalizeMessageLink(displayUrl);

    if (!normalizedUrl) {
      continue;
    }

    const start = linkMatch.index;
    const end = start + displayUrl.length;

    tokens.push({
      start,
      end,
      node: (
        <a
          key={`link-${start}-${normalizedUrl}`}
          className="message-text-link"
          href={normalizedUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          {displayUrl}
        </a>
      ),
    });
  }

  if (tokens.length === 0) {
    return [text];
  }

  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  tokens
    .sort(
      (first, second) => first.start - second.start || second.end - first.end,
    )
    .forEach((token) => {
      // Avoid overlapping tokens when a mention and link are adjacent.
      if (token.start < lastIndex) {
        return;
      }

      if (token.start > lastIndex) {
        nodes.push(text.slice(lastIndex, token.start));
      }

      nodes.push(token.node);
      lastIndex = token.end;
    });

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function LocationMessageCard({
  message,
  viewerAccountId,
  stopping,
  onStop,
}: LocationMessageCardProps) {
  const { t } = useTranslation("messaging");
  const currentTime = useCurrentTime();
  const location = getMessageLocationPayload(message);

  if (!location) {
    return null;
  }

  const active = isLiveLocationActive(location, currentTime);
  const ownMessage = message.senderAccountId === viewerAccountId;
  const statusLabel =
    location.label ??
    (location.kind === "CURRENT"
      ? t("location.current")
      : location.liveStoppedAt
        ? t("location.stopped")
        : currentTime > 0 &&
            location.liveExpiresAt &&
            new Date(location.liveExpiresAt).getTime() <= currentTime
          ? t("location.expired")
          : t("location.active"));

  return (
    <article className={`message-location-card-v2${active ? " live" : ""}`}>
      <a
        className="message-location-map-v2"
        href={location.mapUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={t("location.openInMaps", { label: statusLabel })}
      >
        <span className="message-location-pin-v2">
          <AttachmentGlyph name="location" />
        </span>
        <span className="message-location-grid-v2" aria-hidden="true" />
      </a>

      <div className="message-location-body-v2">
        <div className="message-location-heading-v2">
          <span
            className={`message-location-status-v2${active ? " active" : ""}`}
          />
          <strong>{statusLabel}</strong>
        </div>
        <span className="message-location-coordinates-v2">
          {formatLocationCoordinate(location.latitude)},{" "}
          {formatLocationCoordinate(location.longitude)}
        </span>
        <small>
          {t("location.updated", {
            time:
              formatLocationUpdatedAt(location.updatedAt) === "just now"
                ? t("location.justNow")
                : formatLocationUpdatedAt(location.updatedAt),
          })}
          {location.accuracyMeters !== null
            ? ` · ±${Math.round(location.accuracyMeters)}m`
            : ""}
        </small>

        <div className="message-location-actions-v2">
          <a href={location.mapUrl} target="_blank" rel="noreferrer">
            {t("location.openMap")}
          </a>

          {ownMessage && active && (
            <button
              type="button"
              onClick={() => onStop(message)}
              disabled={stopping}
            >
              {stopping ? t("location.stopping") : t("location.stopSharing")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function SharedMediaThumbnail({
  accessToken,
  item,
  onOpen,
}: SharedMediaThumbnailProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    const trigger = triggerRef.current;

    if (!trigger || shouldLoad) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => {
        setShouldLoad(true);
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [shouldLoad]);

  const video = isVideoAttachment(item.attachment);

  useEffect(() => {
    if (!accessToken || !shouldLoad) {
      return;
    }

    let cancelled = false;
    let createdObjectUrl: string | null = null;

    queueMicrotask(() => {
      if (!cancelled) {
        setPreviewError(false);
      }
    });

    const previewRequest = video
      ? createConversationAttachmentStreamUrl(
          accessToken,
          item.conversationId,
          item.messageId,
          item.attachment.id,
        )
      : createConversationAttachmentObjectUrl(
          accessToken,
          item.conversationId,
          item.messageId,
          item.attachment.id,
        );

    void previewRequest
      .then((url) => {
        if (cancelled) {
          if (url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }
          return;
        }

        createdObjectUrl = url;
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(true);
        }
      });

    return () => {
      cancelled = true;

      if (createdObjectUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [
    accessToken,
    item.attachment.id,
    item.conversationId,
    item.messageId,
    shouldLoad,
    video,
  ]);

  return (
    <button
      ref={triggerRef}
      type="button"
      className="message-shared-media-tile"
      onClick={onOpen}
      aria-label={`Open ${item.attachment.originalFileName}`}
      title={item.attachment.originalFileName}
    >
      <span className="message-shared-media-preview">
        {objectUrl ? (
          isImageAttachment(item.attachment) ? (
            <img src={objectUrl} alt="" loading="lazy" decoding="async" />
          ) : (
            <video src={objectUrl} muted playsInline preload="metadata" />
          )
        ) : (
          <span
            className={`message-shared-media-placeholder${
              previewError ? " error" : ""
            }`}
          >
            <AttachmentGlyph
              name={previewError ? "retry" : video ? "video" : "image"}
            />
          </span>
        )}
        {video && (
          <span className="message-shared-media-type" aria-hidden="true">
            <AttachmentGlyph name="play" />
          </span>
        )}
      </span>
      <span className="message-shared-media-caption">
        <strong>{item.attachment.originalFileName}</strong>
        <small>{formatConversationTime(item.sharedAt)}</small>
      </span>
    </button>
  );
}

export function MessageNavigationIcon({
  name,
}: {
  name: MessageNavigationIconName;
}) {
  const commonProps = {
    className: "message-nav-svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "search":
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "chats":
      return (
        <svg {...commonProps}>
          <path d="M5 17.5 3.5 21l4-1.7c1.2.5 2.6.7 4 .7 4.7 0 8.5-3.2 8.5-7.2S16.2 5.5 11.5 5.5 3 8.7 3 12.8c0 1.8.8 3.4 2 4.7Z" />
          <path d="M8 11h7M8 14h4.5" />
        </svg>
      );
    case "list":
      return (
        <svg {...commonProps}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
    case "edit":
      return (
        <svg {...commonProps}>
          <path d="M5 19h4l9.5-9.5a2.1 2.1 0 0 0-3-3L6 16v3Z" />
          <path d="m13.8 8.2 3 3" />
        </svg>
      );
    case "requests":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <path d="m5 7 7 5 7-5" />
        </svg>
      );
    case "groups":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="9" r="3" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3.8 19c.5-3.2 2.3-5 5.2-5s4.7 1.8 5.2 5M14.5 15.2c2.7-.5 4.7.8 5.5 3.8" />
        </svg>
      );
    case "official":
      return (
        <svg {...commonProps}>
          <path d="M12 3 5 6v5c0 4.5 2.7 8 7 10 4.3-2 7-5.5 7-10V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "announcement":
      return (
        <svg {...commonProps}>
          <path d="M4 14V9l13-5v15L4 14Z" />
          <path d="M17 8h2a2 2 0 0 1 0 4h-2M6 14l1.5 6h4L10 15" />
        </svg>
      );
    case "appearance":
      return (
        <svg {...commonProps}>
          <path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2L12 3Z" />
          <path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
          <path d="m6 14 .7 1.8 1.8.7-1.8.7L6 19l-.7-1.8-1.8-.7 1.8-.7L6 14Z" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19 13.5v-3l-2-.7a7.5 7.5 0 0 0-.8-1.8l.9-1.9-2.2-2.2-1.9.9a7.5 7.5 0 0 0-1.8-.8L10.5 2h-3L6.8 4a7.5 7.5 0 0 0-1.8.8l-1.9-.9L.9 6.1 1.8 8a7.5 7.5 0 0 0-.8 1.8l-2 .7v3l2 .7a7.5 7.5 0 0 0 .8 1.8l-.9 1.9 2.2 2.2 1.9-.9a7.5 7.5 0 0 0 1.8.8l.7 2h3l.7-2a7.5 7.5 0 0 0 1.8-.8l1.9.9 2.2-2.2-.9-1.9a7.5 7.5 0 0 0 .8-1.8l2-.7Z"
            transform="translate(2 0) scale(.83)"
          />
        </svg>
      );
    case "starred":
      return (
        <svg {...commonProps}>
          <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...commonProps}>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" />
          <path d="M10 21h4" />
        </svg>
      );
    case "bellOff":
      return (
        <svg {...commonProps}>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" />
          <path d="M10 21h4" />
          <path d="M3 3l18 18" />
        </svg>
      );
    case "profile":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" />
        </svg>
      );
    case "workspace":
      return (
        <svg {...commonProps}>
          <path d="M10 5 3 12l7 7" />
          <path d="M4 12h16" />
        </svg>
      );
    case "logout":
      return (
        <svg {...commonProps}>
          <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
          <path d="m15 8 4 4-4 4M19 12H9" />
        </svg>
      );
    case "archive":
      return (
        <svg {...commonProps}>
          <rect x="4" y="5" width="16" height="4.5" rx="1.5" />
          <path d="M6.5 9.5V17a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V9.5" />
          <path d="M10 13h4" />
        </svg>
      );
    case "newChat":
      return (
        <svg {...commonProps}>
          <path d="M5 19h12a2 2 0 0 0 2-2V9" />
          <path d="M15.5 4.5 19.5 8.5" />
          <path d="m8 16 1-4 8-8a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2l-8 8-4 1Z" />
        </svg>
      );
    case "newGroup":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="9" r="3" />
          <circle cx="16.5" cy="10" r="2.5" />
          <path d="M3.5 19c.5-3.2 2.4-5 5.5-5s5 1.8 5.5 5" />
          <path d="M18.5 4.5v5M16 7h5" />
        </svg>
      );
    case "emoji":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 10h.01M15.5 10h.01M8 14.5c1.1 1.4 2.4 2.1 4 2.1s2.9-.7 4-2.1" />
        </svg>
      );
    case "microphone":
      return (
        <svg {...commonProps}>
          <rect x="8" y="3" width="8" height="12" rx="4" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
        </svg>
      );
    case "send":
      return (
        <svg {...commonProps}>
          <path d="m21 3-7.5 18-3.8-7.7L2 9.5 21 3Z" />
          <path d="m9.7 13.3 4.8-4.8" />
        </svg>
      );
    case "shared":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m5.5 16 4-4 3 3 2.2-2.2L18.5 16" />
        </svg>
      );
    case "storage":
      return (
        <svg {...commonProps}>
          <ellipse cx="12" cy="6" rx="7.5" ry="3" />
          <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
          <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
        </svg>
      );
    case "addUser":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.6-3.6 2.4-5.5 5.5-5.5s4.9 1.9 5.5 5.5" />
          <path d="M17 7v6M14 10h6" />
        </svg>
      );
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      );
    case "close":
      return (
        <svg {...commonProps}>
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      );
    case "block":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m6 6 12 12" />
        </svg>
      );
    case "pin":
      return (
        <svg {...commonProps}>
          <path d="m8 4 8 8" />
          <path d="m14 3 7 7-4 1-5 5-1 4-7-7 4-1 5-5 1-4Z" />
          <path d="m9 15-5 5" />
        </svg>
      );
    case "unread":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          <path d="m5 7 7 5 7-5" />
          <circle
            cx="18"
            cy="6"
            r="2.5"
            fill="currentColor"
            stroke="white"
            strokeWidth="1.2"
          />
        </svg>
      );
    case "react":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 10h.01M15.5 10h.01M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
        </svg>
      );
    case "reply":
      return (
        <svg {...commonProps}>
          <path d="m10 8-5 4 5 4" />
          <path d="M5 12h8c3.3 0 6 2.7 6 6" />
        </svg>
      );
    case "more":
      return (
        <svg {...commonProps}>
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "trash":
      return (
        <svg {...commonProps}>
          <path d="M4.5 7h15" />
          <path d="M9 7V4.5h6V7" />
          <path d="m7 7 .7 12h8.6L17 7" />
          <path d="M10 10.5v5M14 10.5v5" />
        </svg>
      );
  }
}

export function MessageStatusGlyph({ name }: { name: MessageStatusGlyphName }) {
  if (name === "star") {
    return (
      <svg
        className="message-status-svg"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9L12 2.8Z" />
      </svg>
    );
  }

  return (
    <svg className="message-status-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.2 3.5h7.6l-1 5 3.2 3.2v2.1H6v-2.1l3.2-3.2-1-5Z" />
      <path d="M12 13.8v7" fill="none" />
    </svg>
  );
}
