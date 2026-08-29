const buffetState = {
  categories: [],
  units: [],
  suppliers: [],
  products: [],
  combos: [],
  budgets: [],
  events: [],
  eventsFilter: "",
  // Evento abierto: cuando está seteado la pestaña Ventas muestra su detalle.
  currentEvent: null,
  sales: [],
  salesSummary: { sales_count: 0, total_amount: 0 },
};

function initBuffet() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setBuffetTab(btn.dataset.tab));
  });
  document.getElementById("btn-logout").addEventListener("click", () => window.supabaseClient?.auth.signOut());
  document.getElementById("buffet-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "buffet-modal-overlay") closeModal();
  });
  loadBuffet();
}

function setBuffetTab(tab) {
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${tab}`));
}

async function loadBuffet() {
  // Las ventas se piden sólo del evento abierto: sin evento no hace falta
  // traerse todo el histórico.
  const eventId = buffetState.currentEvent?.id;
  const [meta, products, combos, budgets, events, sales] = await Promise.all([
    apiGet("/api/buffet/meta"),
    apiGet("/api/buffet/products"),
    apiGet("/api/buffet/combos"),
    apiGet("/api/buffet/budgets"),
    apiGet("/api/buffet/events"),
    eventId ? apiGet(`/api/buffet/sales?event_id=${encodeURIComponent(eventId)}`) : Promise.resolve({}),
  ]);
  buffetState.categories = meta.categories || [];
  buffetState.units = meta.units || [];
  buffetState.suppliers = meta.suppliers || [];
  buffetState.products = products || [];
  buffetState.combos = combos || [];
  buffetState.budgets = budgets || [];
  buffetState.events = events || [];
  buffetState.sales = sales.sales || [];
  buffetState.salesSummary = sales.summary || { sales_count: 0, total_amount: 0 };
  // Refrescar el evento abierto para que su total quede al día (o cerrarlo si
  // lo borraron desde otro lado).
  if (eventId) buffetState.currentEvent = buffetState.events.find((e) => e.id === eventId) || null;
  renderDashboard();
  renderProducts();
  renderSales();
  renderCombos();
  renderBudgets();
}

async function apiGet(path, options = {}) {
  const res = await window.apiFetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiSend(path, method, body) {
  const res = await window.apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json()).error || "Error");
  return res.json();
}

// ─────────────────────────────────────────────────────────
// Modal reutilizable (reemplaza los prompt() encadenados)
// ─────────────────────────────────────────────────────────

/**
 * Abre el modal con el HTML de campos dado. onSubmit recibe el elemento del
 * modal y debe devolver una promesa; si resuelve, el modal se cierra.
 * onReady permite enganchar listeners sobre el contenido recién pintado.
 */
function openModal({ title, bodyHtml, submitLabel = "Guardar", onSubmit, onReady }) {
  const overlay = document.getElementById("buffet-modal-overlay");
  const modal = document.getElementById("buffet-modal");
  modal.innerHTML = `
    <div class="modal-title">${escapeHtml(title)}</div>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-error" id="modal-error" hidden></div>
    <div class="modal-actions">
      <button class="btn-sec" type="button" id="modal-cancel">Cancelar</button>
      <button class="btn-main" type="button" id="modal-submit">${escapeHtml(submitLabel)}</button>
    </div>
  `;
  overlay.classList.add("open");

  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-submit").addEventListener("click", async () => {
    const btn = document.getElementById("modal-submit");
    btn.disabled = true;
    try {
      await onSubmit(modal);
      closeModal();
    } catch (error) {
      const box = document.getElementById("modal-error");
      box.textContent = error.message;
      box.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  if (onReady) onReady(modal);
}

function closeModal() {
  document.getElementById("buffet-modal-overlay").classList.remove("open");
  document.getElementById("buffet-modal").innerHTML = "";
}

function optionsHtml(items, selectedId, emptyLabel) {
  return `<option value="">${escapeHtml(emptyLabel)}</option>` + items
    .map((item) => `<option value="${item.id}"${item.id === selectedId ? " selected" : ""}>${escapeHtml(item.name)}</option>`)
    .join("");
}

function field(root, id) {
  return root.querySelector(`#${id}`);
}

