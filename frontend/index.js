// Backend API URL. Empty string = same origin as the page (default when the
// backend serves this frontend). Override window.API_URL before this script
// loads if the frontend is hosted separately from the backend.
const API_URL = window.API_URL || "";

let currentStudentId = null;
let marcadoPresente = false;
let lookups = { grados: [], edades: [] };

function init() {
  const hoy = new Date();
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  document.getElementById("fecha-hoy").textContent = `${dias[hoy.getDay()]} ${hoy.getDate()} ${meses[hoy.getMonth()]}`;

  document.getElementById("input-apellido").addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscar();
  });

  document.getElementById("btn-buscar").addEventListener("click", buscar);
  document.getElementById("modal-overlay").addEventListener("click", cerrarModal);
  document.getElementById("btn-guardar-edit").addEventListener("click", guardarEdicion);
  document.getElementById("btn-cancelar-edit").addEventListener("click", cerrarModal);

  cargarLookups();
}

async function cargarLookups() {
  try {
    const res = await fetch(`${API_URL}/api/lookups`);
    if (!res.ok) throw new Error("Server error");
    lookups = await res.json();
  } catch (error) {
    console.error("Error cargando grados/edades:", error);
  }
}

function getTodayInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function buscar() {
  const termino = document.getElementById("input-apellido").value.trim();
  if (!termino) return;

  setBtnCargando(true);
  marcadoPresente = false;
  limpiarContenido();

  try {
    const res = await fetch(`${API_URL}/api/students/search?q=${encodeURIComponent(termino)}`);
    if (!res.ok) throw new Error("Server error");

    const data = await res.json();

    if (data.length === 0) {
      mostrarNuevoChico(termino);
    } else if (data.length === 1) {
      mostrarResultado(data[0]);
    } else {
      mostrarMultiples(data);
    }
  } catch (error) {
    console.error("Error:", error);
    mostrarMensaje("err", "❌ No se pudo conectar. Verificá la URL o tu conexión a internet.");
  } finally {
    setBtnCargando(false);
  }
}

function mostrarResultado(chico) {
  currentStudentId = chico.id;

  const iniciales = chico.nombreCompleto
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const tieneFicha = chico.ficha === true;
  const obs = chico.obs ? `<div class="obs-box">💬 ${escapeHtml(chico.obs)}</div>` : "";
  const visitas = chico.visitas || 0;

  const html = `
    <div class="card" id="card-resultado">
      <div class="card-header">
        <div class="avatar">${iniciales}</div>
        <div>
          <div class="card-name">${escapeHtml(chico.nombreCompleto)}</div>
          <div class="card-meta">${escapeHtml(chico.grado) || "Sin grado"} · ${escapeHtml(chico.edad) || ""}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="info-row">
          <span class="info-label">📋 Ficha</span>
          <span class="badge ${tieneFicha ? "badge-si" : "badge-no"}">${tieneFicha ? "Presentó ✓" : "No presentó ✗"}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📅 Visitas este año</span>
          <strong>${visitas}</strong>
        </div>
        ${obs}
      </div>
      <div class="card-actions">
        <button class="btn-main" id="btn-presente" type="button">✓ Marcar presente</button>
        <button class="btn-sec" type="button" id="btn-abrir-modal">✏️</button>
      </div>
    </div>
  `;

  agregarHTML(html);
  const cardAcciones = document.querySelector("#card-resultado .card-actions");
  if (cardAcciones) {
    cardAcciones.insertAdjacentHTML(
      "afterbegin",
      `
        <div class="form-group card-date-group">
          <label class="form-label" for="presente-fecha">Fecha del presente</label>
          <input class="form-input" type="date" id="presente-fecha" value="${getTodayInputValue()}">
        </div>
      `
    );
  }
  document.getElementById("btn-presente").addEventListener("click", marcarPresente);
  document.getElementById("btn-abrir-modal").addEventListener("click", abrirModal);
}

