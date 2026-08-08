let currentStudentId = null;
let marcadoPresente = false;
let lookups = { grados: [], edades: [] };
let lookupsPromise = null;
let activeSearchController = null;
let altaOrigen = null;
let renderRequestId = 0;

// Búsqueda asistida
let searchDebounceTimer = null;

function init() {
  const hoy = new Date();

  const dias = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado"
  ];

  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic"
  ];

  document.getElementById("fecha-hoy").textContent =
    `${dias[hoy.getDay()]} ${hoy.getDate()} ${meses[hoy.getMonth()]}`;

  const inputApellido = document.getElementById("input-apellido");

  // Buscar con Enter
  inputApellido.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(searchDebounceTimer);
      buscar(false);
    }
  });

  // =====================================================
  // BÚSQUEDA ASISTIDA
  // =====================================================
  inputApellido.addEventListener("input", () => {

    clearTimeout(searchDebounceTimer);

    const termino = inputApellido.value.trim();

    // Cancelar búsqueda anterior
    activeSearchController?.abort();

    // Si hay menos de 2 letras, limpiar resultados
    if (termino.length < 2) {
      limpiarContenido();
      return;
    }

    // Esperar 250 ms antes de buscar
    searchDebounceTimer = setTimeout(() => {
      buscar(true);
    }, 250);
  });

  // Buscar con botón
  document.getElementById("btn-buscar").addEventListener("click", () => {
    clearTimeout(searchDebounceTimer);
    buscar(false);
  });

  document.getElementById("btn-nuevo").addEventListener("click", iniciarAltaManual);
  const btnHistorial = document.getElementById("btn-historial");

if (btnHistorial) {
  btnHistorial.addEventListener("click", mostrarHistorial);
}
  document.getElementById("modal-overlay").addEventListener("click", cerrarModal);

  document
    .getElementById("btn-guardar-edit")
    .addEventListener("click", guardarEdicion);

  document
    .getElementById("btn-cancelar-edit")
    .addEventListener("click", cerrarModal);

  lookupsPromise = cargarLookups();
}


async function cargarLookups() {

  try {
    const res = await apiFetch("/api/lookups");
    if (!res.ok) throw new Error("Server error");
    lookups = await res.json();

    return true;

  } catch (error) {

    console.error("Error cargando grados/edades:", error);

    return false;
  }
}


async function asegurarLookups() {

  if (!lookupsPromise) {
    lookupsPromise = cargarLookups();
  }

  const cargados = await lookupsPromise;

  if (!cargados) {
    lookupsPromise = null;
  }

  return cargados;
}


