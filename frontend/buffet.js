const buffetState = {
  categories: [],
  units: [],
  suppliers: [],
  products: [],
  combos: [],
  budgets: [],
  sales: [],
  salesSummary: { sales_count: 0, total_amount: 0 },
  salesFilters: { from: "", to: "", event: "" },
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
  const [meta, products, combos, budgets, sales] = await Promise.all([
    apiGet("/api/buffet/meta"),
    apiGet("/api/buffet/products"),
    apiGet("/api/buffet/combos"),
    apiGet("/api/buffet/budgets"),
    apiGet(`/api/buffet/sales${salesQueryString()}`),
  ]);
  buffetState.categories = meta.categories || [];
  buffetState.units = meta.units || [];
  buffetState.suppliers = meta.suppliers || [];
  buffetState.products = products || [];
  buffetState.combos = combos || [];
  buffetState.budgets = budgets || [];
  buffetState.sales = sales.sales || [];
  buffetState.salesSummary = sales.summary || { sales_count: 0, total_amount: 0 };
  renderDashboard();
  renderProducts();
  renderSales();
  renderCombos();
  renderBudgets();
}

function salesQueryString() {
  const params = new URLSearchParams();
  const { from, to, event } = buffetState.salesFilters;
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (event) params.set("event", event);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
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

// ─────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────

function renderDashboard() {
  document.getElementById("dashboard-stats").innerHTML = `
    <div class="stat"><strong>${buffetState.products.length}</strong><span>Productos</span></div>
    <div class="stat"><strong>$${Number(buffetState.salesSummary.total_amount || 0).toFixed(2)}</strong><span>Vendido (período)</span></div>
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
// Ventas
// ─────────────────────────────────────────────────────────

function renderSales() {
  const panel = document.getElementById("panel-ventas");
  const { from, to, event } = buffetState.salesFilters;
  panel.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Ventas</h2>
        <small>Registrá lo vendido en cada evento y cerrá la caja del período.</small>
      </div>
      <button class="btn-main" id="btn-nueva-venta" type="button">Nueva venta</button>
    </div>

    <div class="filters">
      <div class="form-group">
        <label class="form-label" for="filter-from">Desde</label>
        <input class="form-input" id="filter-from" type="date" value="${from}">
      </div>
      <div class="form-group">
        <label class="form-label" for="filter-to">Hasta</label>
        <input class="form-input" id="filter-to" type="date" value="${to}">
      </div>
      <div class="form-group">
        <label class="form-label" for="filter-event">Evento</label>
        <input class="form-input" id="filter-event" type="text" value="${escapeHtml(event)}" placeholder="Ej: Feria del plato">
      </div>
      <button class="btn-sec" id="btn-limpiar-filtros" type="button">Limpiar</button>
    </div>

    <div class="summary-line">
      <div><strong>${buffetState.salesSummary.sales_count}</strong> ventas</div>
      <div><strong>$${Number(buffetState.salesSummary.total_amount || 0).toFixed(2)}</strong> recaudado</div>
    </div>

    <div class="list">
      ${buffetState.sales.map((s) => `
        <div class="row row-sale">
          <div>
            <strong>${escapeHtml(s.event_name || "Venta sin evento")}</strong><br>
            <small>${escapeHtml(s.sale_date)} · ${escapeHtml(s.payment_method || "")}</small>
          </div>
          <div><small>Ítems</small><br>${s.items_count}</div>
          <div><small>Detalle</small><br><small>${escapeHtml(s.items.map((i) => `${Number(i.quantity)}× ${i.description}`).join(", ")) || "—"}</small></div>
          <div><small>Total</small><br>$${Number(s.total_amount || 0).toFixed(2)}</div>
          <div class="row-actions">
            <button class="btn-sec" data-delete-sale="${s.id}" type="button">Eliminar</button>
          </div>
        </div>`).join("") || "<p>No hay ventas registradas en este período.</p>"}
    </div>
  `;

  document.getElementById("btn-nueva-venta").addEventListener("click", () => openSaleForm());

  const applyFilters = () => {
    buffetState.salesFilters = {
      from: field(panel, "filter-from").value,
      to: field(panel, "filter-to").value,
      event: field(panel, "filter-event").value.trim(),
    };
    loadBuffet().catch((e) => alert(e.message));
  };
  ["filter-from", "filter-to", "filter-event"].forEach((id) => field(panel, id).addEventListener("change", applyFilters));
  document.getElementById("btn-limpiar-filtros").addEventListener("click", () => {
    buffetState.salesFilters = { from: "", to: "", event: "" };
    loadBuffet().catch((e) => alert(e.message));
  });

  panel.querySelectorAll("[data-delete-sale]").forEach((btn) => btn.addEventListener("click", () => deleteSale(btn.dataset.deleteSale)));
}

function deleteSale(id) {
  if (!confirm("¿Eliminar esta venta? Se devolverá el stock descontado.")) return;
  apiSend(`/api/buffet/sales/${id}`, "DELETE", {}).then(loadBuffet).catch((e) => alert(e.message));
}

function openSaleForm() {
  const cart = [];
  const today = new Date().toISOString().slice(0, 10);

  const sellableOptions = [
    ...buffetState.products.filter((p) => p.active).map((p) => ({ key: `p:${p.id}`, name: p.name, price: p.sale_price })),
    ...buffetState.combos.filter((c) => c.active).map((c) => ({ key: `c:${c.id}`, name: `Combo · ${c.name}`, price: c.sale_price })),
  ];

  const renderCart = (modal) => {
    const total = cart.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
    field(modal, "sale-cart").innerHTML = cart.map((item, index) => `
      <div class="sale-item-row">
        <span>${escapeHtml(item.description)}</span>
        <span>${item.quantity} × $${item.unit_price.toFixed(2)}</span>
        <strong>$${(item.quantity * item.unit_price).toFixed(2)}</strong>
        <button class="btn-sec" type="button" data-remove-item="${index}">Quitar</button>
      </div>
    `).join("") || '<p class="empty-cart">Todavía no agregaste ítems.</p>';
    field(modal, "sale-total").textContent = `$${total.toFixed(2)}`;
    modal.querySelectorAll("[data-remove-item]").forEach((btn) => btn.addEventListener("click", () => {
      cart.splice(Number(btn.dataset.removeItem), 1);
      renderCart(modal);
    }));
  };

  openModal({
    title: "Nueva venta",
    submitLabel: "Registrar venta",
    bodyHtml: `
      <div class="grid cols-2">
        <div class="form-group">
          <label class="form-label" for="sale-date">Fecha</label>
          <input class="form-input" id="sale-date" type="date" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label" for="sale-payment">Método de pago</label>
          <select class="form-select" id="sale-payment">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="sale-event">Evento</label>
        <input class="form-input" id="sale-event" type="text" placeholder="Ej: Feria del plato de agosto">
      </div>

      <div class="form-group">
        <label class="form-label">Ítems</label>
        <div class="sale-picker">
          <select class="form-select" id="sale-pick">
            <option value="">Elegí un producto o combo</option>
            ${sellableOptions.map((o) => `<option value="${o.key}">${escapeHtml(o.name)}</option>`).join("")}
          </select>
          <input class="form-input" id="sale-qty" type="number" step="0.01" min="0" value="1" placeholder="Cant.">
          <input class="form-input" id="sale-price" type="number" step="0.01" min="0" value="0" placeholder="Precio">
          <button class="btn-sec" type="button" id="sale-add">Agregar</button>
        </div>
      </div>

      <div id="sale-cart" class="sale-cart"></div>
      <div class="sale-total-row">Total: <strong id="sale-total">$0.00</strong></div>

      <div class="form-group">
        <label class="form-label" for="sale-obs">Observación</label>
        <input class="form-input" id="sale-obs" type="text">
      </div>
    `,
    onReady: (modal) => {
      renderCart(modal);

      // Autocompleta el precio con el de lista, pero se puede editar a mano.
      field(modal, "sale-pick").addEventListener("change", (e) => {
        const option = sellableOptions.find((o) => o.key === e.target.value);
        field(modal, "sale-price").value = Number(option?.price ?? 0);
      });

      field(modal, "sale-add").addEventListener("click", () => {
        const key = field(modal, "sale-pick").value;
        const option = sellableOptions.find((o) => o.key === key);
        if (!option) return alert("Elegí un producto o combo.");
        const quantity = Number(field(modal, "sale-qty").value) || 0;
        if (quantity <= 0) return alert("La cantidad debe ser mayor a cero.");
        const [kind, id] = key.split(":");
        cart.push({
          product_id: kind === "p" ? id : null,
          combo_id: kind === "c" ? id : null,
          description: option.name,
          quantity,
          unit_price: Number(field(modal, "sale-price").value) || 0,
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
        sale_date: field(modal, "sale-date").value || today,
        event_name: field(modal, "sale-event").value.trim() || null,
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
