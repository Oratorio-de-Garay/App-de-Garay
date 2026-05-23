// PROD
const urlScript = "https://script.google.com/macros/s/AKfycbwgnLTfIIeYawtIFVEtTbw01yU3orNIGCqeN0IUpdMG38X9eFb-_SetPl96nZbScbbA/exec"

// DEV
// const urlScript = "https://script.google.com/macros/s/AKfycbwHN4f04yaKT25T6JaJErlB_YtpKsHjUGmGOLiSFq0/dev";

let filaActual = null;
let nombreActual = "";
let marcadoPresente = false;

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
}

function getTodayInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function buscar() {
  const apellido = document.getElementById("input-apellido").value.trim();
  if (!apellido) return;

  setBtnCargando(true);
  marcadoPresente = false;
  limpiarContenido();

  try {
    const res = await fetch(`${urlScript}?action=buscar&apellido=${encodeURIComponent(apellido)}`);
    const data = await res.json();

    if (data.length === 0) {
      mostrarNuevoChico(apellido);
    } else if (data.length === 1) {
      mostrarResultado(data[0]);
    } else {
      mostrarMultiples(data);
    }
  } catch {
    mostrarMensaje("err", "❌ No se pudo conectar. Verificá la URL o tu conexión a internet.");
  } finally {
    setBtnCargando(false);
  }
}

function mostrarResultado(chico) {
  filaActual = chico.fila;
  nombreActual = chico.nombre;

  const iniciales = chico.nombre.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const tieneFicha = String(chico.ficha).toLowerCase() === "sí" || String(chico.ficha).toLowerCase() === "si";
  const obs = chico.obs ? `<div class="obs-box">💬 ${chico.obs}</div>` : "";
  const visitas = chico.visitas || 0;

  const html = `
    <div class="card" id="card-resultado">
      <div class="card-header">
        <div class="avatar">${iniciales}</div>
        <div>
          <div class="card-name">${chico.nombre}</div>
          <div class="card-meta">${chico.grado || "Sin grado"} · ${chico.edad || ""}</div>
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
  const items = chicos.map((c) => {
    const iniciales = c.nombre.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
    return `
      <div class="result-item" data-chico='${escapeHtml(JSON.stringify(c))}'>
        <div class="result-item-left">
          <div class="avatar avatar-sm">${iniciales}</div>
          <div>
            <div class="result-item-name">${c.nombre}</div>
            <div class="result-item-meta">${c.grado || "Sin grado"} · ${c.edad || ""}</div>
          </div>
        </div>
        <span class="result-item-chevron">›</span>
      </div>
    `;
  }).join("");

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

function mostrarNuevoChico(apellido) {
  agregarHTML(`
    <div class="alert alert-warn">
      <span class="alert-icon">⚠️</span>
      <span>No se encontró "<strong>${apellido}</strong>". Si es la primera vez que viene, completá los datos:</span>
    </div>
    <div class="form-card">
      <div class="form-title">Nuevo chico</div>
      <div class="form-group">
        <label class="form-label">Nombre y apellido completo</label>
        <input class="form-input" type="text" id="nuevo-nombre" value="${apellido}" autocapitalize="words">
      </div>
      <div class="form-group">
        <label class="form-label">Grado</label>
        <input class="form-input" type="text" id="nuevo-grado" placeholder="Ej: 1°, 4°, Sala 5" autocapitalize="words">
      </div>
      <div class="form-group">
        <label class="form-label">¿Trajo la ficha?</label>
        <select class="form-select" id="nuevo-ficha">
          <option value="Sí">✅ Sí, trajo la ficha</option>
          <option value="No">❌ No trajo la ficha</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Categoría</label>
        <select class="form-select" id="nuevo-edad">
          <option value="Chiquitos">Chiquitos</option>
          <option value="Medianos">Medianos</option>
          <option value="Grandes">Grandes</option>
          <option value="Gigantes">Gigantes</option>
        </select>
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
    mostrarMensaje("warn", "SeleccionÃ¡ una fecha vÃ¡lida antes de marcar el presente.");
    return;
  }

  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;

  try {
    await fetch(urlScript, {
      method: "POST",
      body: JSON.stringify({ action: "marcarPresente", nombre: nombreActual, fecha }),
    });
    marcadoPresente = true;
    btn.textContent = "✓ Presente marcado";
    btn.classList.add("done");
    document.getElementById("card-resultado").insertAdjacentHTML(
      "afterend",
      `<div class="alert alert-ok"><span class="alert-icon">🎉</span><span>Presente marcado para hoy. ¡Listo!</span></div>`
    );
  } catch {
    btn.textContent = "✓ Marcar presente";
    btn.disabled = false;
    mostrarMensaje("err", "❌ Error al guardar. Intentá de nuevo.");
  }
}

async function agregarNuevo() {
  const nombre = document.getElementById("nuevo-nombre").value.trim();
  const grado = document.getElementById("nuevo-grado").value.trim();
  const ficha = document.getElementById("nuevo-ficha").value;
  const edad = document.getElementById("nuevo-edad").value;
  const obs = document.getElementById("nuevo-obs").value.trim();

  if (!nombre) {
    alert("Ingresá el nombre completo.");
    return;
  }

  const btn = document.getElementById("btn-agregar");
  btn.innerHTML = '<span class="spinner"></span> Guardando...';
  btn.disabled = true;

  try {
    await fetch(urlScript, {
      method: "POST",
      body: JSON.stringify({ action: "agregarNuevo", nombre, grado, ficha, edad, obs }),
    });
    limpiarContenido();
    agregarHTML(`<div class="alert alert-ok"><span class="alert-icon">🎉</span><span><strong>${nombre}</strong> fue agregado y el presente quedó marcado para hoy.</span></div>`);
    document.getElementById("input-apellido").value = "";
  } catch {
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
  const ficha = document.getElementById("edit-ficha").value;
  const obs = document.getElementById("edit-obs").value.trim();
  const btn = document.getElementById("btn-guardar-edit");
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;

  try {
    await fetch(urlScript, {
      method: "POST",
      body: JSON.stringify({ action: "editarFicha", fila: filaActual, ficha, obs }),
    });
    cerrarModal();
    btn.textContent = "Guardar cambios";
    btn.disabled = false;
    mostrarMensaje("ok", "✅ Datos actualizados correctamente.");
    setTimeout(() => buscar(), 500);
  } catch {
    btn.textContent = "Guardar cambios";
    btn.disabled = false;
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
  return text
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