function getTodayInputValue(date = new Date()) {

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function formatearUltimaAsistencia(fechaISO) {

  if (!fechaISO) {
    return "Sin asistencias";
  }

  const fecha =
    String(fechaISO).slice(0, 10);

  const hoy =
    getTodayInputValue();

  if (fecha === hoy) {
    return "Hoy";
  }

  const [year, month, day] =
    fecha.split("-").map(Number);

  const texto =
    new Intl.DateTimeFormat(
      "es-AR",
      {
        weekday: "long",
        day: "numeric",
        month: "long"
      }
    ).format(
      new Date(year, month - 1, day)
    );

  return (
    texto.charAt(0).toUpperCase() +
    texto.slice(1)
  );
}


// =====================================================
// BUSCAR
// asistida = true cuando el usuario está escribiendo
// asistida = false cuando usa Enter o botón Buscar
// =====================================================

async function buscar(asistida = false) {

  const termino =
    document.getElementById("input-apellido").value.trim();

  if (!termino) {
    limpiarContenido();
    return;
  }

  activeSearchController?.abort();

  const controller = new AbortController();

  activeSearchController = controller;

  const requestId = ++renderRequestId;


  // En búsqueda asistida no mostramos spinner en botón
  if (!asistida) {
    setBtnCargando(true);
  }

  setBtnNuevoCargando(false);

  altaOrigen = null;

  marcadoPresente = false;

  limpiarContenido();


  try {
    const res = await apiFetch(`/api/students/search?q=${encodeURIComponent(termino)}`);
    if (!res.ok) throw new Error("Server error");

    const data = await res.json();


    if (
      controller.signal.aborted ||
      requestId !== renderRequestId
    ) {
      return;
    }


    // =====================================================
    // BÚSQUEDA ASISTIDA
    // =====================================================

    if (asistida) {

      // Si no encuentra nada, simplemente no mostramos nada
      if (data.length === 0) {
        limpiarContenido();
        return;
      }

      // Aunque encuentre solamente una persona,
      // la mostramos como sugerencia para que el usuario
      // pueda elegirla.
      mostrarMultiples(data);

      return;
    }


    // =====================================================
    // BÚSQUEDA NORMAL
    // Enter o botón Buscar
    // =====================================================

    if (data.length === 0) {

      const lookupsCargados = await asegurarLookups();

      if (
        controller.signal.aborted ||
        requestId !== renderRequestId
      ) {
        return;
      }

      if (!lookupsCargados) {

        mostrarMensaje(
          "err",
          "❌ No se pudieron cargar los grados y categorías. Intentá nuevamente."
        );

        return;
      }

      mostrarNuevoChico({
        origen: "busqueda",
        termino
      });

    } else if (data.length === 1) {

      mostrarResultado(data[0]);

    } else {

      mostrarMultiples(data);
    }

  } catch (error) {

    if (error.name === "AbortError") {
      return;
    }

    console.error("Error:", error);

    mostrarMensaje(
      "err",
      "❌ No se pudo conectar. Verificá la URL o tu conexión a internet."
    );

  } finally {

    if (activeSearchController === controller) {

      activeSearchController = null;

      if (!asistida) {
        setBtnCargando(false);
      }
    }
  }
}


async function iniciarAltaManual() {

  const nombreInput =
    document.getElementById("nuevo-nombre");

  if (altaOrigen === "manual" && nombreInput) {

    nombreInput.focus();

    return;
  }


  activeSearchController?.abort();

  activeSearchController = null;

  clearTimeout(searchDebounceTimer);

  setBtnCargando(false);


  const requestId = ++renderRequestId;

  currentStudentId = null;

  marcadoPresente = false;

  altaOrigen = null;

  document.getElementById("input-apellido").value = "";

  limpiarContenido();

  setBtnNuevoCargando(true);


  const lookupsCargados = await asegurarLookups();


  if (requestId !== renderRequestId) {
    return;
  }


  setBtnNuevoCargando(false);


  if (!lookupsCargados) {

    mostrarMensaje(
      "err",
      "❌ No se pudieron cargar los grados y categorías. Intentá nuevamente."
    );

    return;
  }


  mostrarNuevoChico({
    origen: "manual"
  });
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

  const obs = chico.obs
    ? `<div class="obs-box">💬 ${escapeHtml(chico.obs)}</div>`
    : "";

  const visitas = chico.visitas || 0;


  const html = `

    <div class="card" id="card-resultado">

      <div class="card-header">

        <div class="avatar">
          ${iniciales}
        </div>

        <div>

          <div class="card-name">
            ${escapeHtml(chico.nombreCompleto)}
          </div>

          <div class="card-meta">
            ${escapeHtml(chico.grado) || "Sin grado"}
            ·
            ${escapeHtml(chico.edad) || ""}
          </div>

        </div>

      </div>


      <div class="card-body">

        <div class="info-row">

          <span class="info-label">
            📋 Ficha
          </span>

          <span class="badge ${tieneFicha ? "badge-si" : "badge-no"}">

            ${tieneFicha
              ? "Presentó ✓"
              : "No presentó ✗"
            }

          </span>

        </div>


        <div class="info-row">

          <span class="info-label">
            📅 Visitas este año
          </span>

          <strong>
            ${visitas}
          </strong>

        </div>

        <div class="info-row">

  <span class="info-label">
    🕒 Última asistencia
  </span>

  <strong>
    ${escapeHtml(
      formatearUltimaAsistencia(
        chico.ultima_asistencia
      )
    )}
  </strong>

</div>


        ${obs}

      </div>


      <div class="card-actions">

        <button
          class="btn-main"
          id="btn-presente"
          type="button"
        >
          ✓ Marcar presente
        </button>

        <button
          class="btn-sec"
          type="button"
          id="btn-abrir-modal"
        >
          ✏️
        </button>

      </div>

    </div>
  `;


  agregarHTML(html);


  const cardAcciones =
    document.querySelector(
      "#card-resultado .card-actions"
    );


  if (cardAcciones) {

    cardAcciones.insertAdjacentHTML(

      "afterbegin",

      `

        <div class="form-group card-date-group">

          <label
            class="form-label"
            for="presente-fecha"
          >
            Fecha del presente
          </label>

          <input
            class="form-input"
            type="date"
            id="presente-fecha"
            value="${getTodayInputValue()}"
          >

        </div>

      `
    );
  }


  document
    .getElementById("btn-presente")
    .addEventListener("click", marcarPresente);

  document
  .getElementById("presente-fecha")
  .addEventListener(
    "change",
    verificarPresenteFecha
  );
  verificarPresenteFecha();
  document
    .getElementById("btn-abrir-modal")
    .addEventListener("click", abrirModal);
}

function mostrarMultiples(chicos) {

  const items = chicos

    .map((c) => {

      const iniciales =
        c.nombreCompleto

          .split(" ")

          .slice(0, 2)

          .map(
            (p) => p[0]
          )

          .join("")

          .toUpperCase();


      return `

        <div class="resultado-con-presente">


          <!-- TARJETA DEL CHICO -->

          <div
            class="result-item"
            data-chico='${escapeHtml(
              JSON.stringify(c)
            )}'
          >

            <div class="result-item-left">

              <div class="avatar avatar-sm">
                ${escapeHtml(iniciales)}
              </div>


              <div>

                <div class="result-item-name">

                  ${escapeHtml(
                    c.nombreCompleto
                  )}

                </div>


                <div class="result-item-meta">

                  ${escapeHtml(c.grado) || "Sin grado"}

                  ·

                  ${escapeHtml(c.edad) || ""}

                </div>

              </div>

            </div>


            <span class="result-item-chevron">
              ›
            </span>

          </div>


          <!-- BOTÓN DE PRESENTE -->

          <button
            type="button"
            class="btn-presente-rapido"
            data-pibe-id="${escapeHtml(c.id)}"
            data-pibe-nombre="${escapeHtml(
              c.nombreCompleto
            )}"
          >

            <span class="presente-rapido-texto">
              ✓ Marcar presente
            </span>

            <span class="presente-rapido-icono">
              ✓
            </span>

          </button>


        </div>
      `;
    })

    .join("");


  agregarHTML(`

    <div class="alert alert-info">

      <span class="alert-icon">
        👥
      </span>

      <span>
        Se encontraron ${chicos.length} chicos. Elegí uno:
      </span>

    </div>


    <div class="multi-results">

      ${items}

    </div>
  `);


  // ======================================================
  // ABRIR FICHA TOCANDO LA TARJETA
  // ======================================================

  document
    .querySelectorAll(".result-item")
    .forEach((item) => {

      item.addEventListener(
        "click",
        () => {

          const chico =
            JSON.parse(
              unescapeHtml(
                item.dataset.chico
              )
            );

          seleccionarChico(chico);
        }
      );
    });


  // ======================================================
  // BOTONES DE PRESENTE RÁPIDO
  // ======================================================

  document
    .querySelectorAll(
      ".btn-presente-rapido"
    )
    .forEach((btn) => {

      const id =
        btn.dataset.pibeId;


      // Al mostrar resultados,
      // comprobamos si ya está presente.
      verificarPresenteRapido(
        btn,
        id
      );


      btn.addEventListener(
        "click",
        async (event) => {

          event.stopPropagation();

          await marcarPresenteRapido(
            btn
          );
        }
      );
    });
}

async function verificarPresenteRapido(
  btn,
  pibeId
) {

  const fecha =
    getTodayInputValue();


  try {

    const res =
      await window.apiFetch(

        `/api/attendance/check?student_id=${encodeURIComponent(
          pibeId
        )}&date=${encodeURIComponent(
          fecha
        )}`

      );


    if (!res.ok) {
      throw new Error(
        "Server error"
      );
    }


    const resultado =
      await res.json();


    if (resultado.marked) {

      btn.classList.add(
        "done"
      );

      btn.disabled = true;


      const texto =
        btn.querySelector(
          ".presente-rapido-texto"
        );


      if (texto) {

        texto.textContent =
          "✓ Presente marcado";
      }


    } else {

      btn.classList.remove(
        "done"
      );

      btn.disabled = false;


      const texto =
        btn.querySelector(
          ".presente-rapido-texto"
        );


      if (texto) {

        texto.textContent =
          "✓ Marcar presente";
      }
    }


  } catch (error) {

    console.error(
      "Error verificando presente rápido:",
      error
    );
  }
}

async function marcarPresenteRapido(btn) {

  if (
    !btn ||
    btn.classList.contains("done")
  ) {
    return;
  }

  const pibeId =
    btn.dataset.pibeId;

  const nombre =
    btn.dataset.pibeNombre;

  const fecha =
    getTodayInputValue();

  const texto =
    btn.querySelector(
      ".presente-rapido-texto"
    );

  const icono =
    btn.querySelector(
      ".presente-rapido-icono"
    );

  btn.disabled = true;

  try {

    const res = await window.apiFetch(
      `/api/attendance/mark`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          student_id: pibeId,
          fecha: fecha
        })
      }
    );

    const resultado =
      await res.json();

    if (!res.ok) {
      throw new Error(
        resultado.error ||
        "Server error"
      );
    }

    btn.classList.add("done");
    btn.disabled = true;

    if (texto) {
      texto.textContent =
        "✓ Presente marcado";
    }

    if (icono) {
      icono.textContent = "✓";
    }

    if (resultado.alreadyMarked) {

      mostrarMensaje(
        "info",
        `${nombre} ya tenía el presente marcado para hoy.`
      );

    } else {

      mostrarMensaje(
        "ok",
        `🎉 Presente marcado para ${nombre}.`
      );
    }

  } catch (error) {

    console.error(
      "Error marcando presente rápido:",
      error
    );

    btn.disabled = false;

    btn.classList.remove("done");

    if (texto) {
      texto.textContent =
        "✓ Marcar presente";
    }

    if (icono) {
      icono.textContent = "✓";
    }

    mostrarMensaje(
      "err",
      "❌ No se pudo marcar el presente."
    );
  }
}

