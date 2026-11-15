// Listado paginado reutilizable: tabla en desktop, tarjetas en móvil.
//
// Todas las pantallas (Registro, Buffet y Admin) usan crearListadoPaginado en
// vez de armar a mano su `array.map(...).join("")`. La paginación es del lado
// del cliente sobre el array que la pantalla ya tiene en memoria (los listados
// son chicos y ya se cargan completos), así que cambiar de página o de tamaño
// no hace ningún request y sólo se pinta el <tbody> de la página visible.
//
// El control de páginas es tui-pagination (se carga antes por <script>). Se
// montan dos instancias —arriba y abajo de la tabla— sincronizadas entre sí.
//
// Uso:
//   const lista = crearListadoPaginado({
//     contenedor: document.getElementById("productos-lista"),
//     clave: "buffet-productos",            // para recordar el tamaño de página
//     columnas: [{ titulo: "Nombre" }, { titulo: "Precio", clase: "num" }, { titulo: "", clase: "acciones" }],
//     renderFila: (item, indiceGlobal) => [celda1Html, celda2Html, celda3Html],
//                 // o { celdas: [...], clase: "inactivo" }
//     vacio: "<p>No hay productos.</p>",   // string o función que devuelve HTML
//     acciones: { "[data-edit-product]": (el, item) => editar(item) },   // delegación
//     onFila: (item, evento) => abrir(item),   // click en la fila (opcional)
//     onRender: (tbody, itemsPagina) => {},    // hook tras pintar cada página
//   });
//   lista.setItems(array);   // al cambiar datos o filtros (vuelve a la página 1)
//   lista.setItems(array, { mantenerPagina: true });  // tras editar/borrar

