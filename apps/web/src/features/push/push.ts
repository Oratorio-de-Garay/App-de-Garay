import { config } from "@/config";
import { guardar, leer } from "@/lib/almacen";
import { api, pedir } from "@/lib/api";

// Notificaciones push en este dispositivo: registra el service worker, pide
// permiso (siempre por un gesto de la persona) y guarda la suscripción en la
// API. Para desactivarlas se usa la configuración del navegador.
//
// Si el server no tiene claves VAPID o el navegador no soporta push, no hace
// nada.

const CLAVE_POSPUESTO = "oratorio.push.pospuesto"; // "Ahora no": hasta cuándo no se vuelve a preguntar (ms)
const CLAVE_DESACTIVADO = "oratorio.push.desactivado"; // las apagó a propósito
const DIAS_POSPUESTO = 7;

export const pushDisponible = () =>
  Boolean(config.vapidPublicKey) &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/** Clave pública VAPID (base64url) a los bytes que pide pushManager.subscribe. */
export function claveABytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** El service worker también es parte de lo que pide el navegador para instalar la app. */
export const registrarServiceWorker = () => navigator.serviceWorker.register("/sw.js");

async function suscripcionActual(): Promise<PushSubscription | null> {
  const registro = await navigator.serviceWorker.getRegistration("/sw.js");
  return registro ? registro.pushManager.getSubscription() : null;
}

const suscribir = (registro: ServiceWorkerRegistration) =>
  registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: claveABytes(config.vapidPublicKey),
  });

async function guardarEnLaApi(suscripcion: PushSubscription): Promise<{ renovar?: boolean }> {
  // toJSON() incluye las claves en base64url, que es lo que espera web-push.
  const { endpoint = "", keys } = suscripcion.toJSON();
  return (await pedir(api.push.suscripciones.$post({ json: { endpoint, keys } }))) as { renovar?: boolean };
}

export async function activarPush(): Promise<void> {
  if ((await Notification.requestPermission()) !== "granted") {
    throw new Error("El permiso de notificaciones está bloqueado en este navegador.");
  }
  await registrarServiceWorker();
  const registro = await navigator.serviceWorker.ready;
  await guardarEnLaApi((await registro.pushManager.getSubscription()) ?? (await suscribir(registro)));
  guardar(CLAVE_DESACTIVADO, null);
  guardar(CLAVE_POSPUESTO, null);
}

/**
 * Auto-reparación: el servicio push puede dar por vencida la suscripción sin
 * que el navegador se entere, y entonces el servidor deja de enviarle. En cada
 * carga se vuelve a registrar la suscripción local (sin pedirle nada a la
 * persona); si el servidor dice que estaba vencida, se crea una nueva.
 */
export async function sincronizarPush(): Promise<void> {
  if (!pushDisponible() || Notification.permission !== "granted" || leer(CLAVE_DESACTIVADO)) return;
  try {
    await registrarServiceWorker();
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) return; // sin suscripción local: lo resuelve el aviso de "Activar"
    const { renovar } = await guardarEnLaApi(suscripcion);
    if (!renovar) return;
    await suscripcion.unsubscribe();
    await guardarEnLaApi(await suscribir(registro));
  } catch (error) {
    console.warn("Push: no se pudo sincronizar la suscripción", error);
  }
}

/** "Ahora no": no se vuelve a preguntar por una semana. */
export function posponerAvisoDePush(ahora = Date.now()): void {
  guardar(CLAVE_POSPUESTO, String(ahora + DIAS_POSPUESTO * 86_400_000));
}

/** Si corresponde ofrecer activarlas (nunca si el navegador las bloqueó). */
export async function correspondeAvisarPush(ahora = Date.now()): Promise<boolean> {
  if (!pushDisponible()) return false;
  if (Notification.permission === "denied") return false;
  if (leer(CLAVE_DESACTIVADO)) return false;
  if (ahora < Number(leer(CLAVE_POSPUESTO) || 0)) return false;
  return !(Notification.permission === "granted" && (await suscripcionActual()));
}