function seleccionarChico(chico) {

  limpiarContenido();

  mostrarResultado(chico);
}


function opcionesGrados() {

  if (lookups.grados.length === 0) {

    return `
      <option value="">
        No hay grados cargados
      </option>
    `;
  }


  return lookups.grados

    .map(
      (g) =>
        `<option value="${g.id}">
          ${escapeHtml(g.label)}
        </option>`
    )

    .join("");
}


function opcionesEdades() {

  if (lookups.edades.length === 0) {

    return `
      <option value="">
        No hay categorías cargadas
      </option>
    `;
  }


  return lookups.edades

    .map(
      (e) =>
        `<option value="${e.id}">
          ${escapeHtml(e.nombre)}
        </option>`
    )

    .join("");
}


function mostrarNuevoChico({
  origen,
  termino = ""
}) {

  const esBusqueda =
    origen === "busqueda";


  const aviso = esBusqueda

    ? `

      <div class="alert alert-warn">

        <span class="alert-icon">
          ⚠️
        </span>

        <span>

          No se encontró

          "<strong>
            ${escapeHtml(termino)}
          </strong>".

          Si es la primera vez que viene,
          completá los datos:

        </span>

      </div>
    `

    : "";


  altaOrigen = origen;


  agregarHTML(`

    ${aviso}


    <div
      class="form-card"
      aria-labelledby="nuevo-chico-titulo"
    >

      <div
        class="form-title"
        id="nuevo-chico-titulo"
      >
        Nuevo chico
      </div>


      <div class="form-group">

        <label
          class="form-label"
          for="nuevo-nombre"
        >
          Nombre
        </label>

        <input
          class="form-input"
          type="text"
          id="nuevo-nombre"
          autocomplete="given-name"
          autocapitalize="words"
        >

      </div>


      <div class="form-group">

        <label
          class="form-label"
          for="nuevo-apellido"
        >
          Apellido
        </label>

        <input
          class="form-input"
          type="text"
          id="nuevo-apellido"
          value="${esBusqueda ? escapeHtml(termino) : ""}"
          autocomplete="family-name"
          autocapitalize="words"
        >

      </div>


      <div class="form-group">

        <label
          class="form-label"
          for="nuevo-grado"
        >
          Grado
        </label>

        <select
          class="form-select"
          id="nuevo-grado"
        >
          ${opcionesGrados()}
        </select>

      </div>


      <div class="form-group">

        <label
          class="form-label"
          for="nuevo-edad"
        >
          Categoría
        </label>

        <select
          class="form-select"
          id="nuevo-edad"
        >
          ${opcionesEdades()}
        </select>

      </div>


      <div class="form-group">

        <label
          class="form-label"
          for="nuevo-ficha"
        >
          ¿Trajo la ficha?
        </label>

        <select
          class="form-select"
          id="nuevo-ficha"
        >

          <option value="true">
            ✅ Sí, trajo la ficha
          </option>

          <option value="false">
            ❌ No trajo la ficha
          </option>

        </select>

      </div>


      <div class="form-group">

        <label
          class="form-label"
          for="nuevo-telefono"
        >
          Teléfono de emergencia (opcional)
        </label>

        <input
          class="form-input"
          type="tel"
          id="nuevo-telefono"
          placeholder="Ej: 1122334455"
          autocomplete="tel"
        >

      </div>


      <div class="form-group">

        <label
          class="form-label"
          for="nuevo-obs"
        >
          Observaciones (opcional)
        </label>

        <input
          class="form-input"
          type="text"
          id="nuevo-obs"
          placeholder="Ej: pendiente de ficha médica..."
        >

      </div>


      <button
        class="btn-main"
        id="btn-agregar"
        type="button"
      >
        + Agregar y marcar presente
      </button>

    </div>
  `);


  document
    .getElementById("btn-agregar")
    .addEventListener("click", agregarNuevo);


  document
    .getElementById("nuevo-nombre")
    .focus();
}

