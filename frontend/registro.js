// Pantalla de registro: quien inició sesión (Google o código por mail) pero
// todavía no tiene acceso pide sumarse a un espacio existente o crear uno
// nuevo. Un admin del espacio o un superadmin aprueba la solicitud desde el
// panel (pestaña Solicitudes) y le llega un mail con el resultado.
//
// Se carga antes que auth.js; usa sus globals (apiFetch, supabaseClient,
// toast, escapeHtmlAuth) recién cuando auth.js llama a renderRegistro().

const ESPACIO_NUEVO = "__nuevo__";

async function renderRegistro(card) {
  card.classList.add("auth-card-wide");
  card.innerHTML = `
    <div class="auth-title">Cargando…</div>
    <div class="auth-sub"><span class="spinner spinner-verde"></span></div>
  `;
  try {
    const res = await apiFetch("/api/registro");
    const estado = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(estado.error || `Error ${res.status}`);

    // Lo aceptaron mientras tenía la pantalla abierta: entra directo.
    if (estado.registrado) {
      location.reload();
      return;
    }
    const solicitud = estado.solicitud;
    if (solicitud?.estado === "pendiente") {
      renderSolicitudPendiente(card, estado);
    } else {
      renderFormRegistro(card, estado);
    }
  } catch (error) {
    card.innerHTML = `
      <div class="auth-title">Error de conexión</div>
      <div class="auth-sub">${escapeHtmlAuth(error.message)}</div>
      <button class="btn-main" id="reg-reintentar" type="button">Reintentar</button>
      ${botonSalirHtml()}
    `;
    card.querySelector("#reg-reintentar").addEventListener("click", () => renderRegistro(card));
    conectarSalir(card);
  }
}
window.renderRegistro = renderRegistro;

function renderFormRegistro(card, estado) {
  const anterior = estado.solicitud;
  const nombreInicial = anterior?.solicitante_nombre || estado.nombre_sugerido || "";

  card.innerHTML = `
    <div class="auth-title">Completá tu registro</div>
    <div class="auth-sub">Entraste como <strong>${escapeHtmlAuth(estado.email)}</strong>. Elegí a qué espacio querés sumarte: un administrador tiene que aprobar tu solicitud.</div>
    ${anterior?.estado === "rechazada" ? `
      <div class="alert alert-err reg-alerta">
        <span>Tu solicitud anterior (#${escapeHtmlAuth(anterior.numero)}) fue rechazada.${
          anterior.comentario_aprobador ? ` Motivo: <em>${escapeHtmlAuth(anterior.comentario_aprobador)}</em>` : ""
        } Podés mandar una nueva.</span>
      </div>` : ""}
    <form class="reg-form" id="reg-form" novalidate>
      <div class="form-group">
        <label class="form-label" for="reg-nombre">Tu nombre</label>
        <input class="form-input" id="reg-nombre" type="text" maxlength="120" autocomplete="name"
          placeholder="Nombre y apellido" value="${escapeHtmlAuth(nombreInicial)}" required>
      </div>
      <fieldset class="form-group reg-espacios">
        <legend class="form-label">Espacios</legend>
        <div class="reg-opciones">
          ${estado.espacios.map((e) => opcionEspacioHtml(e.id, e.nombre)).join("")}
          ${opcionEspacioHtml(ESPACIO_NUEVO, "Nuevo", "Pedir que se cree un espacio nuevo")}
        </div>
        <input class="form-input" id="reg-espacio-nuevo" type="text" maxlength="80" autocomplete="off"
          placeholder="Nombre del espacio" aria-label="Nombre del espacio nuevo" hidden>
      </fieldset>
      <div class="login-msg" id="reg-msg" role="alert"></div>
      <button class="btn-main" type="submit" id="reg-enviar" disabled>Aceptar</button>
    </form>
    ${botonSalirHtml()}
  `;

  const form = card.querySelector("#reg-form");
  const inputNuevo = card.querySelector("#reg-espacio-nuevo");
  const enviar = card.querySelector("#reg-enviar");
  const msg = card.querySelector("#reg-msg");
  const elegido = () => form.querySelector('input[name="reg-espacio"]:checked')?.value || null;

  form.querySelectorAll('input[name="reg-espacio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const esNuevo = elegido() === ESPACIO_NUEVO;
      inputNuevo.hidden = !esNuevo;
      enviar.textContent = esNuevo ? "Crear nuevo espacio" : "Aceptar";
      enviar.disabled = false;
      if (esNuevo) inputNuevo.focus();
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = card.querySelector("#reg-nombre").value.trim();
    const espacio = elegido();
    msg.textContent = "";
    if (!nombre) return (msg.textContent = "Ingresá tu nombre.");
    if (!espacio) return (msg.textContent = "Elegí un espacio.");
    const body = { nombre };
    if (espacio === ESPACIO_NUEVO) {
      body.nombre_espacio = inputNuevo.value.trim();
      if (!body.nombre_espacio) return (msg.textContent = "Escribí el nombre del espacio nuevo.");
    } else {
      body.organizacion_id = espacio;
    }

    enviar.disabled = true;
    try {
      const res = await apiFetch("/api/registro/solicitudes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      toast("Solicitud enviada.");
      renderRegistro(card);
    } catch (error) {
      msg.textContent = error.message;
      enviar.disabled = false;
    }
  });

  conectarSalir(card);
}

