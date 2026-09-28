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

// Segundos de espera antes de poder pedir otro código.
const REENVIO_SEGUNDOS = 60;

/**
 * Login: Google, o mail + código de 6 dígitos (Supabase OTP, sin contraseña).
 * Es el mismo flujo para registrarse y para entrar: si la cuenta no existe,
 * Supabase la crea. El acceso lo decide después el backend: quien no está en
 * public.usuarios ve la pantalla de registro (registro.js).
 */
function renderLogin() {
  authCard.classList.remove("auth-card-wide");
  authCard.innerHTML = `
    <div class="auth-title">Registro de ingreso</div>
    <div class="auth-sub">Entrá o creá tu cuenta con Google o con tu mail.</div>
    <button class="btn-google" id="btn-google" type="button">
      <span class="btn-google-icon">G</span> Continuar con Google
    </button>
    <div class="auth-divider"><span>o con tu mail</span></div>
    <div id="login-mail"></div>
  `;
  document.getElementById("btn-google").addEventListener("click", async () => {
    await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      // Con la query: el link de un mail (ej: admin.html?tab=solicitudes&...)
      // tiene que llegar entero después del login.
      options: { redirectTo: window.location.origin + window.location.pathname + window.location.search },
    });
  });
  renderPasoMail();
  authScreen.hidden = false;
  appShell.hidden = true;
  btnLogout.hidden = true;
}

function renderPasoMail(emailInicial = "") {
  const box = document.getElementById("login-mail");
  box.innerHTML = `
    <form class="login-form" id="form-mail" novalidate>
      <input class="form-input" type="email" id="login-email" inputmode="email" autocomplete="email"
        placeholder="tu@mail.com" value="${escapeHtmlAuth(emailInicial)}" aria-label="Tu mail" required>
      <button class="btn-main" type="submit" id="btn-enviar-codigo">Enviar código</button>
      <div class="login-msg" id="login-msg" role="alert"></div>
    </form>
  `;
  const form = document.getElementById("form-mail");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const msg = document.getElementById("login-msg");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      msg.textContent = "Ingresá un mail válido.";
      return;
    }
    const btn = document.getElementById("btn-enviar-codigo");
    btn.disabled = true;
    msg.textContent = "";
    const error = await enviarCodigo(email);
    btn.disabled = false;
    if (error) {
      msg.textContent = error;
      return;
    }
    renderPasoCodigo(email);
  });
}

function renderPasoCodigo(email) {
  const box = document.getElementById("login-mail");
  box.innerHTML = `
    <form class="login-form" id="form-codigo" novalidate>
      <div class="auth-sub">Te mandamos un código a <strong>${escapeHtmlAuth(email)}</strong>.${
        window.AUTH_DEV_LOGIN ? ' En local llega a <a href="http://127.0.0.1:54324" target="_blank" rel="noopener">Mailpit</a>.' : ""
      }</div>
      <input class="form-input login-codigo" type="text" id="login-codigo" inputmode="numeric" autocomplete="one-time-code"
        maxlength="6" pattern="[0-9]*" placeholder="000000" aria-label="Código de 6 dígitos" required>
      <button class="btn-main" type="submit" id="btn-verificar">Entrar</button>
      <div class="login-msg" id="login-msg" role="alert"></div>
      <div class="login-links">
        <button class="link-btn" type="button" id="btn-reenviar" disabled></button>
        <button class="link-btn" type="button" id="btn-cambiar-mail">Cambiar mail</button>
      </div>
    </form>
  `;
  const input = document.getElementById("login-codigo");
  const msg = document.getElementById("login-msg");
  input.focus();
  // Pegar "123 456" o un código con espacios también sirve.
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
  });

  document.getElementById("form-codigo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = input.value.trim();
    if (token.length !== 6) {
      msg.textContent = "El código tiene 6 dígitos.";
      return;
    }
    const btn = document.getElementById("btn-verificar");
    btn.disabled = true;
    msg.textContent = "";
    // Si sale bien, onAuthStateChange (SIGNED_IN) sigue con evaluateSession.
    const { error } = await supabaseClient.auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      btn.disabled = false;
      msg.textContent = mensajeErrorAuth(error);
      input.select();
    }
  });

  document.getElementById("btn-cambiar-mail").addEventListener("click", () => renderPasoMail(email));

  const reenviar = document.getElementById("btn-reenviar");
  let restantes = REENVIO_SEGUNDOS;
  const tick = () => {
    if (!document.body.contains(reenviar)) return clearInterval(timer);
    restantes -= 1;
    reenviar.disabled = restantes > 0;
    reenviar.textContent = restantes > 0 ? `Reenviar código (${restantes}s)` : "Reenviar código";
    if (restantes <= 0) clearInterval(timer);
  };
  const timer = setInterval(tick, 1000);
  reenviar.textContent = `Reenviar código (${restantes}s)`;
  reenviar.addEventListener("click", async () => {
    reenviar.disabled = true;
    const error = await enviarCodigo(email);
    msg.textContent = error || "";
    if (!error) {
      toast("Te mandamos un código nuevo.");
      renderPasoCodigo(email);
    } else {
      reenviar.disabled = false;
    }
  });
}

/** Devuelve el mensaje de error, o null si se mandó. */
async function enviarCodigo(email) {
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  return error ? mensajeErrorAuth(error) : null;
}

function mensajeErrorAuth(error) {
  const texto = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  if (error?.status === 429 || texto.includes("rate") || texto.includes("security purposes")) {
    return "Pediste demasiados códigos seguidos. Esperá un minuto y probá de nuevo.";
  }
  if (texto.includes("expired") || texto.includes("invalid") || texto.includes("otp")) {
    return "El código no es válido o ya venció. Revisalo o pedí uno nuevo.";
  }
  if (texto.includes("signup") || texto.includes("not allowed")) {
    return "No se pueden crear cuentas nuevas en este momento.";
  }
  return "No se pudo completar. Revisá tu conexión e intentá de nuevo.";
}

/** Sesión válida sin acceso a la app: pantalla para pedirlo (registro.js). */
function renderAccessRequest() {
  authScreen.hidden = false;
  appShell.hidden = true;
  btnLogout.hidden = true;
  window.renderRegistro(authCard);
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

function renderApp() {
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
    else renderAccessRequest();
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
        renderApp();
      }
      return;
    }
    if (res.status === 401) {
      // Token rechazado por el backend: se vuelve a loguear.
      await supabaseClient.auth.signOut();
      return;
    }
    if (res.status === 403) {
      // Sesión válida pero sin acceso: pantalla para pedirlo (registro.js).
      renderAccessRequest();
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
    // Recargar descarta todo lo que la página ya tenía cargado (datos del
    // usuario anterior, appStarted) y arranca limpia en el login.
    if (appStarted) {
      location.reload();
      return;
    }
  }
  // Un refresh del token no cambia el acceso: no hace falta volver a verificar.
  if (event === "TOKEN_REFRESHED" && appStarted) return;
  evaluateSession(session);
});

supabaseClient.auth.getSession().then(({ data }) => evaluateSession(data.session));