async function verificarPresenteFecha() {

  const btn =
    document.getElementById("btn-presente");

  const fechaInput =
    document.getElementById("presente-fecha");

  if (
    !btn ||
    !fechaInput ||
    !currentStudentId
  ) {
    return;
  }

  const fecha =
    fechaInput.value;

  if (!fecha) {
    return;
  }

  try {

    const res = await window.apiFetch(
      `/api/attendance/check?student_id=${encodeURIComponent(currentStudentId)}&date=${encodeURIComponent(fecha)}`
    );

    if (!res.ok) {
      throw new Error("Server error");
    }

    const resultado =
      await res.json();


    if (resultado.marked) {

      marcadoPresente = true;

      btn.textContent =
        "✓ Presente marcado";

      btn.classList.add("done");

      btn.disabled = true;

    } else {

      marcadoPresente = false;

      btn.textContent =
        "✓ Marcar presente";

      btn.classList.remove("done");

      btn.disabled = false;
    }

  } catch (error) {

    console.error(
      "Error verificando presente:",
      error
    );
  }
}

async function marcarPresente() {

  if (marcadoPresente) {
    return;
  }


  const btn =
    document.getElementById("btn-presente");


  const fechaInput =
    document.getElementById("presente-fecha");


  const fecha =
    fechaInput?.value ||
    getTodayInputValue();


  if (
    fechaInput &&
    !fechaInput.value
  ) {

    mostrarMensaje(
      "warn",
      "Seleccioná una fecha válida antes de marcar el presente."
    );

    return;
  }


  btn.innerHTML =
    '<span class="spinner"></span>';

  btn.disabled = true;


  try {
    const res = await apiFetch("/api/attendance/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: currentStudentId,
        fecha,
      }),
    });

    if (!res.ok) {
      throw new Error("Server error");
    }


    marcadoPresente = true;


    btn.textContent =
      "✓ Presente marcado";


    btn.classList.add("done");


    document
      .getElementById("card-resultado")
      .insertAdjacentHTML(

        "afterend",

        `
          <div class="alert alert-ok">

            <span class="alert-icon">
              🎉
            </span>

            <span>
              Presente marcado para hoy. ¡Listo!
            </span>

          </div>
        `
      );


  } catch (error) {

    console.error("Error:", error);


    btn.textContent =
      "✓ Marcar presente";


    btn.disabled = false;


    mostrarMensaje(
      "err",
      "❌ Error al guardar. Intentá de nuevo."
    );
  }
}


