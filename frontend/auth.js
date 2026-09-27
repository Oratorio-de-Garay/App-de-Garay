// Google SSO gate. Only accounts registered in the Supabase `usuarios`
// table (checked server-side by the backend) can use the app.
const API_URL = window.API_URL || "";
const ORG_STORAGE_KEY = "oratorio.organization_id";

const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);
window.supabaseClient = supabaseClient;

const authScreen = document.getElementById("auth-screen");
const authCard = document.getElementById("auth-card");
const appShell = document.getElementById("app-shell");
const btnLogout = document.getElementById("btn-logout");

btnLogout.addEventListener("click", () => supabaseClient.auth.signOut());

// Hasta que el backend confirme el acceso no se muestra nada de la app: ni el
// contenido ni el encabezado (base.css oculta el header con .auth-pending).
document.body.classList.add("auth-pending");
renderVerifying();

// Organización activa. El backend la valida contra las membresías del usuario,
// así que mandar otra acá no da acceso a nada: sólo devuelve 403.
let organizations = [];
let currentOrganizationId = readStoredOrganizationId();

// Respuesta de /api/auth/me (roles incluidos). La usan las páginas, por
// ejemplo admin.js para decidir qué pestañas mostrar.
window.currentUser = null;

const isAdminPage = document.body.dataset.page === "admin";

// Mensaje para mostrar como toast en la página siguiente, después de un redirect.
const FLASH_STORAGE_KEY = "oratorio.flash";