/** Los importes se manejan en pesos enteros: no hay centavos en la feria. */
function formatMoney(amount) {
  return `$${Math.round(Number(amount) || 0).toLocaleString("es-AR")}`;
}

function formatDate(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return d ? `${d}/${m}/${y}` : String(iso || "");
}

/**
 * Input numérico con botones de − / +. Se usa para cantidades (paso 1) y para
 * precios (paso 50), siempre en enteros.
 */
function stepperHtml(id, { value, step, min = 0, label = "" }) {
  return `
    <div class="stepper" data-stepper="${id}" data-step="${step}" data-min="${min}">
      <button class="stepper-btn" type="button" data-step-dir="-1" aria-label="Restar ${label}">−</button>
      <input class="form-input" id="${id}" type="number" inputmode="numeric" step="${step}" min="${min}" value="${value}">
      <button class="stepper-btn" type="button" data-step-dir="1" aria-label="Sumar ${label}">+</button>
    </div>
  `;
}

/** Engancha los botones y fuerza enteros aunque se escriba a mano. */
function bindStepper(modal, id) {
  const wrap = modal.querySelector(`[data-stepper="${id}"]`);
  if (!wrap) return;
  const input = field(modal, id);
  const step = Number(wrap.dataset.step) || 1;
  const min = Number(wrap.dataset.min) || 0;
  const normalize = () => {
    input.value = Math.max(min, Math.round(Number(input.value) || min));
  };
  input.addEventListener("blur", normalize);
  wrap.querySelectorAll("[data-step-dir]").forEach((btn) => btn.addEventListener("click", () => {
    const current = Math.round(Number(input.value) || min);
    input.value = Math.max(min, current + step * Number(btn.dataset.stepDir));
  }));
}

// ─────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────

function renderDashboard() {
  const recaudado = buffetState.events.reduce((acc, e) => acc + Number(e.total_amount || 0), 0);
  document.getElementById("dashboard-stats").innerHTML = `
    <div class="stat"><strong>${buffetState.products.length}</strong><span>Productos</span></div>
    <div class="stat"><strong>${buffetState.events.length}</strong><span>Eventos</span></div>
    <div class="stat"><strong>${formatMoney(recaudado)}</strong><span>Recaudado</span></div>
    <div class="stat"><strong>${buffetState.combos.length}</strong><span>Combos</span></div>
    <div class="stat"><strong>${buffetState.budgets.length}</strong><span>Presupuestos</span></div>
  `;
}

// ─────────────────────────────────────────────────────────
// Productos
// ─────────────────────────────────────────────────────────

