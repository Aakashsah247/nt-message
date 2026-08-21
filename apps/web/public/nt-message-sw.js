const NOTIFICATION_ICON = "/nt-logo.png";

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      if (!event.data) {
        return;
      }

      let payload;
      try {
        payload = event.data.json();
      } catch {
        return;
      }

      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // The open Message page already has its realtime toast. Suppress the
      // system notification while an NT Message window is actually visible.
      if (
        windows.some((client) => {
          if (client.visibilityState !== "visible") {
            return false;
          }

          try {
            return new URL(client.url).pathname.startsWith("/messages");
          } catch {
            return false;
          }
        })
      ) {
        return;
      }

      await self.registration.showNotification(
        typeof payload.title === "string" ? payload.title : "NT Message",
        {
          body:
            typeof payload.body === "string"
              ? payload.body
              : "Open NT Message to view this notification.",
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON,
          tag:
            typeof payload.notificationId === "string"
              ? payload.notificationId
              : undefined,
          data: {
            url:
              typeof payload.url === "string" && payload.url.startsWith("/")
                ? payload.url
                : "/messages/notifications",
          },
        },
      );
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url || "/messages/notifications",
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const sameOriginWindow = windows.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (sameOriginWindow) {
        await sameOriginWindow.navigate(targetUrl);
        await sameOriginWindow.focus();
        return;
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});
