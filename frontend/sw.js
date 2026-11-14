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
  const url = typeof datos.url === "string" && datos.url.startsWith("/") ? datos.url : "/";
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/icon.svg", badge: "/icon.svg", data: { url } }));
});

// Al tocar la notificación se enfoca la app si ya está abierta, o se abre.
// En iOS, focus() puede rechazar (cliente suspendido) o no enfocar nada: si
// pasa, hay que caer igual a openWindow en vez de quedarse sin hacer nada.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const ventana of ventanas) {
      try {
        if ("focus" in ventana && (await ventana.focus())) return;
      } catch {
        // seguimos con el siguiente cliente o con openWindow
      }
    }
    try {
      await self.clients.openWindow(destino);
    } catch (error) {
      console.error("notificationclick: no se pudo abrir la app", error);
    }
  })());
});
