// Service worker: recibe las notificaciones push y las muestra.
// Se sirve desde la raíz para tener scope sobre toda la app. No cachea nada.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { body: event.data ? event.data.text() : "" };
  }
  const title = String(datos.title || "Oratorio de Garay").slice(0, 120);
  const body = String(datos.body || "").slice(0, 400);
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/icon.svg", badge: "/icon.svg" }));
});

// Al tocar la notificación se enfoca la app si ya está abierta, o se abre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const ventana of ventanas) {
      if ("focus" in ventana) return ventana.focus();
    }
    return self.clients.openWindow("/");
  })());
});