function mostrarMultiples(chicos) {
  const items = chicos
    .map((c) => {
      const iniciales = c.nombreCompleto
        .split(" ")
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase();
      return `
        <div class="result-item" data-chico='${escapeHtml(JSON.stringify(c))}'>
          <div class="result-item-left">
            <div class="avatar avatar-sm">${iniciales}</div>
            <div>
              <div class="result-item-name">${escapeHtml(c.nombreCompleto)}</div>
              <div class="result-item-meta">${escapeHtml(c.grado) || "Sin grado"} · ${escapeHtml(c.edad) || ""}</div>
            </div>
          </div>
          <span class="result-item-chevron">›</span>
        </div>
      `;
    })
    .join("");

  agregarHTML(`
    <div class="alert alert-info">
      <span class="alert-icon">👥</span>
      <span>Se encontraron ${chicos.length} chicos. Elegí uno:</span>
    </div>
    <div class="multi-results">${items}</div>
  `);

  document.querySelectorAll(".result-item").forEach((item) => {
    item.addEventListener("click", () => {
      const chico = JSON.parse(unescapeHtml(item.dataset.chico));
      seleccionarChico(chico);
    });
  });
}

function seleccionarChico(chico) {
  limpiarContenido();
  mostrarResultado(chico);
}

function opcionesGrados() {
  if (lookups.grados.length === 0) {
    return `<option value="">No hay grados cargados</option>`;
  }
  return lookups.grados
    .map((g) => `<option value="${g.id}">${escapeHtml(g.label)}</option>`)
    .join("");
}

