import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

import { useAuth } from "../context/AuthContext";
import { recordActivityEvent } from "../services/monitoring.service";
import type { ActivityEventType } from "../types/monitoring";

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const IDLE_AFTER_MS = 5 * 60 * 1000;

export function ActivityTracker() {
  const { accessToken } = useAuth();
  const location = useLocation();
  const lastActivityAtRef = useRef(Date.now());
  const idleRef = useRef(false);

  function sendActivity(
    eventType: ActivityEventType,
    elementLabel?: string,
  ): void {
    if (!accessToken) {
      return;
    }

    // Monitoring sends only safe page/action labels, never message text or form values.
    void recordActivityEvent(accessToken, {
      eventType,
      pagePath: getSafePageLabel(location.pathname),
      elementLabel,
    }).catch(() => undefined);
  }

  useEffect(() => {
    sendActivity("PAGE_VIEW");
    // Page label is intentionally the only dependency that should create page-view events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    function markActive(): void {
      lastActivityAtRef.current = Date.now();

      if (idleRef.current) {
        idleRef.current = false;
        sendActivity("ACTIVE_RESUMED");
      }
    }

    function handleClick(event: MouseEvent): void {
      markActive();

      const target = event.target as HTMLElement | null;
      const clickable = target?.closest("button, a, [role='button'], input[type='submit']") as
        | HTMLElement
        | null;

      if (!clickable) {
        return;
      }

      sendActivity("BUTTON_CLICK", getSafeElementLabel(clickable));
    }

    function handleActivity(): void {
      markActive();
    }

    window.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleActivity, true);
    window.addEventListener("pointermove", handleActivity, true);

    const intervalId = window.setInterval(() => {
      const isIdle = Date.now() - lastActivityAtRef.current >= IDLE_AFTER_MS;

      if (isIdle && !idleRef.current) {
        idleRef.current = true;
        sendActivity("IDLE_STARTED");
      }

      sendActivity(isIdle ? "IDLE_HEARTBEAT" : "ACTIVE_HEARTBEAT");
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleActivity, true);
      window.removeEventListener("pointermove", handleActivity, true);
      window.clearInterval(intervalId);
    };
    // Rebind listeners only when the active token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, location.pathname]);

  return null;
}

function getSafePageLabel(pathname: string): string {
  if (pathname.startsWith("/messages")) {
    return "Messages";
  }

  if (pathname.startsWith("/super-admin")) {
    return "Super Admin";
  }

  if (pathname.startsWith("/directory")) {
    return "Directory";
  }

  if (pathname.startsWith("/management-positions")) {
    return "Management Positions";
  }

  if (pathname.startsWith("/profile")) {
    return "Profile";
  }

  if (pathname.startsWith("/settings")) {
    return "Settings";
  }

  if (pathname === "/") {
    return "Dashboard";
  }

  return "Application";
}

function getSafeElementLabel(element: HTMLElement): string {
  const messageAction = getSafeMessageActionLabel(element);

  if (messageAction) {
    return messageAction;
  }

  const explicitLabel =
    element.dataset.monitoringLabel ??
    element.getAttribute("aria-label") ??
    element.getAttribute("title");

  if (explicitLabel?.trim()) {
    return explicitLabel.trim().slice(0, 80);
  }

  const text = element.textContent?.trim().replace(/\s+/g, " ") ?? "";

  return text ? text.slice(0, 80) : element.tagName.toLowerCase();
}

function getSafeMessageActionLabel(element: HTMLElement): string | null {
  const messageShell = element.closest(".message-app-shell");

  if (!messageShell) {
    return null;
  }

  // Message-module clicks are generalized so private chat partners and content stay hidden.
  if (element.closest(".message-send-button")) {
    return "Send message";
  }

  if (element.closest(".message-attachment-input")) {
    return "Attachment action";
  }

  if (element.closest(".message-voice-record-button")) {
    return "Voice note action";
  }

  if (element.closest(".message-location-button, .message-live-location-button, .message-live-stop-button")) {
    return "Location action";
  }

  if (element.closest(".message-shared-open-button")) {
    return "Open shared content";
  }

  if (element.closest(".message-search-open-button")) {
    return "Open message search";
  }

  if (element.closest(".message-thread")) {
    return "Message module action";
  }

  return "Messages page action";
}