async function agregarNuevo() {

  const nombre =
    document
      .getElementById("nuevo-nombre")
      .value
      .trim();


  const apellido =
    document
      .getElementById("nuevo-apellido")
      .value
      .trim();


  const grado_id =
    document
      .getElementById("nuevo-grado")
      .value;


  const entrego_ficha =
    document
      .getElementById("nuevo-ficha")
      .value === "true";


  const edad_id =
    document
      .getElementById("nuevo-edad")
      .value;


  const telefono_emergencia =
    document
      .getElementById("nuevo-telefono")
      .value
      .trim();


  const observaciones =
    document
      .getElementById("nuevo-obs")
      .value
      .trim();


  if (!nombre || !apellido) {

    mostrarMensaje(
      "warn",
      "Ingresá nombre y apellido."
    );

    return;
  }


  if (!grado_id || !edad_id) {

    mostrarMensaje(
      "warn",
      "Seleccioná grado y categoría."
    );

    return;
  }


  const btn =
    document.getElementById("btn-agregar");


  btn.innerHTML =
    '<span class="spinner"></span> Guardando...';


  btn.disabled = true;


  try {
    const res = await apiFetch("/api/students", {
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

    if (!res.ok) {
      throw new Error("Server error");
    }


    altaOrigen = null;


    limpiarContenido();


    agregarHTML(`

      <div class="alert alert-ok">

        <span class="alert-icon">
          🎉
        </span>

        <span>

          <strong>
            ${escapeHtml(nombre)}
            ${escapeHtml(apellido)}
          </strong>

          fue agregado y el presente quedó marcado para hoy.

        </span>

      </div>
    `);


    document
      .getElementById("input-apellido")
      .value = "";


  } catch (error) {

    console.error("Error:", error);


    btn.textContent =
      "+ Agregar y marcar presente";


    btn.disabled = false;


    mostrarMensaje(
      "err",
      "❌ Error al guardar. Intentá de nuevo."
    );
  }
}


function abrirModal() {

  document
    .getElementById("edit-obs")
    .value = "";


  document
    .getElementById("modal-overlay")
    .classList
    .add("open");
}


function cerrarModal(e) {

  const overlay =
    document.getElementById("modal-overlay");


  if (
    !e ||
    e.target === overlay
  ) {

    overlay.classList.remove("open");
  }
}


async function guardarEdicion() {

  const entrego_ficha =
    document
      .getElementById("edit-ficha")
      .value === "true";


  const observaciones =
    document
      .getElementById("edit-obs")
      .value
      .trim();


  const btn =
    document
      .getElementById("btn-guardar-edit");


  btn.innerHTML =
    '<span class="spinner"></span>';


  btn.disabled = true;


  try {
    const res = await apiFetch(`/api/students/${currentStudentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entrego_ficha,
        observaciones,
      }),
    });

    if (!res.ok) {
      throw new Error("Server error");
    }


    cerrarModal();


    btn.textContent =
      "Guardar cambios";


    btn.disabled = false;


    mostrarMensaje(
      "ok",
      "✅ Datos actualizados correctamente."
    );


    setTimeout(
      () => buscar(false),
      500
    );


  } catch (error) {

    console.error("Error:", error);


    btn.textContent =
      "Guardar cambios";


    btn.disabled = false;


    mostrarMensaje(
      "err",
      "❌ Error al guardar. Intentá de nuevo."
    );
  }
}

// =====================================================
// HISTORIAL DE ASISTENCIAS
// =====================================================

async function mostrarHistorial() {
  clearTimeout(searchDebounceTimer);

  activeSearchController?.abort();
  activeSearchController = null;

  renderRequestId++;

  altaOrigen = null;
  marcadoPresente = false;

  const input = document.getElementById("input-apellido");

  if (input) {
    input.value = "";
  }

  const year = new Date().getFullYear();

  await cargarHistorial(year);
}

async function cargarHistorial(year) {

  limpiarContenido();

  agregarHTML(`

    <div
      id="top-asistencia"
      class="top-asistencia"
    >
      <div class="top-asistencia-cargando">
        Cargando ranking...
      </div>
    </div>


    <div
      class="form-card"
      id="historial-panel"
    >

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
      ">

        <div>

          <div
            class="form-title"
            style="margin-bottom:4px;"
          >
            Historial de asistencias
          </div>

          <div class="card-meta">
            Solo aparecen los días en los que hubo al menos una asistencia.
          </div>

        </div>


        <label style="
          display:flex;
          align-items:center;
          gap:8px;
          font-weight:600;
        ">

          Año

          <select
            class="form-select"
            id="historial-year"
            style="width:auto;min-width:110px;"
          >
            ${opcionesAniosHistorial(year)}
          </select>

        </label>

      </div>


      <div
        id="historial-contenido"
        style="margin-top:18px;"
      >

        <div class="alert alert-info">
          Cargando asistencias...
        </div>

      </div>

    </div>

  `);


  const selector =
    document.getElementById(
      "historial-year"
    );


  selector?.addEventListener(
    "change",
    async (e) => {

      await cargarHistorial(
        Number(e.target.value)
      );

    }
  );


  // Cargamos Top 3 + fechas al mismo tiempo
  try {

    const [
      resTop,
      resFechas
    ] = await Promise.all([

      apiFetch(
        `/api/attendance/top?year=${encodeURIComponent(year)}`
      ),

      apiFetch(
        `/api/attendance/dates?year=${encodeURIComponent(year)}`
      )

    ]);


    if (!resTop.ok) {
      throw new Error(
        "Error cargando ranking"
      );
    }


    if (!resFechas.ok) {
      throw new Error(
        "Error cargando historial"
      );
    }


    const top3 =
      await resTop.json();


    const fechas =
      await resFechas.json();


    renderTopAsistencia(
      top3,
      year
    );


    renderHistorialFechas(
      fechas,
      year
    );


  } catch (error) {

    console.error(
      "Error cargando historial:",
      error
    );


    const top =
      document.getElementById(
        "top-asistencia"
      );


    if (top) {
      top.innerHTML = "";
      top.style.display = "none";
    }


    const cont =
      document.getElementById(
        "historial-contenido"
      );


    if (cont) {

      cont.innerHTML = `
        <div class="alert alert-err">
          ❌ No se pudo cargar el historial.
        </div>
      `;
    }
  }
}
function renderTopAsistencia(top3, year) {

  const cont =
    document.getElementById("top-asistencia");

  if (!cont) {
    return;
  }

  if (
    !Array.isArray(top3) ||
    top3.length === 0
  ) {
    cont.style.display = "none";
    return;
  }

  cont.style.display = "flex";

  const puestos = ["1°", "2°", "3°"];

  const personas = top3
    .map((pibe, index) => {

      const nombre =
        pibe.nombreCompleto ||
        `${pibe.nombre || ""} ${pibe.apellido || ""}`.trim();

      const iniciales = nombre
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((parte) => parte[0])
        .join("")
        .toUpperCase();

      const total =
        Number(pibe.total) || 0;

      return `
        <div
          class="top-persona top-persona-click"
          data-pibe-id="${escapeHtml(pibe.id)}"
        >

          <div class="top-puesto top-puesto-${index + 1}">
            ${puestos[index]}
          </div>

          <div class="top-avatar">
            ${escapeHtml(iniciales)}
          </div>

          <div class="top-datos">

            <div class="top-nombre">
              ${escapeHtml(nombre)}
            </div>

            <div class="top-total">
              ${total} ${total === 1 ? "presente" : "presentes"}
            </div>

          </div>

        </div>
      `;
    })
    .join("");


  cont.innerHTML = `

    <div class="top-titulo">

      <span class="top-corona">
        👑
      </span>

      <strong>
        Top asistencia del año (${year})
      </strong>

    </div>


    <div class="top-personas">
      ${personas}
    </div>

  `;


  cont
    .querySelectorAll(".top-persona-click")
    .forEach((item) => {

      item.addEventListener("click", async () => {

        const id =
          item.dataset.pibeId;

        try {

          const res = await window.apiFetch(
            `/api/students/${encodeURIComponent(id)}`
          );

          if (!res.ok) {
            throw new Error("Server error");
          }

          const chico =
            await res.json();

          limpiarContenido();

          mostrarResultado(chico);

        } catch (error) {

          console.error(
            "Error abriendo chico desde ranking:",
            error
          );

          mostrarMensaje(
            "err",
            "❌ No se pudieron cargar los datos del chico."
          );
        }

      });

    });
}

function opcionesAniosHistorial(selectedYear) {

  const actual =
    new Date().getFullYear();


  const inicio =
    Math.min(
      2024,
      actual
    );


  const years = [];


  for (
    let y = actual;
    y >= inicio;
    y--
  ) {

    years.push(`
      <option
        value="${y}"
        ${y === selectedYear ? "selected" : ""}
      >
        ${y}
      </option>
    `);
  }


  if (
    !years.some(
      (opt) =>
        opt.includes(
          `value="${selectedYear}"`
        )
    )
  ) {

    years.push(`
      <option
        value="${selectedYear}"
        selected
      >
        ${selectedYear}
      </option>
    `);
  }


  return years.join("");
}


function renderHistorialFechas(fechas, year) {

  const cont =
    document.getElementById(
      "historial-contenido"
    );


  if (!cont) {
    return;
  }


  if (
    !Array.isArray(fechas) ||
    fechas.length === 0
  ) {

    cont.innerHTML = `
      <div class="alert alert-info">
        No hay asistencias registradas en ${year}.
      </div>
    `;

    return;
  }


  const meses =
    new Map();


  for (
    const item
    of fechas
  ) {

    const fecha =
      parseFechaLocal(
        item.fecha
      );


    const clave =
      `${fecha.getFullYear()}-${String(
        fecha.getMonth() + 1
      ).padStart(2, "0")}`;


    if (
      !meses.has(clave)
    ) {

      meses.set(
        clave,
        []
      );
    }


    meses
      .get(clave)
      .push(item);
  }


  const html =
    [...meses.entries()]
      .map(
        ([clave, items]) => {

          const [
            anio,
            mes
          ] =
            clave
              .split("-")
              .map(Number);


          const tituloMes =
            new Intl.DateTimeFormat(
              "es-AR",
              {
                month: "long",
                year: "numeric"
              }
            )
              .format(
                new Date(
                  anio,
                  mes - 1,
                  1
                )
              );


          const filas =
            items
              .map(
                (item) => {

                  const fecha =
                    parseFechaLocal(
                      item.fecha
                    );


                  const textoFecha =
                    capitalizar(
                      new Intl.DateTimeFormat(
                        "es-AR",
                        {
                          weekday: "long",
                          day: "numeric",
                          month: "long"
                        }
                      )
                        .format(fecha)
                    );


                  const total =
                    Number(
                      item.total
                    ) || 0;


                  const textoTotal =
                    `${total} ${
                      total === 1
                        ? "presente"
                        : "presentes"
                    }`;


                  return `
                    <button
                      type="button"
                      class="result-item historial-fecha"
                      data-fecha="${escapeHtml(item.fecha)}"
                      style="
                        width:100%;
                        border:0;
                        background:transparent;
                        text-align:left;
                        cursor:pointer;
                      "
                    >

                      <div class="result-item-left">

                        <div class="avatar avatar-sm">
                          📅
                        </div>

                        <div>

                          <div class="result-item-name">
                            ${escapeHtml(textoFecha)}
                          </div>

                          <div class="result-item-meta">
                            ${escapeHtml(textoTotal)}
                          </div>

                        </div>

                      </div>


                      <span class="result-item-chevron">
                        ›
                      </span>

                    </button>
                  `;
                }
              )
              .join("");


          return `
            <section style="margin-top:20px;">

              <div style="
                font-size:13px;
                font-weight:800;
                letter-spacing:.06em;
                text-transform:uppercase;
                opacity:.7;
                margin:0 0 8px 4px;
              ">
                ${escapeHtml(
                  capitalizar(
                    tituloMes
                  )
                )}
              </div>


              <div class="multi-results">
                ${filas}
              </div>

            </section>
          `;
        }
      )
      .join("");


  cont.innerHTML =
    html;


  document
    .querySelectorAll(
      ".historial-fecha"
    )
    .forEach(
      (btn) => {

        btn.addEventListener(
          "click",
          () => {

            verAsistenciasFecha(
              btn.dataset.fecha
            );

          }
        );
      }
    );
}


async function verAsistenciasFecha(fechaISO) {

  limpiarContenido();


  const fecha =
    parseFechaLocal(
      fechaISO
    );


  const titulo =
    capitalizar(
      new Intl.DateTimeFormat(
        "es-AR",
        {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        }
      )
        .format(fecha)
    );


  agregarHTML(`
    <div class="form-card">

      <div style="
        display:flex;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
      ">

        <button
          class="btn-sec"
          id="btn-volver-historial"
          type="button"
        >
          ← Volver
        </button>


        <div>

          <div
            class="form-title"
            style="margin-bottom:4px;"
          >
            ${escapeHtml(titulo)}
          </div>


          <div
            class="card-meta"
            id="historial-detalle-total"
          >
            Cargando presentes...
          </div>

        </div>

      </div>


      <div
        id="historial-detalle"
        style="margin-top:18px;"
      >

        <div class="alert alert-info">
          Cargando...
        </div>

      </div>

    </div>
  `);


  document
    .getElementById(
      "btn-volver-historial"
    )
    ?.addEventListener(
      "click",
      () => {

        cargarHistorial(
          fecha.getFullYear()
        );

      }
    );


  try {

    const res =
      await window.apiFetch(
        `/api/attendance/by-date?date=${encodeURIComponent(fechaISO)}`
      );


    if (!res.ok) {
      throw new Error(
        "Server error"
      );
    }


    const pibes =
      await res.json();


    const totalEl =
      document.getElementById(
        "historial-detalle-total"
      );


    const detalle =
      document.getElementById(
        "historial-detalle"
      );


    if (totalEl) {

      totalEl.textContent =
        `${pibes.length} ${
          pibes.length === 1
            ? "presente"
            : "presentes"
        }`;
    }


    if (!detalle) {
      return;
    }


    if (
      !pibes.length
    ) {

      detalle.innerHTML = `
        <div class="alert alert-info">
          No hay presentes cargados para esta fecha.
        </div>
      `;

      return;
    }


    detalle.innerHTML = `
      <div class="multi-results">

        ${pibes
          .map(
            (pibe) => {

              const nombreCompleto =
                pibe.nombreCompleto ||
                `${pibe.nombre || ""} ${pibe.apellido || ""}`.trim();


              const iniciales =
                nombreCompleto
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map(
                    (p) =>
                      p[0]
                  )
                  .join("")
                  .toUpperCase();


              const meta =
                [
                  pibe.grado,
                  pibe.edad
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                "Sin datos adicionales";
                return `
  <div
    class="result-item historial-pibe"
    data-pibe-id="${escapeHtml(pibe.id)}"
    data-pibe-nombre="${escapeHtml(nombreCompleto)}"
    style="cursor:pointer;"
  >

    <div class="result-item-left">

      <div class="avatar avatar-sm">
        ${escapeHtml(iniciales)}
      </div>

      <div>

        <div class="result-item-name">
          ${escapeHtml(nombreCompleto)}
        </div>

        <div class="result-item-meta">
          ${escapeHtml(meta)}
        </div>

      </div>

    </div>

    <span class="result-item-chevron">
      ›
    </span>

  </div>
`;


            }
          )
          .join("")}

      </div>
    `;
          document
  .querySelectorAll(".historial-pibe")
  .forEach((item) => {

    item.addEventListener("click", async () => {

      const id = item.dataset.pibeId;

      try {

        const res = await window.apiFetch(
          `/api/students/${encodeURIComponent(id)}`
        );

        if (!res.ok) {
          throw new Error("Server error");
        }

        const chico = await res.json();

        limpiarContenido();
        mostrarResultado(chico);

      } catch (error) {

        console.error(
          "Error abriendo chico desde historial:",
          error
        );

        mostrarMensaje(
          "err",
          "❌ No se pudieron cargar los datos del chico."
        );
      }

    });

  });

  } catch (error) {

    console.error(
      "Error cargando asistentes por fecha:",
      error
    );


    const detalle =
      document.getElementById(
        "historial-detalle"
      );


    if (detalle) {

      detalle.innerHTML = `
        <div class="alert alert-err">
          ❌ No se pudo cargar la lista de presentes.
        </div>
      `;
    }
  }
}


function parseFechaLocal(fechaISO) {

  const [
    year,
    month,
    day
  ] =
    String(fechaISO)
      .slice(0, 10)
      .split("-")
      .map(Number);


  return new Date(
    year,
    month - 1,
    day
  );
}


function capitalizar(texto) {

  if (!texto) {
    return "";
  }


  return (
    texto
      .charAt(0)
      .toUpperCase() +
    texto.slice(1)
  );
}

function setBtnCargando(cargando) {

  const btn =
    document.getElementById("btn-buscar-icon");


  btn.innerHTML =
    cargando
      ? '<span class="spinner"></span>'
      : "Buscar";


  document
    .getElementById("btn-buscar")
    .disabled = cargando;
}


function setBtnNuevoCargando(cargando) {

  const btn =
    document.getElementById("btn-nuevo");


  const label =
    document.getElementById("btn-nuevo-icon");


  label.innerHTML =
    cargando
      ? '<span class="spinner spinner-verde"></span>'
      : "Nuevo chico";


  btn.disabled = cargando;
}


function limpiarContenido() {

  document
    .getElementById("contenido")
    .innerHTML = "";
}


function agregarHTML(html) {

  document
    .getElementById("contenido")
    .insertAdjacentHTML(
      "beforeend",
      html
    );
}


function mostrarMensaje(tipo, msg) {

  const clases = {

    ok: "alert-ok",

    warn: "alert-warn",

    info: "alert-info",

    err: "alert-err"
  };


  agregarHTML(
    `<div class="alert ${clases[tipo]}">
      ${msg}
    </div>`
  );
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

  const textarea =
    document.createElement("textarea");


  textarea.innerHTML = text;


  return textarea.value;
}

// Started by auth.js once Google sign-in succeeds and the email is allowlisted.
window.onAuthenticated = init;

init();