function renderProducts() {
  const panel = document.getElementById("panel-productos");
  panel.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Productos</h2>
        <small>Alta, edición y baja. Los productos donados no necesitan costo ni proveedor.</small>
      </div>
      <button class="btn-main" id="btn-nuevo-producto" type="button">Nuevo producto</button>
    </div>
    <div class="list">
      ${buffetState.products.map((p) => `
        <div class="row">
          <div>
            <strong>${escapeHtml(p.name)}</strong>${p.is_donated ? '<span class="chip">Donado</span>' : ""}<br>
            <small>${escapeHtml(p.category_name || "Sin categoría")} · ${escapeHtml(p.unit_name || "Sin unidad")}</small>
          </div>
          <div><small>Precio</small><br>$${Number(p.sale_price || 0).toFixed(2)}</div>
          <div><small>Stock</small><br>${Number(p.stock_current || 0)}</div>
          <div><small>Estado</small><br>${p.active ? "Activo" : "Inactivo"}</div>
          <div class="row-actions">
            <button class="btn-sec" data-edit-product="${p.id}" type="button">Editar</button>
            <button class="btn-sec" data-delete-product="${p.id}" type="button">Eliminar</button>
          </div>
        </div>`).join("") || "<p>No hay productos cargados.</p>"}
    </div>
  `;
  document.getElementById("btn-nuevo-producto").addEventListener("click", () => openProductForm());
  panel.querySelectorAll("[data-edit-product]").forEach((btn) => btn.addEventListener("click", () => openProductForm(buffetState.products.find((p) => p.id === btn.dataset.editProduct))));
  panel.querySelectorAll("[data-delete-product]").forEach((btn) => btn.addEventListener("click", () => deleteProduct(btn.dataset.deleteProduct)));
}

function openProductForm(product = null) {
  openModal({
    title: product ? "Editar producto" : "Nuevo producto",
    bodyHtml: `
      <div class="form-group">
        <label class="form-label" for="prod-name">Nombre *</label>
        <input class="form-input" id="prod-name" type="text" value="${escapeHtml(product?.name || "")}" placeholder="Ej: Empanada de carne">
      </div>
      <div class="grid cols-2">
        <div class="form-group">
          <label class="form-label" for="prod-category">Categoría</label>
          <select class="form-select" id="prod-category">${optionsHtml(buffetState.categories, product?.category_id, "Sin categoría")}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="prod-unit">Unidad</label>
          <select class="form-select" id="prod-unit">${optionsHtml(buffetState.units, product?.unit_id, "Sin unidad")}</select>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="form-group">
          <label class="form-label" for="prod-price">Precio de venta</label>
          <input class="form-input" id="prod-price" type="number" step="0.01" min="0" value="${Number(product?.sale_price ?? 0)}">
        </div>
        <div class="form-group">
          <label class="form-label" for="prod-stock">Stock</label>
          <input class="form-input" id="prod-stock" type="number" step="0.01" value="${Number(product?.stock_current ?? 0)}">
        </div>
      </div>
      <label class="check-line">
        <input type="checkbox" id="prod-donated"${product?.is_donated ? " checked" : ""}>
        <span>Producto donado (sin costo ni proveedor)</span>
      </label>
      <div class="form-group">
        <label class="form-label" for="prod-obs">Observación</label>
        <input class="form-input" id="prod-obs" type="text" value="${escapeHtml(product?.observation || "")}">
      </div>
    `,
    onSubmit: async (modal) => {
      const name = field(modal, "prod-name").value.trim();
      if (!name) throw new Error("El nombre es obligatorio.");
      const payload = {
        name,
        category_id: field(modal, "prod-category").value || null,
        unit_id: field(modal, "prod-unit").value || null,
        sale_price: Number(field(modal, "prod-price").value) || 0,
        stock_current: Number(field(modal, "prod-stock").value) || 0,
        is_donated: field(modal, "prod-donated").checked,
        observation: field(modal, "prod-obs").value.trim() || null,
        active: true,
      };
      const method = product ? "PATCH" : "POST";
      const path = product ? `/api/buffet/products/${product.id}` : "/api/buffet/products";
      await apiSend(path, method, payload);
      await loadBuffet();
    },
  });
}

function deleteProduct(id) {
  if (!confirm("¿Eliminar este producto?")) return;
  apiSend(`/api/buffet/products/${id}`, "DELETE", {}).then(loadBuffet).catch((e) => alert(e.message));
}

// ─────────────────────────────────────────────────────────
// Eventos y ventas
//
// La pestaña "Ventas" tiene dos vistas: el listado de eventos y, al entrar a
// uno, su detalle con las ventas cargadas. currentEvent decide cuál se pinta.
// ─────────────────────────────────────────────────────────

function renderSales() {
  if (buffetState.currentEvent) renderEventDetail();
  else renderEventsList();
}

function openEvent(evento) {
  buffetState.currentEvent = evento;
  loadBuffet().catch((e) => alert(e.message));
}

function closeEvent() {
  buffetState.currentEvent = null;
  buffetState.sales = [];
  loadBuffet().catch((e) => alert(e.message));
}

function renderEventsList() {
  const panel = document.getElementById("panel-ventas");
  const filtro = buffetState.eventsFilter.toLowerCase();
  const eventos = filtro
    ? buffetState.events.filter((e) => e.nombre.toLowerCase().includes(filtro))
    : buffetState.events;

  panel.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Ventas</h2>
        <small>Creá un evento y cargale las ventas de a una, a medida que se cobran.</small>
      </div>
      <button class="btn-main" id="btn-nuevo-evento" type="button">Nuevo evento</button>
    </div>

    <div class="filters">
      <div class="form-group">
        <label class="form-label" for="filter-eventos">Buscar evento</label>
        <input class="form-input" id="filter-eventos" type="text" value="${escapeHtml(buffetState.eventsFilter)}" placeholder="Ej: Feria del plato">
      </div>
    </div>

    <div class="list">
      ${eventos.map((e) => `
        <div class="row row-event" data-open-event="${e.id}">
          <div>
            <strong>${escapeHtml(e.nombre)}</strong><br>
            <small>${formatDate(e.fecha)}${e.estado === "cerrado" ? " · cerrado" : ""}</small>
          </div>
          <div><small>Ventas</small><br>${e.sales_count}</div>
          <div><small>Recaudado</small><br>${formatMoney(e.total_amount)}</div>
          <div class="row-actions">
            <button class="btn-sec" type="button" data-open-event-btn="${e.id}">Abrir</button>
            <button class="btn-sec" type="button" data-delete-event="${e.id}">Eliminar</button>
          </div>
        </div>`).join("") || `<p>${filtro ? "Ningún evento coincide con la búsqueda." : "Todavía no creaste ningún evento."}</p>`}
    </div>
  `;

  document.getElementById("btn-nuevo-evento").addEventListener("click", () => openEventForm());

  const buscador = field(panel, "filter-eventos");
  buscador.addEventListener("input", () => {
    buffetState.eventsFilter = buscador.value.trim();
    renderEventsList();
    // Re-pintar el panel destruye el input: hay que devolverle el foco.
    const nuevo = field(panel, "filter-eventos");
    nuevo.focus();
    nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length);
  });

  panel.querySelectorAll("[data-open-event]").forEach((row) => row.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-delete-event]")) return;
    const evento = buffetState.events.find((e) => e.id === row.dataset.openEvent);
    if (evento) openEvent(evento);
  }));

  panel.querySelectorAll("[data-delete-event]").forEach((btn) => btn.addEventListener("click", () => deleteEvent(btn.dataset.deleteEvent)));
}

