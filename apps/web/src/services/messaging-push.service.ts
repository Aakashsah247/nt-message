import { apiRequest } from "../lib/api";
import type {
  MessagingPushConfigResponse,
  MessagingPushSubscriptionInput,
  MessagingPushSubscriptionResponse,
} from "../types/messaging";

const SERVICE_WORKER_PATH = "/nt-message-sw.js";

function authorizationHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output.buffer;
}

export function messagingPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getMessagingPushConfig(
  accessToken: string,
): Promise<MessagingPushConfigResponse> {
  return apiRequest<MessagingPushConfigResponse>("/conversations/push/config", {
    headers: authorizationHeaders(accessToken),
  });
}

async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(
    SERVICE_WORKER_PATH,
    { scope: "/" },
  );
  await navigator.serviceWorker.ready;
  return registration;
}

export async function syncMessagingPushSubscription(
  accessToken: string,
  preferences: Pick<
    MessagingPushSubscriptionInput,
    "showPreview" | "isMuted"
  >,
): Promise<boolean> {
  if (!messagingPushSupported() || Notification.permission !== "granted") {
    return false;
  }

  const config = await getMessagingPushConfig(accessToken);
  if (!config.enabled || !config.publicKey) {
    return false;
  }

  const registration = await registerMessagingServiceWorker();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToArrayBuffer(config.publicKey),
    });
  }

  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
    throw new Error("The browser returned an incomplete notification subscription.");
  }

  await apiRequest<MessagingPushSubscriptionResponse>(
    "/conversations/push/subscription",
    {
      method: "PUT",
      headers: authorizationHeaders(accessToken),
      body: JSON.stringify({
        endpoint: serialized.endpoint,
        keys: {
          p256dh: serialized.keys.p256dh,
          auth: serialized.keys.auth,
        },
        showPreview: preferences.showPreview,
        isMuted: preferences.isMuted,
      }),
    },
  );

  return true;
}

export async function disableMessagingPushSubscription(
  accessToken: string,
): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  try {
    await apiRequest<MessagingPushSubscriptionResponse>(
      "/conversations/push/subscription",
      {
        method: "DELETE",
        headers: authorizationHeaders(accessToken),
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      },
    );
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}