(function () {
  const TAMANOS = [10, 25, 50, 100, 200];
  const TAMANO_DEFECTO = 25;

  const ICONO_PREV = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICONO_NEXT = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const esc = (texto) =>
    String(texto ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  // El localStorage puede no estar (modo privado, datos bloqueados): se ignora.
  function leerTamano(clave) {
    try {
      const guardado = Number(localStorage.getItem(`paginacion:${clave}`));
      return TAMANOS.includes(guardado) ? guardado : TAMANO_DEFECTO;
    } catch {
      return TAMANO_DEFECTO;
    }
  }

  function guardarTamano(clave, tamano) {
    try {
      localStorage.setItem(`paginacion:${clave}`, String(tamano));
    } catch {
      // sin persistencia: se usa el tamaño sólo en esta sesión
    }
  }

  // Última página vista por listado: las pantallas repintan su panel entero tras
  // cada alta/edición y así el usuario no vuelve a la página 1.
  const ultimasPaginas = new Map();

  const mediaMovil = window.matchMedia("(max-width: 640px)");

  // tui siempre genera los botones primera/última página; acá no se muestran.
  const OCULTO = '<span hidden></span>';

  const etiquetaFlecha = (type) => (type === "prev" ? "Página anterior" : "Página siguiente");

  // tui acepta strings con {{page}} o funciones que reciben el contexto.
  const plantillas = {
    page: '<a href="#" class="pg-btn" aria-label="Página {{page}}">{{page}}</a>',
    currentPage: '<strong class="pg-btn pg-actual" aria-current="page">{{page}}</strong>',
    moveButton: ({ type }) => type === "first" || type === "last" ? OCULTO : `<a href="#" class="pg-btn pg-flecha" aria-label="${etiquetaFlecha(type)}">${type === "prev" ? ICONO_PREV : ICONO_NEXT}</a>`,
    disabledMoveButton: ({ type }) => type === "first" || type === "last" ? OCULTO : `<span class="pg-btn pg-flecha is-disabled" aria-disabled="true" aria-label="${etiquetaFlecha(type)}">${type === "prev" ? ICONO_PREV : ICONO_NEXT}</span>`,
    moreButton: '<a href="#" class="pg-btn pg-mas" aria-label="Más páginas">…</a>',
  };

  function crearListadoPaginado({ contenedor, clave, columnas, renderFila, vacio = "", acciones = {}, onFila, onRender }) {
    if (!contenedor) throw new Error("crearListadoPaginado: falta el contenedor");

    const estado = { items: [], pagina: ultimasPaginas.get(clave) || 1, tamano: leerTamano(clave), paginadores: [] };

    contenedor.classList.add("listado");
    contenedor.innerHTML = `
      <div class="listado-vacio" hidden></div>
      <div class="listado-contenido" hidden>
        <div class="listado-barra">
          <label class="listado-tamano">
            <span>Mostrar</span>
            <select class="listado-select" aria-label="Ítems por página">
              ${TAMANOS.map((n) => `<option value="${n}">${n}</option>`).join("")}
            </select>
          </label>
          <span class="listado-contador" aria-live="polite"></span>
          <nav class="paginador" aria-label="Paginación"></nav>
        </div>
        <div class="tabla-wrap">
          <table class="tabla">
            <thead><tr>${columnas.map((c) => `<th scope="col" class="${esc(c.clase || "")}">${esc(c.titulo)}</th>`).join("")}</tr></thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="listado-barra listado-barra-pie">
          <span class="listado-contador"></span>
          <nav class="paginador" aria-label="Paginación inferior"></nav>
        </div>
      </div>`;

    const $vacio = contenedor.querySelector(".listado-vacio");
    const $contenido = contenedor.querySelector(".listado-contenido");
    const $tbody = contenedor.querySelector("tbody");
    const $select = contenedor.querySelector(".listado-select");
    const $contadores = contenedor.querySelectorAll(".listado-contador");
    let navs = [...contenedor.querySelectorAll(".paginador")];
    $select.value = String(estado.tamano);

    const totalPaginas = () => Math.max(1, Math.ceil(estado.items.length / estado.tamano));

    function pintarPagina() {
      ultimasPaginas.set(clave, estado.pagina);
      const desde = (estado.pagina - 1) * estado.tamano;
      const pagina = estado.items.slice(desde, desde + estado.tamano);

      $tbody.innerHTML = pagina.map((item, i) => {
        const fila = renderFila(item, desde + i);
        const celdas = Array.isArray(fila) ? fila : fila.celdas;
        const clase = Array.isArray(fila) ? "" : fila.clase || "";
        return `<tr data-idx="${desde + i}" class="${esc(clase)}${onFila ? " clickeable" : ""}">${celdas.map((html, c) =>
          `<td data-label="${esc(columnas[c]?.titulo || "")}" class="${esc(columnas[c]?.clase || "")}">${html}</td>`).join("")}</tr>`;
      }).join("");

      const texto = `${desde + 1}–${desde + pagina.length} de ${estado.items.length}`;
      $contadores.forEach((el) => { el.textContent = texto; });
      onRender?.($tbody, pagina);
    }

    // tui 3.x no tiene destroy(): para no acumular listeners se reemplaza el
    // <nav> por uno nuevo cada vez que se recrean los paginadores.
    function reiniciarNavs() {
      navs = navs.map((nav) => {
        const nuevo = nav.cloneNode(false);
        nav.replaceWith(nuevo);
        return nuevo;
      });
      estado.paginadores = [];
    }

    // tui conoce una sola página a la vez: se recrean ambos paginadores cuando
    // cambia el total o el tamaño, y se sincronizan al moverse.
    function montarPaginadores() {
      reiniciarNavs();
      const unaSola = totalPaginas() === 1;
      navs.forEach((nav) => { nav.hidden = unaSola; });
      if (unaSola) return;

      estado.paginadores = navs.map((nav) => {
        const pag = new tui.Pagination(nav, {
          totalItems: estado.items.length,
          itemsPerPage: estado.tamano,
          visiblePages: mediaMovil.matches ? 3 : 5,
          page: estado.pagina,
          centerAlign: true,
          usageStatistics: false,
          template: plantillas,
        });
        pag.on("afterMove", ({ page }) => {
          if (page === estado.pagina) return; // eco del otro paginador
          estado.pagina = page;
          estado.paginadores.forEach((otro) => { if (otro !== pag) otro.movePageTo(page); });
          pintarPagina();
        });
        // Los enlaces son <a href="#">: sin esto saltarían al inicio de la página.
        nav.addEventListener("click", (e) => { if (e.target.closest("a.pg-btn")) e.preventDefault(); });
        return pag;
      });
    }

    function render() {
      const hay = estado.items.length > 0;
      $vacio.hidden = hay;
      $contenido.hidden = !hay;
      if (!hay) {
        $vacio.innerHTML = typeof vacio === "function" ? vacio() : vacio;
        reiniciarNavs();
        return;
      }
      pintarPagina();
      montarPaginadores();
    }

    $select.addEventListener("change", () => {
      // Se conserva el primer ítem visible para no perder el contexto.
      const primero = (estado.pagina - 1) * estado.tamano;
      estado.tamano = Number($select.value);
      guardarTamano(clave, estado.tamano);
      estado.pagina = Math.min(totalPaginas(), Math.floor(primero / estado.tamano) + 1);
      render();
    });

    // Delegación: un solo listener por tabla, vale para cualquier página.
    $tbody.addEventListener("click", (e) => {
      const fila = e.target.closest("tr[data-idx]");
      if (!fila) return;
      const item = estado.items[Number(fila.dataset.idx)];
      for (const [selector, manejador] of Object.entries(acciones)) {
        const el = e.target.closest(selector);
        if (el && fila.contains(el)) {
          manejador(el, item, e);
          return;
        }
      }
      if (onFila && !e.target.closest("a, button, input, select, label")) onFila(item, e);
    });

    return {
      setItems(items, { mantenerPagina = false } = {}) {
        estado.items = Array.isArray(items) ? items : [];
        estado.pagina = mantenerPagina ? Math.min(estado.pagina, totalPaginas()) : 1;
        render();
      },
      /** Vuelve a pintar la página actual (p. ej. cambió un dato de una fila). */
      refrescar() {
        if (estado.items.length) pintarPagina();
      },
      get items() {
        return estado.items;
      },
    };
  }

  // Iniciales para los avatares ("María Pérez" → "MP"): estaba duplicado en index.js.
  function inicialesDe(nombre) {
    return String(nombre || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }

  window.crearListadoPaginado = crearListadoPaginado;
  window.inicialesDe = inicialesDe;
})();
