import { useEffect, useRef, useState } from "react";

import { useAuth } from "../context/AuthContext";
import {
  connectMessagingSocketAfterEffectCommit,
  createMessagingSocket,
} from "../services/messaging-socket.service";
import {
  publishWorkRealtimeEvent,
  publishWorkRealtimeReconcile,
} from "../services/work-realtime.service";
import type { WorkItemRealtimePayload } from "../types/work-management";
import {
  NOTIFICATION_SOUND_STORAGE_KEY,
  readMessagingBooleanPreference,
  readMessagingDeviceSettings,
} from "../utils/messaging-preferences";
import { playNotificationTone } from "../utils/notification-sound";

const MAX_SEEN_WORK_EVENTS = 200;

export function WorkRealtimeBridge() {
  const { accessToken, account } = useAuth();
  const accountId = account?.id ?? null;
  const seenEventIdsRef = useRef<string[]>([]);
  const toastTimerRef = useRef<number | null>(null);
  const [toast, setToast] = useState<WorkItemRealtimePayload | null>(null);

  useEffect(() => {
    if (!accessToken || !accountId) {
      seenEventIdsRef.current = [];
      return;
    }

    const socket = createMessagingSocket(accessToken);

    const handleWorkUpdate = (payload: WorkItemRealtimePayload): void => {
      const seenEventIds = seenEventIdsRef.current;
      if (seenEventIds.includes(payload.eventId)) {
        return;
      }
      seenEventIdsRef.current = [
        payload.eventId,
        ...seenEventIds,
      ].slice(0, MAX_SEEN_WORK_EVENTS);

      publishWorkRealtimeEvent(payload);

      if (!payload.audible || payload.actorAccountId === accountId) {
        return;
      }

      const settings = readMessagingDeviceSettings(window.localStorage, accountId);
      if (settings.muteAllNotifications) {
        return;
      }

      if (!window.location.pathname.startsWith("/messages")) {
        setToast(payload);
        if (toastTimerRef.current !== null) {
          window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
          setToast(null);
          toastTimerRef.current = null;
        }, 6000);
      }

      const soundEnabled = readMessagingBooleanPreference(
        window.localStorage,
        NOTIFICATION_SOUND_STORAGE_KEY,
        accountId,
        true,
      );
      if (soundEnabled) {
        playNotificationTone();
      }
    };

    const handleReady = (): void => {
      // A reconnect may have missed events while the browser was offline. Reconcile
      // visible Work state from the authoritative API instead of trusting socket history.
      publishWorkRealtimeReconcile();
    };

    socket.on("work:item-updated", handleWorkUpdate);
    socket.on("messaging:ready", handleReady);
    const disconnectSocket = connectMessagingSocketAfterEffectCommit(socket);

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      socket.off("work:item-updated", handleWorkUpdate);
      socket.off("messaging:ready", handleReady);
      disconnectSocket();
    };
  }, [accessToken, accountId]);

  if (!toast) {
    return null;
  }

  return (
    <div className="message-notification-toast work-realtime-toast" role="status" aria-live="polite">
      <strong>{toast.title}</strong>
      <span>{toast.body}</span>
    </div>
  );
}