function renderEventDetail() {
  const panel = document.getElementById("panel-ventas");
  const evento = buffetState.currentEvent;

  panel.innerHTML = `
    <div class="event-header">
      <div>
        <button class="btn-sec" id="btn-volver-eventos" type="button">← Volver</button>
      </div>
      <div class="event-header-title">
        <strong>${escapeHtml(evento.nombre)}</strong>
        <small>${formatDate(evento.fecha)} · ${buffetState.salesSummary.sales_count} ventas</small>
      </div>
      <div class="event-header-total">
        <small>Recaudado</small><br>
        <strong>${formatMoney(buffetState.salesSummary.total_amount)}</strong>
      </div>
    </div>

    <div class="toolbar">
      <div>
        <h2>Ventas del evento</h2>
        <small>Cada venta es un cobro: cargá los ítems, aceptá y seguí con la siguiente.</small>
      </div>
      <div class="row-actions">
        <button class="btn-sec" id="btn-editar-evento" type="button">Editar evento</button>
        <button class="btn-main" id="btn-nueva-venta" type="button">Nueva venta</button>
      </div>
    </div>

    <div class="list">
      ${buffetState.sales.map((s, index) => `
        <div class="row row-sale">
          <div>
            <strong>Venta ${buffetState.sales.length - index}</strong><br>
            <small>${escapeHtml(s.payment_method || "")}</small>
          </div>
          <div><small>Ítems</small><br>${s.items_count}</div>
          <div><small>Detalle</small><br><small>${escapeHtml(s.items.map((i) => `${Number(i.quantity)}× ${i.description}`).join(", ")) || "—"}</small></div>
          <div><small>Total</small><br>${formatMoney(s.total_amount)}</div>
          <div class="row-actions">
            <button class="btn-sec" data-delete-sale="${s.id}" type="button">Eliminar</button>
          </div>
        </div>`).join("") || "<p>Todavía no hay ventas en este evento.</p>"}
    </div>
  `;

  document.getElementById("btn-volver-eventos").addEventListener("click", closeEvent);
  document.getElementById("btn-editar-evento").addEventListener("click", () => openEventForm(evento));
  document.getElementById("btn-nueva-venta").addEventListener("click", () => openSaleForm(evento));
  panel.querySelectorAll("[data-delete-sale]").forEach((btn) => btn.addEventListener("click", () => deleteSale(btn.dataset.deleteSale)));
}

