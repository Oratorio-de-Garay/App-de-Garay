// Notificaciones push en este dispositivo: registra el service worker, pide
// permiso (siempre por un gesto del usuario) y guarda la suscripción en el
// backend. No hay botón en el menú: para desactivarlas se usa la configuración
// del navegador.
//
// Si el server no tiene claves VAPID (window.VAPID_PUBLIC_KEY vacía) o el
// navegador no soporta push, no hace nada.

(function () {
  const clave = window.VAPID_PUBLIC_KEY;
  const soportado = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!clave || !soportado) return;

  // Preferencias de este dispositivo (sólo comodidad: si localStorage falla, se
  // pregunta de nuevo y listo).
  const CLAVE_POSPUESTO = "oratorio.push.pospuesto"; // "Ahora no": ms hasta cuando no se vuelve a preguntar
  const CLAVE_DESACTIVADO = "oratorio.push.desactivado"; // las apagó a propósito
  const DIAS_POSPUESTO = 7;

  function leer(clave) {
    try { return localStorage.getItem(clave); } catch { return null; }
  }
  function guardar(clave, valor) {
    try {
      if (valor === null) localStorage.removeItem(clave);
      else localStorage.setItem(clave, valor);
    } catch { /* sin localStorage: no se recuerda */ }
  }

  function claveABytes(base64Url) {
    const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replaceAll("-", "+").replaceAll("_", "/");
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }

  async function registro() {
    return navigator.serviceWorker.register("/sw.js");
  }

  async function suscripcionActual() {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function post(method, body) {
    const res = await window.apiFetch("/api/push/suscripciones", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  async function activar() {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      throw new Error("El permiso de notificaciones está bloqueado en este navegador.");
    }
    await registro();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave) }));
    // toJSON() incluye las claves en base64url, que es lo que espera web-push.
    await post("POST", sub.toJSON());
    guardar(CLAVE_DESACTIVADO, null);
    guardar(CLAVE_POSPUESTO, null);
    window.dispatchEvent(new Event("push-cambio"));
  }

  async function desactivar() {
    const sub = await suscripcionActual();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await post("DELETE", { endpoint });
    }
    // Quien las desactiva a propósito en este dispositivo no vuelve a recibir el aviso.
    guardar(CLAVE_DESACTIVADO, "1");
    window.dispatchEvent(new Event("push-cambio"));
  }

  async function estaActivo() {
    return Notification.permission === "granted" && Boolean(await suscripcionActual());
  }

  window.pushNotificaciones = { activar, desactivar, estaActivo };

  // ── Aviso para activarlas ──
  // A todo usuario con sesión iniciada que no las tenga activadas, en cualquier
  // página, una vez por carga. Ahora no = no se vuelve a preguntar por 7 días.
  // Si el navegador las bloqueó no se pregunta (no se puede desde la página).
  async function corresponderAvisar() {
    if (document.getElementById("push-aviso")) return false;
    if (Notification.permission === "denied") return false;
    if (leer(CLAVE_DESACTIVADO)) return false;
    if (Date.now() < Number(leer(CLAVE_POSPUESTO) || 0)) return false;
    return !(await estaActivo());
  }

  async function mostrarAviso() {
    if (!(await corresponderAvisar())) return;

    const aviso = document.createElement("div");
    aviso.id = "push-aviso";
    aviso.className = "push-aviso";
    aviso.setAttribute("role", "dialog");
    aviso.setAttribute("aria-label", "Activar notificaciones");
    aviso.innerHTML = `
      <div class="push-aviso-texto">
        <strong>¿Querés recibir notificaciones?</strong>
        <span>Te avisamos de lo importante en este dispositivo.</span>
      </div>
      <div class="push-aviso-acciones">
        <button type="button" class="push-aviso-no">Ahora no</button>
        <button type="button" class="push-aviso-si">Activar</button>
      </div>
    `;
    document.body.appendChild(aviso);

    const cerrar = () => aviso.remove();
    const pospuesto = () => guardar(CLAVE_POSPUESTO, String(Date.now() + DIAS_POSPUESTO * 86400000));

    aviso.querySelector(".push-aviso-no").addEventListener("click", () => {
      pospuesto();
      cerrar();
    });
    aviso.querySelector(".push-aviso-si").addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      try {
        await activar();
        window.toast?.("Listo: este dispositivo recibirá notificaciones.");
      } catch (error) {
        // Rechazó el permiso del navegador, o falló el registro.
        pospuesto();
        window.toast?.(error.message, "err");
      } finally {
        cerrar();
      }
    });
  }

  function iniciar() {
    // La app (#app-shell) se muestra sólo con la sesión iniciada y con acceso:
    // ahí, y nunca en el login ni en el registro, se muestra el aviso.
    const shell = document.getElementById("app-shell");
    if (!shell) return;
    let avisado = false;
    const revisar = () => {
      if (shell.hidden || avisado) return;
      avisado = true;
      // Un respiro para no tapar la pantalla recién cargada.
      setTimeout(mostrarAviso, 1500);
    };
    revisar();
    new MutationObserver(revisar).observe(shell, { attributes: true, attributeFilter: ["hidden"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
