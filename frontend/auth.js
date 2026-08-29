// Google SSO gate. Only accounts listed in the Supabase `allowed_emails`
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

// Organización activa. El backend la valida contra las membresías del usuario,
// así que mandar otra acá no da acceso a nada: sólo devuelve 403.
let organizations = [];
let currentOrganizationId = readStoredOrganizationId();

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
  if (currentOrganizationId) headers["X-Organization-Id"] = currentOrganizationId;

  return fetch(`${API_URL}${path}`, { ...options, headers });
}
window.apiFetch = apiFetch;

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
  authScreen.hidden = false;
  appShell.hidden = true;
  btnLogout.hidden = true;
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

/** Selector de organización, sólo si el usuario pertenece a más de una. */
function renderOrganizationPicker() {
  document.getElementById("org-select")?.remove();
  if (organizations.length < 2) return;

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

function renderApp() {
  authScreen.hidden = true;
  appShell.hidden = false;
  btnLogout.hidden = false;
  renderOrganizationPicker();
  if (typeof window.onAuthenticated === "function") {
    window.onAuthenticated();
  }
}

function escapeHtmlAuth(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

let appStarted = false;

async function evaluateSession(session) {
  if (!session) {
    renderLogin();
    return;
  }

  try {
    const res = await apiFetch("/api/auth/me");
    if (res.ok) {
      const me = await res.json();
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

supabaseClient.auth.onAuthStateChange((_event, session) => {
  evaluateSession(session);
});

supabaseClient.auth.getSession().then(({ data }) => evaluateSession(data.session));
