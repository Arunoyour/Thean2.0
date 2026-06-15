/* Thean Pharmacy — Web Push Service Worker */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { return; }

  const { type, title, body, speak, order_id } = data;

  // Show a visible notification
  const notifPromise = self.registration.showNotification(title || "Thean Pharmacy", {
    body: body || "",
    icon: "/favicon.ico",
    tag: type === "pending_pickup_reminder" ? `pickup-${order_id}` : order_id,
    renotify: true,
    requireInteraction: type === "pending_pickup_reminder",
    data: { order_id, type },
  });

  // Speak the message in any open pharmacy tab
  const speakPromise = self.clients.matchAll({ type: "window" }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: "SPEAK", text: speak || body || title });
    });
  });

  event.waitUntil(Promise.all([notifPromise, speakPromise]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const order_id = event.notification.data?.order_id;
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const target = order_id ? `/orders?highlight=${order_id}` : "/orders";
      if (clients.length > 0) {
        clients[0].focus();
        clients[0].navigate(target);
      } else {
        self.clients.openWindow(target);
      }
    })
  );
});