function openEventForm(evento = null) {
  const hoy = new Date().toISOString().slice(0, 10);
  openModal({
    title: evento ? "Editar evento" : "Nuevo evento",
    submitLabel: evento ? "Guardar" : "Crear evento",
    bodyHtml: `
      <div class="form-group">
        <label class="form-label" for="event-name">Nombre *</label>
        <input class="form-input" id="event-name" type="text" value="${escapeHtml(evento?.nombre || "")}" placeholder="Ej: Feria del Plato">
      </div>
      <div class="grid cols-2">
        <div class="form-group">
          <label class="form-label" for="event-date">Fecha</label>
          <input class="form-input" id="event-date" type="date" value="${evento?.fecha || hoy}">
        </div>
        <div class="form-group">
          <label class="form-label" for="event-status">Estado</label>
          <select class="form-select" id="event-status">
            ${["abierto", "cerrado"].map((s) => `<option value="${s}"${(evento?.estado || "abierto") === s ? " selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="event-obs">Observación</label>
        <input class="form-input" id="event-obs" type="text" value="${escapeHtml(evento?.observacion || "")}">
      </div>
    `,
    onSubmit: async (modal) => {
      const nombre = field(modal, "event-name").value.trim();
      if (!nombre) throw new Error("El nombre del evento es obligatorio.");
      const payload = {
        nombre,
        fecha: field(modal, "event-date").value || hoy,
        estado: field(modal, "event-status").value,
        observacion: field(modal, "event-obs").value.trim() || null,
      };
      if (evento) {
        await apiSend(`/api/buffet/events/${evento.id}`, "PATCH", payload);
      } else {
        // Se entra directo al evento recién creado para cargar la primera venta.
        const creado = await apiSend("/api/buffet/events", "POST", payload);
        buffetState.currentEvent = creado;
      }
      await loadBuffet();
    },
  });
}

function deleteEvent(id) {
  if (!confirm("¿Eliminar este evento?")) return;
  apiSend(`/api/buffet/events/${id}`, "DELETE", {}).then(loadBuffet).catch((e) => alert(e.message));
}

function deleteSale(id) {
  if (!confirm("¿Eliminar esta venta? Se devolverá el stock descontado.")) return;
  apiSend(`/api/buffet/sales/${id}`, "DELETE", {}).then(loadBuffet).catch((e) => alert(e.message));
}

function openSaleForm(evento) {
  const cart = [];

  const sellableOptions = [
    ...buffetState.products.filter((p) => p.active).map((p) => ({ key: `p:${p.id}`, name: p.name, price: p.sale_price })),
    ...buffetState.combos.filter((c) => c.active).map((c) => ({ key: `c:${c.id}`, name: `Combo · ${c.name}`, price: c.sale_price })),
  ];

  const renderCart = (modal) => {
    const total = cart.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
    field(modal, "sale-cart").innerHTML = cart.map((item, index) => `
      <div class="sale-item-row">
        <span>${escapeHtml(item.description)}</span>
        <span>${item.quantity} × ${formatMoney(item.unit_price)}</span>
        <strong>${formatMoney(item.quantity * item.unit_price)}</strong>
        <button class="btn-sec" type="button" data-remove-item="${index}">Quitar</button>
      </div>
    `).join("") || '<p class="empty-cart">Todavía no agregaste ítems.</p>';
    field(modal, "sale-total").textContent = formatMoney(total);
    modal.querySelectorAll("[data-remove-item]").forEach((btn) => btn.addEventListener("click", () => {
      cart.splice(Number(btn.dataset.removeItem), 1);
      renderCart(modal);
    }));
  };

  openModal({
    title: "Nueva venta",
    submitLabel: "Registrar venta",
    bodyHtml: `
      <p class="sale-event-line">Evento: <strong>${escapeHtml(evento.nombre)}</strong> · ${formatDate(evento.fecha)}</p>

      <div class="form-group">
        <label class="form-label" for="sale-payment">Método de pago</label>
        <select class="form-select" id="sale-payment">
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Ítems</label>
        <div class="sale-picker">
          <select class="form-select" id="sale-pick">
            <option value="">Elegí un producto o combo</option>
            ${sellableOptions.map((o) => `<option value="${o.key}">${escapeHtml(o.name)}</option>`).join("")}
          </select>
          <div class="picker-field">
            <span class="picker-label">Cantidad</span>
            ${stepperHtml("sale-qty", { value: 1, step: 1, min: 1, label: "cantidad" })}
          </div>
          <div class="picker-field">
            <span class="picker-label">Precio</span>
            ${stepperHtml("sale-price", { value: 0, step: 50, min: 0, label: "precio" })}
          </div>
          <button class="btn-add" type="button" id="sale-add">Agregar</button>
        </div>
      </div>

      <div id="sale-cart" class="sale-cart"></div>
      <div class="sale-total-row">Total: <strong id="sale-total">$0</strong></div>

      <div class="form-group">
        <label class="form-label" for="sale-obs">Observación</label>
        <input class="form-input" id="sale-obs" type="text">
      </div>
    `,
    onReady: (modal) => {
      renderCart(modal);
      bindStepper(modal, "sale-qty");
      bindStepper(modal, "sale-price");

      // Autocompleta el precio con el de lista, pero se puede editar a mano.
      field(modal, "sale-pick").addEventListener("change", (e) => {
        const option = sellableOptions.find((o) => o.key === e.target.value);
        field(modal, "sale-price").value = Math.round(Number(option?.price ?? 0));
      });

      field(modal, "sale-add").addEventListener("click", () => {
        const key = field(modal, "sale-pick").value;
        const option = sellableOptions.find((o) => o.key === key);
        if (!option) return alert("Elegí un producto o combo.");
        const quantity = Math.round(Number(field(modal, "sale-qty").value) || 0);
        if (quantity <= 0) return alert("La cantidad debe ser mayor a cero.");
        const unitPrice = Math.max(0, Math.round(Number(field(modal, "sale-price").value) || 0));
        const [kind, id] = key.split(":");

        // Mismo producto al mismo precio: se suma la cantidad en vez de repetir
        // la línea en el carrito.
        const existente = cart.find((i) =>
          i.product_id === (kind === "p" ? id : null) &&
          i.combo_id === (kind === "c" ? id : null) &&
          i.unit_price === unitPrice);
        if (existente) existente.quantity += quantity;
        else cart.push({
          product_id: kind === "p" ? id : null,
          combo_id: kind === "c" ? id : null,
          description: option.name,
          quantity,
          unit_price: unitPrice,
        });

        field(modal, "sale-pick").value = "";
        field(modal, "sale-qty").value = 1;
        field(modal, "sale-price").value = 0;
        renderCart(modal);
      });
    },
    onSubmit: async (modal) => {
      if (!cart.length) throw new Error("Agregá al menos un ítem a la venta.");
      await apiSend("/api/buffet/sales", "POST", {
        event_id: evento.id,
        payment_method: field(modal, "sale-payment").value,
        observation: field(modal, "sale-obs").value.trim() || null,
        items: cart,
      });
      await loadBuffet();
    },
  });
}

// ─────────────────────────────────────────────────────────
// Combos y presupuestos
// ─────────────────────────────────────────────────────────

function renderCombos() {
  document.getElementById("panel-combos").innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Combos</h2>
        <small>Armá productos agrupados y definí un precio único de venta.</small>
      </div>
      <button class="btn-main" id="btn-nuevo-combo" type="button">Nuevo combo</button>
    </div>
    <div class="list">${buffetState.combos.map((c) => `<div class="row"><div><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.description || "")}</small></div><div><small>Precio</small><br>$${Number(c.sale_price || 0).toFixed(2)}</div><div><small>Items</small><br>${c.items_count || 0}</div><div><small>Estado</small><br>${c.active ? "Activo" : "Inactivo"}</div><div class="row-actions"><button class="btn-sec" type="button" data-delete-combo="${c.id}">Eliminar</button></div></div>`).join("") || "<p>No hay combos cargados.</p>"}</div>
  `;
  document.getElementById("btn-nuevo-combo").addEventListener("click", () => openComboForm());
  document.querySelectorAll("[data-delete-combo]").forEach((btn) => btn.addEventListener("click", () => apiSend(`/api/buffet/combos/${btn.dataset.deleteCombo}`, "DELETE", {}).then(loadBuffet).catch((e) => alert(e.message))));
}

function openComboForm(combo = null) {
  openModal({
    title: combo ? "Editar combo" : "Nuevo combo",
    bodyHtml: `
      <div class="form-group">
        <label class="form-label" for="combo-name">Nombre *</label>
        <input class="form-input" id="combo-name" type="text" value="${escapeHtml(combo?.name || "")}">
      </div>
      <div class="form-group">
        <label class="form-label" for="combo-desc">Descripción</label>
        <input class="form-input" id="combo-desc" type="text" value="${escapeHtml(combo?.description || "")}">
      </div>
      <div class="form-group">
        <label class="form-label" for="combo-price">Precio de venta</label>
        <input class="form-input" id="combo-price" type="number" step="0.01" min="0" value="${Number(combo?.sale_price ?? 0)}">
      </div>
    `,
    onSubmit: async (modal) => {
      const name = field(modal, "combo-name").value.trim();
      if (!name) throw new Error("El nombre es obligatorio.");
      const payload = {
        name,
        description: field(modal, "combo-desc").value.trim() || null,
        sale_price: Number(field(modal, "combo-price").value) || 0,
        active: true,
      };
      const method = combo ? "PATCH" : "POST";
      const path = combo ? `/api/buffet/combos/${combo.id}` : "/api/buffet/combos";
      await apiSend(path, method, payload);
      await loadBuffet();
    },
  });
}

function renderBudgets() {
  document.getElementById("panel-presupuestos").innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Presupuestos</h2>
        <small>Presupuestos por producto o combo, calculados por cantidad.</small>
      </div>
      <button class="btn-main" id="btn-nuevo-presupuesto" type="button">Nuevo presupuesto</button>
    </div>
    <div class="list">${buffetState.budgets.map((b) => `<div class="row"><div><strong>${escapeHtml(b.title)}</strong><br><small>${escapeHtml(b.client_name || "")}</small></div><div><small>Total</small><br>$${Number(b.total_amount || 0).toFixed(2)}</div><div><small>Items</small><br>${b.items_count || 0}</div><div><small>Estado</small><br>${escapeHtml(b.status || "borrador")}</div><div class="row-actions"><button class="btn-sec" type="button" data-delete-budget="${b.id}">Eliminar</button></div></div>`).join("") || "<p>No hay presupuestos cargados.</p>"}</div>
  `;
  document.getElementById("btn-nuevo-presupuesto").addEventListener("click", () => openBudgetForm());
  document.querySelectorAll("[data-delete-budget]").forEach((btn) => btn.addEventListener("click", () => apiSend(`/api/buffet/budgets/${btn.dataset.deleteBudget}`, "DELETE", {}).then(loadBuffet).catch((e) => alert(e.message))));
}

function openBudgetForm(budget = null) {
  openModal({
    title: budget ? "Editar presupuesto" : "Nuevo presupuesto",
    bodyHtml: `
      <div class="form-group">
        <label class="form-label" for="budget-title">Título *</label>
        <input class="form-input" id="budget-title" type="text" value="${escapeHtml(budget?.title || "")}">
      </div>
      <div class="grid cols-2">
        <div class="form-group">
          <label class="form-label" for="budget-client">Cliente</label>
          <input class="form-input" id="budget-client" type="text" value="${escapeHtml(budget?.client_name || "")}">
        </div>
        <div class="form-group">
          <label class="form-label" for="budget-status">Estado</label>
          <select class="form-select" id="budget-status">
            ${["borrador", "enviado", "aprobado", "rechazado"].map((s) => `<option value="${s}"${(budget?.status || "borrador") === s ? " selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="budget-total">Total</label>
        <input class="form-input" id="budget-total" type="number" step="0.01" min="0" value="${Number(budget?.total_amount ?? 0)}">
      </div>
      <div class="form-group">
        <label class="form-label" for="budget-obs">Observación</label>
        <input class="form-input" id="budget-obs" type="text" value="${escapeHtml(budget?.observation || "")}">
      </div>
    `,
    onSubmit: async (modal) => {
      const title = field(modal, "budget-title").value.trim();
      if (!title) throw new Error("El título es obligatorio.");
      const payload = {
        title,
        client_name: field(modal, "budget-client").value.trim() || null,
        observation: field(modal, "budget-obs").value.trim() || null,
        status: field(modal, "budget-status").value,
        total_amount: Number(field(modal, "budget-total").value) || 0,
      };
      const method = budget ? "PATCH" : "POST";
      const path = budget ? `/api/buffet/budgets/${budget.id}` : "/api/buffet/budgets";
      await apiSend(path, method, payload);
      await loadBuffet();
    },
  });
}

function escapeHtml(text) {
  return String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

window.onAuthenticated = initBuffet;