/** Toast efímero abajo a la derecha. tipo: "ok" | "err". */
function toast(mensaje, tipo = "ok") {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.id = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast${tipo === "err" ? " toast-err" : ""}`;
  el.setAttribute("role", tipo === "err" ? "alert" : "status");
  el.textContent = mensaje;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add("saliendo");
    setTimeout(() => el.remove(), 250);
  }, 3800);
}
window.toast = toast;

function redirectWithToast(url, mensaje, tipo = "ok") {
  try {
    sessionStorage.setItem(FLASH_STORAGE_KEY, JSON.stringify({ mensaje, tipo }));
  } catch {
    // Sin storage el redirect igual funciona; sólo se pierde el aviso.
  }
  location.replace(url);
}

function showPendingFlash() {
  try {
    const raw = sessionStorage.getItem(FLASH_STORAGE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(FLASH_STORAGE_KEY);
    const { mensaje, tipo } = JSON.parse(raw);
    if (mensaje) toast(mensaje, tipo);
  } catch {
    // Storage bloqueado o valor corrupto: no hay aviso que mostrar.
  }
}

function readStoredOrganizationId() {
  try {
    return localStorage.getItem(ORG_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function storeOrganizationId(id) {
  try {
    localStorage.setItem(ORG_STORAGE_KEY, id);
  } catch {
    // Modo privado o storage bloqueado: la elección dura lo que la pestaña.
  }
}

/**
 * Fetch wrapper that attaches the current Supabase access token and the
 * active organization. Use this instead of plain fetch() for all /api calls.
 */
async function apiFetch(path, options = {}) {
  const { data } = await supabaseClient.auth.getSession();
  const token = data?.session?.access_token;

  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  // /api/auth/me no lleva organización: es justamente la que dice cuáles son
  // válidas. Mandar la guardada (que puede ser de otro usuario que usó este
  // navegador) hacía que el backend respondiera 403 a un usuario habilitado.
  if (currentOrganizationId && path !== "/api/auth/me") {
    headers["X-Organization-Id"] = currentOrganizationId;
  }

  return fetch(`${API_URL}${path}`, { ...options, headers });
}
window.apiFetch = apiFetch;

function renderVerifying() {
  authCard.innerHTML = `
    <div class="auth-title">Verificando tu acceso…</div>
    <div class="auth-sub"><span class="spinner spinner-verde"></span></div>
  `;
  authScreen.hidden = false;
  appShell.hidden = true;
  btnLogout.hidden = true;
}

function renderLogin() {
  authCard.innerHTML = `
    <div class="auth-title">Registro de ingreso</div>
    <div class="auth-sub">Iniciá sesión con tu cuenta de Google del Classroom para acceder.</div>
    <button class="btn-google" id="btn-google" type="button">
      <span class="btn-google-icon">G</span> Continuar con Google
    </button>
  `;
  document.getElementById("btn-google").addEventListener("click", async () => {
    await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  });
  if (window.AUTH_DEV_LOGIN) renderDevLogin();
  authScreen.hidden = false;
  appShell.hidden = true;
  btnLogout.hidden = true;
}

/**
 * Sólo con Supabase local (config.js pone AUTH_DEV_LOGIN): login por magic
 * link, para no necesitar credenciales de Google en desarrollo. El mail llega
 * a Mailpit (http://127.0.0.1:54324). El acceso lo sigue decidiendo el backend
 * con public.usuarios, igual que con Google.
 */
function renderDevLogin() {
  const box = document.createElement("form");
  box.className = "dev-login";
  box.innerHTML = `
    <div class="dev-login-title">Desarrollo local</div>
    <input class="form-input" type="email" id="dev-email" placeholder="email registrado en usuarios" required>
    <button class="btn-sec" type="submit">Enviar magic link</button>
    <div class="dev-login-msg" id="dev-login-msg"></div>
  `;
  box.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("dev-login-msg");
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: document.getElementById("dev-email").value.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    msg.innerHTML = error
      ? escapeHtmlAuth(error.message)
      : 'Listo: abrí el mail en <a href="http://127.0.0.1:54324" target="_blank" rel="noopener">Mailpit</a>.';
  });
  authCard.appendChild(box);
}

function renderUnauthorized(email) {
  authCard.innerHTML = `
    <div class="auth-title">Acceso no autorizado</div>
    <div class="auth-sub">La cuenta <strong>${escapeHtmlAuth(email)}</strong> no está habilitada para esta aplicación. Pedile a un administrador que agregue tu email a la lista de acceso.</div>
    <button class="btn-sec" id="btn-otra-cuenta" type="button">Probar con otra cuenta</button>
  `;
  document.getElementById("btn-otra-cuenta").addEventListener("click", () => supabaseClient.auth.signOut());
  authScreen.hidden = false;
  appShell.hidden = true;
  btnLogout.hidden = false;
}

function renderNoOrganization(email) {
  authCard.innerHTML = `
    <div class="auth-title">Falta asignarte una organización</div>
    <div class="auth-sub">La cuenta <strong>${escapeHtmlAuth(email)}</strong> está habilitada, pero todavía no pertenece a ninguna organización, así que no hay datos para mostrarte. Pedile a un administrador que te agregue a una.</div>
    <button class="btn-sec" id="btn-otra-cuenta" type="button">Probar con otra cuenta</button>
  `;
  document.getElementById("btn-otra-cuenta").addEventListener("click", () => supabaseClient.auth.signOut());
  authScreen.hidden = false;
  appShell.hidden = true;
  btnLogout.hidden = false;
}

/**
 * Selector de organización, sólo si el usuario pertenece a más de una. En el
 * panel de administración no aplica: ahí se trabaja sobre todas las
 * organizaciones que el usuario administra.
 */
function renderOrganizationPicker() {
  document.getElementById("org-select")?.remove();
  if (organizations.length < 2 || isAdminPage) return;

  const select = document.createElement("select");
  select.id = "org-select";
  select.className = "form-select";
  select.innerHTML = organizations
    .map((org) => `<option value="${org.id}"${org.id === currentOrganizationId ? " selected" : ""}>${escapeHtmlAuth(org.name)}</option>`)
    .join("");

  // Recargar es lo más simple y seguro: cada página vuelve a pedir todos sus
  // datos con la organización nueva, sin estado viejo mezclado.
  select.addEventListener("change", () => {
    storeOrganizationId(select.value);
    location.reload();
  });

  btnLogout.parentNode.insertBefore(select, btnLogout);
}

/**
 * Links del sidebar según permisos: "Administración" sólo para admins, y sin
 * organización (superadmin puro) no tiene sentido mostrar Registro ni Buffet.
 */
function renderNavPermissions() {
  const sideNav = document.getElementById("side-nav");
  if (!sideNav) return;

  if (window.currentUser?.puede_administrar && !sideNav.querySelector('a[href="admin.html"]')) {
    const link = document.createElement("a");
    link.className = "side-link";
    link.href = "admin.html";
    link.textContent = "Administración";
    sideNav.appendChild(link);
  }

  if (!organizations.length) {
    sideNav.querySelectorAll(".side-link").forEach((link) => {
      if (link.getAttribute("href") !== "admin.html") link.hidden = true;
    });
  }
}

function renderApp(email) {
  const puedeAdministrar = Boolean(window.currentUser?.puede_administrar);

  // El panel es sólo para admins: al resto lo mandamos al inicio con un aviso.
  // (Es una ayuda de navegación; el backend igual rechaza /api/admin/*.)
  if (isAdminPage && !puedeAdministrar) {
    redirectWithToast("index.html", "No tenés permisos de administración.", "err");
    return;
  }

  // Sin organizaciones no hay datos que mostrar. Un superadmin igual puede usar
  // el panel; cualquier otro usuario todavía no tiene nada que hacer acá.
  if (!organizations.length && !isAdminPage) {
    if (puedeAdministrar) location.replace("admin.html");
    else renderNoOrganization(email);
    return;
  }

  document.body.classList.remove("auth-pending");
  authScreen.hidden = true;
  appShell.hidden = false;
  btnLogout.hidden = false;
  renderNavPermissions();
  renderOrganizationPicker();
  showPendingFlash();
  if (typeof window.onAuthenticated === "function") {
    window.onAuthenticated();
  }
}

function escapeHtmlAuth(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

let appStarted = false;
// Al cargar se disparan a la vez getSession() y los eventos de auth: sin esto
// se pedía /api/auth/me tres veces. Una sola evaluación por token.
let evaluatedToken = null;

async function evaluateSession(session) {
  if (!session) {
    evaluatedToken = null;
    renderLogin();
    return;
  }
  if (session.access_token === evaluatedToken) return;
  evaluatedToken = session.access_token;

  try {
    const res = await apiFetch("/api/auth/me");
    if (res.ok) {
      const me = await res.json();
      window.currentUser = me;
      organizations = me.organizations || [];
      // Si la organización guardada ya no corresponde (le sacaron el acceso, o
      // quedó de otro usuario en el mismo navegador) usamos la que resolvió el
      // backend.
      const stored = currentOrganizationId;
      currentOrganizationId = organizations.some((org) => org.id === stored)
        ? stored
        : me.organizacion_id;
      if (currentOrganizationId) storeOrganizationId(currentOrganizationId);

      if (!appStarted) {
        appStarted = true;
        renderApp(session.user?.email || "");
      }
      return;
    }
    if (res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({}));
      if (body.code === "SIN_ORGANIZACION") {
        renderNoOrganization(session.user?.email || "");
      } else {
        renderUnauthorized(session.user?.email || "");
      }
      return;
    }
    throw new Error("Server error");
  } catch (error) {
    console.error("Auth check error:", error);
    authCard.innerHTML = `
      <div class="auth-title">Error de conexión</div>
      <div class="auth-sub">No se pudo verificar tu acceso. Revisá tu conexión e intentá de nuevo.</div>
      <button class="btn-main" id="btn-reintentar" type="button">Reintentar</button>
    `;
    document.getElementById("btn-reintentar").addEventListener("click", () => location.reload());
    authScreen.hidden = false;
    appShell.hidden = true;
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  // La organización guardada es de quien cerró sesión: no se hereda.
  if (event === "SIGNED_OUT") {
    try { localStorage.removeItem(ORG_STORAGE_KEY); } catch {}
    currentOrganizationId = null;
  }
  // Un refresh del token no cambia el acceso: no hace falta volver a verificar.
  if (event === "TOKEN_REFRESHED" && appStarted) return;
  evaluateSession(session);
});

supabaseClient.auth.getSession().then(({ data }) => evaluateSession(data.session));
