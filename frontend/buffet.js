const buffetState = {
  categories: [],
  units: [],
  suppliers: [],
  products: [],
  combos: [],
  budgets: [],
};

function initBuffet() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setBuffetTab(btn.dataset.tab));
  });
  document.getElementById("btn-logout").addEventListener("click", () => window.supabaseClient?.auth.signOut());
  loadBuffet();
}

function setBuffetTab(tab) {
  document.querySelectorAll(".tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${tab}`));
}

async function loadBuffet() {
  const [meta, products, combos, budgets] = await Promise.all([
    apiGet("/api/buffet/meta"),
    apiGet("/api/buffet/products"),
    apiGet("/api/buffet/combos"),
    apiGet("/api/buffet/budgets"),
  ]);
  buffetState.categories = meta.categories || [];
  buffetState.units = meta.units || [];
  buffetState.suppliers = meta.suppliers || [];
  buffetState.products = products || [];
  buffetState.combos = combos || [];
  buffetState.budgets = budgets || [];
  renderDashboard();
  renderProducts();
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

function renderDashboard() {
  document.getElementById("dashboard-stats").innerHTML = `
    <div class="stat"><strong>${buffetState.products.length}</strong><span>Productos</span></div>
    <div class="stat"><strong>${buffetState.combos.length}</strong><span>Combos</span></div>
    <div class="stat"><strong>${buffetState.budgets.length}</strong><span>Presupuestos</span></div>
  `;
}

function renderProducts() {
  const panel = document.getElementById("panel-productos");
  panel.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Productos</h2>
        <small>Alta, edición, baja lógica y costos por proveedor.</small>
      </div>
      <button class="btn-main" id="btn-nuevo-producto" type="button">Nuevo producto</button>
    </div>
    <div class="list">
      ${buffetState.products.map((p) => `
        <div class="row">
          <div>
            <strong>${escapeHtml(p.name)}</strong><br>
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
  const name = prompt("Nombre del producto", product?.name || "");
  if (!name) return;
  const payload = {
    name,
    category_id: product?.category_id || null,
    unit_id: product?.unit_id || null,
    stock_current: Number(prompt("Stock actual", product?.stock_current ?? 0) || 0),
    sale_price: Number(prompt("Precio de venta", product?.sale_price ?? 0) || 0),
    observation: prompt("Observación", product?.observation || "") || null,
    active: true,
  };
  const method = product ? "PATCH" : "POST";
  const path = product ? `/api/buffet/products/${product.id}` : "/api/buffet/products";
  apiSend(path, method, payload).then(loadBuffet).catch((e) => alert(e.message));
}

function deleteProduct(id) {
  if (!confirm("¿Eliminar este producto?")) return;
  apiSend(`/api/buffet/products/${id}`, "DELETE", {}).then(loadBuffet).catch((e) => alert(e.message));
}

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
  const name = prompt("Nombre del combo", combo?.name || "");
  if (!name) return;
  const payload = {
    name,
    description: prompt("Descripción", combo?.description || "") || null,
    sale_price: Number(prompt("Precio de venta", combo?.sale_price ?? 0) || 0),
    active: true,
  };
  const method = combo ? "PATCH" : "POST";
  const path = combo ? `/api/buffet/combos/${combo.id}` : "/api/buffet/combos";
  apiSend(path, method, payload).then(loadBuffet).catch((e) => alert(e.message));
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
  const title = prompt("Título del presupuesto", budget?.title || "");
  if (!title) return;
  const payload = {
    title,
    client_name: prompt("Cliente", budget?.client_name || "") || null,
    observation: prompt("Observación", budget?.observation || "") || null,
    status: prompt("Estado", budget?.status || "borrador") || "borrador",
    total_amount: Number(prompt("Total", budget?.total_amount ?? 0) || 0),
  };
  const method = budget ? "PATCH" : "POST";
  const path = budget ? `/api/buffet/budgets/${budget.id}` : "/api/buffet/budgets";
  apiSend(path, method, payload).then(loadBuffet).catch((e) => alert(e.message));
}

function escapeHtml(text) {
  return String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

window.onAuthenticated = initBuffet;