function opcionEspacioHtml(valor, nombre, ayuda = "") {
  return `
    <label class="reg-opcion${valor === ESPACIO_NUEVO ? " reg-opcion-nuevo" : ""}">
      <input type="radio" name="reg-espacio" value="${escapeHtmlAuth(valor)}">
      <span class="reg-opcion-texto">
        <strong>${valor === ESPACIO_NUEVO ? "+ " : ""}${escapeHtmlAuth(nombre)}</strong>
        ${ayuda ? `<small>${escapeHtmlAuth(ayuda)}</small>` : ""}
      </span>
    </label>
  `;
}

function renderSolicitudPendiente(card, estado) {
  const s = estado.solicitud;
  const pedido = s.datos?.espacio_nuevo
    ? `crear el espacio <strong>${escapeHtmlAuth(s.datos.nombre_espacio)}</strong>`
    : `sumarte a <strong>${escapeHtmlAuth(s.organizacion_nombre)}</strong>`;
  const tomada = Boolean(s.aprobador_id);

  card.innerHTML = `
    <div class="reg-estado-icono" aria-hidden="true">⏳</div>
    <div class="auth-title">Solicitud #${escapeHtmlAuth(s.numero)} enviada</div>
    <div class="auth-sub">Pediste ${pedido}. Te avisamos a <strong>${escapeHtmlAuth(estado.email)}</strong> cuando la revisen.</div>
    ${tomada
      ? `<div class="alert alert-info reg-alerta"><span>La está revisando ${escapeHtmlAuth(s.aprobador_nombre || s.aprobador_email || "un administrador")}.</span></div>`
      : ""}
    <div class="login-msg" id="reg-msg" role="alert"></div>
    <button class="btn-sec" id="reg-actualizar" type="button">Actualizar</button>
    ${tomada ? "" : '<button class="link-btn link-btn-danger" id="reg-cancelar" type="button">Cancelar solicitud</button>'}
    ${botonSalirHtml()}
  `;

  card.querySelector("#reg-actualizar").addEventListener("click", () => renderRegistro(card));
  card.querySelector("#reg-cancelar")?.addEventListener("click", async (e) => {
    if (!confirm("¿Cancelar la solicitud? Después podés mandar otra.")) return;
    e.currentTarget.disabled = true;
    try {
      const res = await apiFetch(`/api/registro/solicitudes/${encodeURIComponent(s.id)}/cancelar`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      toast("Solicitud cancelada.");
    } catch (error) {
      toast(error.message, "err");
    }
    renderRegistro(card);
  });
  conectarSalir(card);
}

function botonSalirHtml() {
  return '<button class="link-btn" id="reg-salir" type="button">Salir</button>';
}

function conectarSalir(card) {
  card.querySelector("#reg-salir").addEventListener("click", () => supabaseClient.auth.signOut());
}