function opcionesEdades() {
  if (lookups.edades.length === 0) {
    return `<option value="">No hay categorías cargadas</option>`;
  }
  return lookups.edades
    .map((e) => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`)
    .join("");
}

function mostrarNuevoChico(termino) {
  agregarHTML(`
    <div class="alert alert-warn">
      <span class="alert-icon">⚠️</span>
      <span>No se encontró "<strong>${escapeHtml(termino)}</strong>". Si es la primera vez que viene, completá los datos:</span>
    </div>
    <div class="form-card">
      <div class="form-title">Nuevo chico</div>
      <div class="form-group">
        <label class="form-label">Nombre</label>
        <input class="form-input" type="text" id="nuevo-nombre" autocapitalize="words">
      </div>
      <div class="form-group">
        <label class="form-label">Apellido</label>
        <input class="form-input" type="text" id="nuevo-apellido" value="${escapeHtml(termino)}" autocapitalize="words">
      </div>
      <div class="form-group">
        <label class="form-label">Grado</label>
        <select class="form-select" id="nuevo-grado">${opcionesGrados()}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="nuevo-edad">${opcionesEdades()}</select>
      </div>
      <div class="form-group">
        <label class="form-label">¿Trajo la ficha?</label>
        <select class="form-select" id="nuevo-ficha">
          <option value="true">✅ Sí, trajo la ficha</option>
          <option value="false">❌ No trajo la ficha</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono de emergencia (opcional)</label>
        <input class="form-input" type="tel" id="nuevo-telefono" placeholder="Ej: 1122334455">
      </div>
      <div class="form-group">
        <label class="form-label">Observaciones (opcional)</label>
        <input class="form-input" type="text" id="nuevo-obs" placeholder="Ej: pendiente de ficha médica...">
      </div>
      <button class="btn-main" id="btn-agregar" type="button">+ Agregar y marcar presente</button>
    </div>
  `);

  document.getElementById("btn-agregar").addEventListener("click", agregarNuevo);
}

async function marcarPresente() {
  if (marcadoPresente) return;
  const btn = document.getElementById("btn-presente");
  const fechaInput = document.getElementById("presente-fecha");
  const fecha = fechaInput?.value || getTodayInputValue();

  if (fechaInput && !fechaInput.value) {
    mostrarMensaje("warn", "Seleccioná una fecha válida antes de marcar el presente.");
    return;
  }

  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/attendance/mark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: currentStudentId,
        fecha,
      }),
    });

    if (!res.ok) throw new Error("Server error");

    marcadoPresente = true;
    btn.textContent = "✓ Presente marcado";
    btn.classList.add("done");
    document.getElementById("card-resultado").insertAdjacentHTML(
      "afterend",
      `<div class="alert alert-ok"><span class="alert-icon">🎉</span><span>Presente marcado para hoy. ¡Listo!</span></div>`
    );
  } catch (error) {
    console.error("Error:", error);
    btn.textContent = "✓ Marcar presente";
    btn.disabled = false;
    mostrarMensaje("err", "❌ Error al guardar. Intentá de nuevo.");
  }
}

async function agregarNuevo() {
  const nombre = document.getElementById("nuevo-nombre").value.trim();
  const apellido = document.getElementById("nuevo-apellido").value.trim();
  const grado_id = document.getElementById("nuevo-grado").value;
  const entrego_ficha = document.getElementById("nuevo-ficha").value === "true";
  const edad_id = document.getElementById("nuevo-edad").value;
  const telefono_emergencia = document.getElementById("nuevo-telefono").value.trim();
  const observaciones = document.getElementById("nuevo-obs").value.trim();

  if (!nombre || !apellido) {
    mostrarMensaje("warn", "Ingresá nombre y apellido.");
    return;
  }
  if (!grado_id || !edad_id) {
    mostrarMensaje("warn", "Seleccioná grado y categoría.");
    return;
  }

  const btn = document.getElementById("btn-agregar");
  btn.innerHTML = '<span class="spinner"></span> Guardando...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        apellido,
        grado_id,
        edad_id,
        entrego_ficha,
        telefono_emergencia: telefono_emergencia || null,
        observaciones,
        fecha: getTodayInputValue(),
      }),
    });

    if (!res.ok) throw new Error("Server error");

    limpiarContenido();
    agregarHTML(`<div class="alert alert-ok"><span class="alert-icon">🎉</span><span><strong>${escapeHtml(nombre)} ${escapeHtml(apellido)}</strong> fue agregado y el presente quedó marcado para hoy.</span></div>`);
    document.getElementById("input-apellido").value = "";
  } catch (error) {
    console.error("Error:", error);
    btn.textContent = "+ Agregar y marcar presente";
    btn.disabled = false;
    mostrarMensaje("err", "❌ Error al guardar. Intentá de nuevo.");
  }
}

function abrirModal() {
  document.getElementById("edit-obs").value = "";
  document.getElementById("modal-overlay").classList.add("open");
}

function cerrarModal(e) {
  const overlay = document.getElementById("modal-overlay");
  if (!e || e.target === overlay) {
    overlay.classList.remove("open");
  }
}

async function guardarEdicion() {
  const entrego_ficha = document.getElementById("edit-ficha").value === "true";
  const observaciones = document.getElementById("edit-obs").value.trim();
  const btn = document.getElementById("btn-guardar-edit");
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/students/${currentStudentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entrego_ficha,
        observaciones,
      }),
    });

    if (!res.ok) throw new Error("Server error");

    cerrarModal();
    btn.textContent = "Guardar cambios";
    btn.disabled = false;
    mostrarMensaje("ok", "✅ Datos actualizados correctamente.");
    setTimeout(() => buscar(), 500);
  } catch (error) {
    console.error("Error:", error);
    btn.textContent = "Guardar cambios";
    btn.disabled = false;
    mostrarMensaje("err", "❌ Error al guardar. Intentá de nuevo.");
  }
}

function setBtnCargando(cargando) {
  const btn = document.getElementById("btn-buscar-icon");
  btn.innerHTML = cargando ? '<span class="spinner"></span>' : "Buscar";
  document.getElementById("btn-buscar").disabled = cargando;
}

function limpiarContenido() {
  document.getElementById("contenido").innerHTML = "";
}

function agregarHTML(html) {
  document.getElementById("contenido").insertAdjacentHTML("beforeend", html);
}

function mostrarMensaje(tipo, msg) {
  const clases = { ok: "alert-ok", warn: "alert-warn", info: "alert-info", err: "alert-err" };
  agregarHTML(`<div class="alert ${clases[tipo]}">${msg}</div>`);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function unescapeHtml(text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

init();
