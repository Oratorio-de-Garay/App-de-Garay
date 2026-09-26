// Panel de administración: usuarios, roles, organizaciones y actividad.
//
// El frontend sólo muestra lo que el backend devuelve: los listados ya vienen
// filtrados por el scope del usuario, y cada acción la vuelve a validar la
// base (ver supabase/migrations/20260926000000_roles_y_admin.sql). Ocultar un
// botón acá es una ayuda visual, no un control de acceso.

const adminState = {
  me: null,
  usuarios: [],
  organizaciones: [],
  roles: [],
  // null = todavía no se pidió; se carga al abrir la pestaña Actividad.
  auditoria: null,
  filtro: { q: "", org: "" },
  tab: "usuarios",
};

const ICONOS = {
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  candado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  usuarios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.6-.3 4.8 1.2 5.5 4.4"/></svg>',
  escudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
};

// ─────────────────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────────────────

function initAdmin() {
  adminState.me = window.currentUser;

  if (!adminState.me?.puede_administrar) {
    renderSinPermisos();
    return;
  }

  document.querySelectorAll(".admin-tab").forEach((btn) => {
    if (btn.hasAttribute("data-solo-superadmin")) btn.hidden = !adminState.me.es_superadmin;
    btn.addEventListener("click", () => setAdminTab(btn.dataset.tab));
  });

  const overlay = document.getElementById("admin-modal-overlay");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
  });

  renderSkeleton(document.getElementById("panel-usuarios"));
  cargarDatos();
}

function renderSinPermisos() {
  document.getElementById("admin-main").innerHTML = `
    <div class="admin-card admin-denied">
      <div class="admin-empty" style="padding:0">${ICONOS.escudo}</div>
      <h2>No tenés permisos de administración</h2>
      <p>Esta sección es sólo para administradores. Si necesitás dar de alta a alguien, pedíselo a un admin de tu organización.</p>
      <a class="admin-btn admin-btn-primary" href="index.html">Volver al inicio</a>
    </div>
  `;
}

function setAdminTab(tab) {
  adminState.tab = tab;
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    const activa = btn.dataset.tab === tab;
    btn.classList.toggle("active", activa);
    btn.setAttribute("aria-selected", activa ? "true" : "false");
  });
  document.querySelectorAll(".admin-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${tab}`);
  });
  if (tab === "actividad" && adminState.auditoria === null) cargarAuditoria();
}

async function cargarDatos() {
  try {
    const [usuarios, organizaciones, roles] = await Promise.all([
      apiGet("/api/admin/usuarios"),
      apiGet("/api/admin/organizaciones"),
      apiGet("/api/admin/roles"),
    ]);
    adminState.usuarios = usuarios || [];
    adminState.organizaciones = organizaciones || [];
    adminState.roles = roles || [];
    // Si el filtro apuntaba a una organización que ya no está en el scope.
    if (!adminState.organizaciones.some((o) => o.id === adminState.filtro.org)) adminState.filtro.org = "";
    renderTodo();
  } catch (error) {
    renderErrorCarga(document.getElementById("panel-usuarios"), error, cargarDatos);
  }
}

/** Después de cualquier cambio: refresca datos y marca la auditoría como vieja. */
async function refrescar() {
  adminState.auditoria = null;
  await cargarDatos();
  if (adminState.tab === "actividad") cargarAuditoria();
}

function renderTodo() {
  renderHero();
  renderUsuarios();
  if (adminState.me.es_superadmin) {
    renderRoles();
    renderOrganizaciones();
  }
  if (adminState.auditoria) renderActividad();
}

// ─────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────

function renderHero() {
  const scope = document.getElementById("admin-scope");
  if (adminState.me.es_superadmin) {
    scope.textContent = "Sos superadministrador: gestionás usuarios, roles y organizaciones de toda la aplicación.";
  } else {
    const nombres = adminState.organizaciones.map((o) => o.nombre).join(", ");
    scope.textContent = `Administrás ${nombres}. Podés dar de alta usuarios y modificar sus accesos dentro de ${adminState.organizaciones.length > 1 ? "esas organizaciones" : "esa organización"}.`;
  }

  const admins = new Set(adminState.usuarios.filter((u) => u.roles.some((r) => r.rol === "admin")).map((u) => u.email));
  document.getElementById("admin-stats").innerHTML = [
    [adminState.usuarios.length, adminState.usuarios.length === 1 ? "usuario" : "usuarios"],
    [adminState.organizaciones.length, adminState.organizaciones.length === 1 ? "organización" : "organizaciones"],
    [admins.size, admins.size === 1 ? "admin" : "admins"],
  ].map(([n, label]) => `<div class="admin-stat"><strong>${n}</strong><span>${label}</span></div>`).join("");
}

// ─────────────────────────────────────────────────────────
// Pestaña Usuarios
// ─────────────────────────────────────────────────────────

function renderUsuarios() {
  const panel = document.getElementById("panel-usuarios");
  const variasOrgs = adminState.organizaciones.length > 1;

  panel.innerHTML = `
    <div class="admin-toolbar">
      <label class="admin-search">
        ${ICONOS.buscar}
        <input class="form-input" id="usuarios-q" type="search" placeholder="Buscar por nombre o email…" autocomplete="off" value="${escapeHtml(adminState.filtro.q)}" aria-label="Buscar usuarios">
      </label>
      ${variasOrgs ? `
        <select class="form-select admin-select" id="usuarios-org" aria-label="Filtrar por organización">
          <option value="">Todas las organizaciones</option>
          ${adminState.organizaciones.map((o) => `<option value="${o.id}"${o.id === adminState.filtro.org ? " selected" : ""}>${escapeHtml(o.nombre)}</option>`).join("")}
        </select>` : ""}
      <button class="admin-btn admin-btn-primary" id="btn-alta" type="button">+ Dar de alta</button>
    </div>
    <div class="admin-list" id="usuarios-list"></div>
  `;

  // Sólo se repinta la lista: repintar el panel entero le sacaría el foco al buscador.
  document.getElementById("usuarios-q").addEventListener("input", (e) => {
    adminState.filtro.q = e.target.value;
    renderListaUsuarios();
  });
  document.getElementById("usuarios-org")?.addEventListener("change", (e) => {
    adminState.filtro.org = e.target.value;
    renderListaUsuarios();
  });
  document.getElementById("btn-alta").addEventListener("click", () => abrirFormUsuario(null));

  renderListaUsuarios();
}

function usuariosFiltrados() {
  const q = normalizarBusqueda(adminState.filtro.q);
  const org = adminState.filtro.org;
  return adminState.usuarios.filter((u) => {
    if (org && !u.organizaciones.some((o) => o.id === org)) return false;
    if (!q) return true;
    return normalizarBusqueda(`${u.nombre || ""} ${u.email}`).includes(q);
  });
}

function renderListaUsuarios() {
  const lista = document.getElementById("usuarios-list");
  const usuarios = usuariosFiltrados();

  if (!adminState.usuarios.length) {
    lista.innerHTML = estadoVacio(ICONOS.usuarios, "Todavía no hay usuarios", "Dá de alta el primer email para que esa persona pueda entrar con su cuenta de Google.");
    return;
  }
  if (!usuarios.length) {
    lista.innerHTML = estadoVacio(ICONOS.buscar, "Sin resultados", "Ningún usuario coincide con la búsqueda.");
    return;
  }

  lista.innerHTML = usuarios.map((u) => `
    <article class="admin-card admin-row">
      ${avatarHtml(u.nombre || u.email, u.email)}
      <div class="row-main">
        <div class="row-title">
          <span>${escapeHtml(u.nombre || u.email)}</span>
          ${u.roles.map(rolBadgeHtml).join("")}
        </div>
        ${u.nombre ? `<div class="row-sub">${escapeHtml(u.email)}</div>` : ""}
        <div class="row-tags">
          ${u.organizaciones.length
            ? u.organizaciones.map((o) => `<span class="org-chip">${escapeHtml(o.nombre)}</span>`).join("")
            : '<span class="field-hint">Sin organizaciones</span>'}
        </div>
      </div>
      <div class="row-actions">
        ${u.editable ? `
          <button class="admin-btn admin-btn-ghost admin-btn-sm" type="button" data-editar="${u.id}">Editar</button>
          ${u.organizaciones.length ? `<button class="admin-icon-btn danger" type="button" data-quitar="${u.id}">Quitar acceso</button>` : ""}
        ` : `
          <span class="lock-note" title="Sólo un superadmin puede modificar a un administrador">${ICONOS.candado} Sólo superadmin</span>
        `}
      </div>
    </article>
  `).join("");

  lista.querySelectorAll("[data-editar]").forEach((btn) => {
    btn.addEventListener("click", () => abrirFormUsuario(usuarioPorId(btn.dataset.editar)));
  });
  lista.querySelectorAll("[data-quitar]").forEach((btn) => {
    btn.addEventListener("click", () => confirmarQuitarAcceso(usuarioPorId(btn.dataset.quitar)));
  });
}

/** Alta (usuario = null) o edición de un usuario. */
function abrirFormUsuario(usuario) {
  const esAlta = !usuario;
  // En el alta, si administra una sola organización se la preselecciona.
  const seleccionadas = esAlta
    ? (adminState.organizaciones.length === 1 ? [adminState.organizaciones[0].id] : [])
    : usuario.organizaciones.map((o) => o.id);

  openModal({
    title: esAlta ? "Dar de alta un usuario" : "Editar usuario",
    description: esAlta
      ? "Habilitá un email de Google. Cuando esa persona inicie sesión va a entrar directo a las organizaciones que elijas."
      : "Los cambios de organizaciones sólo afectan a las que vos administrás.",
    submitLabel: esAlta ? "Dar de alta" : "Guardar cambios",
    bodyHtml: `
      <div class="form-group">
        <label class="form-label" for="f-email">Email de Google <span class="field-required">*</span></label>
        <input class="form-input" id="f-email" type="email" inputmode="email" autocomplete="off" placeholder="nombre@gmail.com"
          value="${escapeHtml(usuario?.email || "")}" ${esAlta ? "required" : "disabled"}>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-nombre">Nombre <span class="field-hint">(opcional)</span></label>
        <input class="form-input" id="f-nombre" type="text" autocomplete="off" maxlength="120" placeholder="Ej: María Pérez — catequista de 3°"
          value="${escapeHtml(usuario?.nombre || "")}">
      </div>
      <div class="form-group">
        <span class="form-label">Organizaciones <span class="field-required">*</span></span>
        ${orgPickerHtml(adminState.organizaciones, seleccionadas)}
        <span class="field-hint">Sólo va a poder ver los datos de las organizaciones marcadas.</span>
      </div>
      ${esAlta ? "" : '<div class="admin-alert admin-alert-warn" id="f-sin-orgs" hidden>Sin organizaciones esta persona pierde el acceso a lo que vos administrás. Si no le queda ninguna otra, ya no va a poder entrar a la aplicación.</div>'}
    `,
    onReady(modal) {
      if (esAlta) {
        modal.querySelector("#f-email").focus();
        return;
      }
      // Desmarcar todo equivale a quitarle el acceso: se avisa y cambia el botón.
      // (Si ya no tenía organizaciones —ej: un superadmin— sólo se edita el nombre.)
      const submit = modal.querySelector("#modal-submit");
      const sync = () => {
        const vacio = usuario.organizaciones.length > 0 && orgsMarcadas(modal).length === 0;
        modal.querySelector("#f-sin-orgs").hidden = !vacio;
        submit.textContent = vacio ? "Quitar acceso" : "Guardar cambios";
        submit.classList.toggle("admin-btn-danger", vacio);
        submit.classList.toggle("admin-btn-primary", !vacio);
      };
      modal.querySelectorAll(".org-pill input").forEach((input) => input.addEventListener("change", sync));
      modal.querySelector("#f-nombre").focus();
    },
    async onSubmit(modal) {
      const nombre = modal.querySelector("#f-nombre").value.trim();
      const organizaciones = orgsMarcadas(modal);

      if (esAlta) {
        const email = modal.querySelector("#f-email").value.trim().toLowerCase();
        if (!EMAIL_RE.test(email)) throw new Error("Ingresá un email válido.");
        if (!organizaciones.length) throw new Error("Elegí al menos una organización.");

        const r = await apiSend("/api/admin/usuarios", "POST", { email, nombre, organizaciones });
        if (r.creado) toast(`Listo: ${email} ya puede entrar con Google.`);
        else if (r.organizaciones_agregadas) toast(`${email} ya estaba registrado: se le agregó el acceso.`);
        else toast(`${email} ya tenía acceso a esas organizaciones.`);
      } else {
        const r = await apiSend(`/api/admin/usuarios/${encodeURIComponent(usuario.id)}`, "PATCH", { nombre, organizaciones });
        toast(r.eliminado ? `${usuario.email} ya no tiene acceso a la aplicación.` : "Cambios guardados.");
      }
      await refrescar();
    },
  });
}

function confirmarQuitarAcceso(usuario) {
  const orgs = usuario.organizaciones.map((o) => `<strong>${escapeHtml(o.nombre)}</strong>`).join(", ");
  openModal({
    title: "¿Quitar el acceso?",
    bodyHtml: `
      <p class="modal-desc" style="margin:0">
        <strong>${escapeHtml(usuario.nombre || usuario.email)}</strong> va a dejar de tener acceso a ${orgs}.
        Si no pertenece a ninguna otra organización, ya no va a poder entrar a la aplicación.
      </p>
    `,
    submitLabel: "Quitar acceso",
    danger: true,
    async onSubmit() {
      const r = await apiSend(`/api/admin/usuarios/${encodeURIComponent(usuario.id)}`, "DELETE");
      toast(r.eliminado ? `${usuario.email} ya no tiene acceso a la aplicación.` : `Se quitó el acceso de ${usuario.email}.`);
      await refrescar();
    },
  });
}

// ─────────────────────────────────────────────────────────
// Pestaña Roles (sólo superadmin)
// ─────────────────────────────────────────────────────────

function renderRoles() {
  const panel = document.getElementById("panel-roles");
  const conRoles = adminState.usuarios.filter((u) => u.roles.length);

  panel.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-toolbar-title">
        <h2>Roles asignados</h2>
        <p>Los roles por organización requieren elegir al menos una organización.</p>
      </div>
      <button class="admin-btn admin-btn-primary" id="btn-asignar-rol" type="button">+ Asignar rol</button>
    </div>

    <div class="role-catalog">
      ${adminState.roles.map((r) => `
        <div class="admin-card role-catalog-item">
          <div class="row-title">${rolBadgeHtml({ rol: r.codigo, nombre: r.nombre })}<span class="scope-tag">${r.alcance === "global" ? "Global" : "Por organización"}</span></div>
          <p>${escapeHtml(r.descripcion || "")}</p>
          ${r.asignable_desde_panel ? "" : '<span class="field-hint">Se asigna sólo por SQL (ver docs/ROLES_Y_PERMISOS.md).</span>'}
        </div>
      `).join("")}
    </div>

    <div class="admin-list" id="roles-list">
      ${conRoles.length ? conRoles.map(filaRolesHtml).join("") : estadoVacio(ICONOS.escudo, "Todavía no hay roles asignados", "Asigná el rol de administrador para que alguien pueda dar de alta usuarios en su organización.")}
    </div>
  `;

  panel.querySelector("#btn-asignar-rol").addEventListener("click", () => abrirFormRol(null, null));
  panel.querySelectorAll("[data-editar-rol]").forEach((btn) => {
    btn.addEventListener("click", () => abrirFormRol(usuarioPorId(btn.dataset.usuario), btn.dataset.editarRol));
  });
  panel.querySelectorAll("[data-quitar-rol]").forEach((btn) => {
    btn.addEventListener("click", () => confirmarQuitarRol(usuarioPorId(btn.dataset.usuario), btn.dataset.quitarRol));
  });
}

function filaRolesHtml(usuario) {
  // Agrupa las filas de usuario_roles por rol: "Admin → Org A, Org B".
  const grupos = new Map();
  usuario.roles.forEach((r) => {
    if (!grupos.has(r.rol)) grupos.set(r.rol, { ...r, orgs: [] });
    if (r.organizacion_nombre) grupos.get(r.rol).orgs.push(r.organizacion_nombre);
  });

  return `
    <article class="admin-card admin-row">
      ${avatarHtml(usuario.nombre || usuario.email, usuario.email)}
      <div class="row-main">
        <div class="row-title">${escapeHtml(usuario.nombre || usuario.email)}</div>
        ${usuario.nombre ? `<div class="row-sub">${escapeHtml(usuario.email)}</div>` : ""}
        <div class="role-groups">
          ${[...grupos.values()].map((g) => {
            const asignable = catalogoRol(g.rol)?.asignable_desde_panel;
            return `
              <div class="role-group">
                ${rolBadgeHtml(g)}
                ${g.orgs.map((o) => `<span class="org-chip">${escapeHtml(o)}</span>`).join("")}
                ${asignable ? `
                  <div class="role-group-actions">
                    <button class="admin-icon-btn" type="button" data-usuario="${usuario.id}" data-editar-rol="${escapeHtml(g.rol)}">Editar</button>
                    <button class="admin-icon-btn danger" type="button" data-usuario="${usuario.id}" data-quitar-rol="${escapeHtml(g.rol)}">Quitar</button>
                  </div>` : ""}
              </div>`;
          }).join("")}
        </div>
      </div>
    </article>
  `;
}

/** Asignar un rol nuevo (usuario = null) o editar las organizaciones de uno existente. */
function abrirFormRol(usuario, rolCodigo) {
  const asignables = adminState.roles.filter((r) => r.asignable_desde_panel);
  if (!asignables.length) {
    toast("No hay roles asignables desde el panel.", "err");
    return;
  }
  const editando = Boolean(usuario && rolCodigo);
  const rolInicial = rolCodigo || asignables[0].codigo;
  const orgsIniciales = editando
    ? usuario.roles.filter((r) => r.rol === rolCodigo && r.organizacion_id).map((r) => r.organizacion_id)
    : [];

  openModal({
    title: editando ? "Editar rol" : "Asignar rol",
    description: editando
      ? "Elegí en qué organizaciones tiene este rol. Las que desmarques dejan de tenerlo, pero la persona sigue siendo miembro."
      : "Si el email todavía no está registrado se lo da de alta, y queda como miembro de las organizaciones elegidas.",
    submitLabel: editando ? "Guardar" : "Asignar",
    bodyHtml: `
      <div class="form-group">
        <label class="form-label" for="r-email">Email <span class="field-required">*</span></label>
        <input class="form-input" id="r-email" type="email" inputmode="email" list="r-emails" autocomplete="off" placeholder="nombre@gmail.com"
          value="${escapeHtml(usuario?.email || "")}" ${editando ? "disabled" : ""}>
        <datalist id="r-emails">
          ${adminState.usuarios.map((u) => `<option value="${escapeHtml(u.email)}">${escapeHtml(u.nombre || "")}</option>`).join("")}
        </datalist>
      </div>
      ${editando ? "" : `
        <div class="form-group" id="r-nombre-group">
          <label class="form-label" for="r-nombre">Nombre <span class="field-hint">(opcional, sólo si es alguien nuevo)</span></label>
          <input class="form-input" id="r-nombre" type="text" autocomplete="off" maxlength="120">
        </div>`}
      <div class="form-group">
        <label class="form-label" for="r-rol">Rol <span class="field-required">*</span></label>
        <select class="form-select admin-select" id="r-rol" ${editando ? "disabled" : ""}>
          ${asignables.map((r) => `<option value="${escapeHtml(r.codigo)}"${r.codigo === rolInicial ? " selected" : ""}>${escapeHtml(r.nombre)}</option>`).join("")}
        </select>
        <span class="field-hint" id="r-rol-desc"></span>
      </div>
      <div class="form-group org-field" id="r-orgs">
        <span class="form-label">Organizaciones <span class="field-required">*</span></span>
        ${orgPickerHtml(adminState.organizaciones, orgsIniciales)}
      </div>
    `,
    onReady(modal) {
      const select = modal.querySelector("#r-rol");
      const email = modal.querySelector("#r-email");
      const syncRol = () => {
        const rol = catalogoRol(select.value);
        modal.querySelector("#r-rol-desc").textContent = rol?.descripcion || "";
        // Los roles globales no llevan organización.
        modal.querySelector("#r-orgs").hidden = rol?.alcance !== "organizacion";
      };
      // Al elegir un usuario existente se precargan las organizaciones en las
      // que ya tiene el rol, para que la asignación (que reemplaza) no le saque
      // ninguna sin querer.
      const syncEmail = () => {
        const existente = adminState.usuarios.find((u) => u.email === email.value.trim().toLowerCase());
        const grupoNombre = modal.querySelector("#r-nombre-group");
        if (grupoNombre) grupoNombre.hidden = Boolean(existente);
        if (!existente || editando) return;
        const actuales = existente.roles.filter((r) => r.rol === select.value).map((r) => r.organizacion_id);
        modal.querySelectorAll(".org-pill input").forEach((input) => {
          if (actuales.includes(input.value)) input.checked = true;
        });
      };
      select.addEventListener("change", () => { syncRol(); syncEmail(); });
      email.addEventListener("change", syncEmail);
      syncRol();
      if (!editando) email.focus();
    },
    async onSubmit(modal) {
      const email = (usuario?.email || modal.querySelector("#r-email").value).trim().toLowerCase();
      const rol = catalogoRol(modal.querySelector("#r-rol").value);
      const organizaciones = rol?.alcance === "organizacion" ? orgsMarcadas(modal) : [];

      if (!EMAIL_RE.test(email)) throw new Error("Ingresá un email válido.");
      if (!rol) throw new Error("Elegí un rol.");
      if (rol.alcance === "organizacion" && !organizaciones.length) {
        throw new Error(`El rol ${rol.nombre} requiere al menos una organización.`);
      }

      await apiSend("/api/admin/roles/asignaciones", "POST", {
        email,
        nombre: modal.querySelector("#r-nombre")?.value.trim() || null,
        rol: rol.codigo,
        organizaciones,
      });
      toast(editando ? "Rol actualizado." : `${email} ahora es ${rol.nombre}.`);
      await refrescar();
    },
  });
}

function confirmarQuitarRol(usuario, rolCodigo) {
  const rol = catalogoRol(rolCodigo);
  openModal({
    title: `¿Quitar el rol ${rol?.nombre || rolCodigo}?`,
    bodyHtml: `
      <p class="modal-desc" style="margin:0">
        <strong>${escapeHtml(usuario.nombre || usuario.email)}</strong> deja de ser ${escapeHtml(rol?.nombre || rolCodigo)} en todas sus organizaciones.
        Sigue siendo miembro de ellas: para sacarle el acceso usá "Quitar acceso" en la pestaña Usuarios.
      </p>
    `,
    submitLabel: "Quitar rol",
    danger: true,
    async onSubmit() {
      await apiSend(`/api/admin/usuarios/${encodeURIComponent(usuario.id)}/roles/${encodeURIComponent(rolCodigo)}`, "DELETE");
      toast("Rol quitado.");
      await refrescar();
    },
  });
}

// ─────────────────────────────────────────────────────────
// Pestaña Organizaciones (sólo superadmin)
// ─────────────────────────────────────────────────────────

function renderOrganizaciones() {
  const panel = document.getElementById("panel-organizaciones");
  panel.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-toolbar-title">
        <h2>Organizaciones</h2>
        <p>Cada organización tiene sus propios datos: pibes, asistencias y buffet.</p>
      </div>
      <button class="admin-btn admin-btn-primary" id="btn-nueva-org" type="button">+ Nueva organización</button>
    </div>
    <div class="admin-list">
      ${adminState.organizaciones.length ? adminState.organizaciones.map((o) => `
        <article class="admin-card admin-row">
          ${avatarHtml(o.nombre, o.id, "avatar-org")}
          <div class="row-main">
            <div class="row-title">${escapeHtml(o.nombre)}</div>
            <div class="row-sub">${o.miembros} ${o.miembros === 1 ? "miembro" : "miembros"} · ${o.admins} ${o.admins === 1 ? "admin" : "admins"}</div>
          </div>
          <div class="row-actions">
            <button class="admin-btn admin-btn-ghost admin-btn-sm" type="button" data-renombrar="${o.id}">Renombrar</button>
          </div>
        </article>
      `).join("") : estadoVacio(ICONOS.usuarios, "No hay organizaciones", "Creá la primera para poder asignarle usuarios.")}
    </div>
  `;

  panel.querySelector("#btn-nueva-org").addEventListener("click", () => abrirFormOrganizacion(null));
  panel.querySelectorAll("[data-renombrar]").forEach((btn) => {
    btn.addEventListener("click", () => abrirFormOrganizacion(adminState.organizaciones.find((o) => o.id === btn.dataset.renombrar)));
  });
}

function abrirFormOrganizacion(org) {
  openModal({
    title: org ? "Renombrar organización" : "Nueva organización",
    submitLabel: org ? "Guardar" : "Crear",
    bodyHtml: `
      <div class="form-group">
        <label class="form-label" for="o-nombre">Nombre <span class="field-required">*</span></label>
        <input class="form-input" id="o-nombre" type="text" maxlength="80" autocomplete="off" value="${escapeHtml(org?.nombre || "")}">
      </div>
      ${org ? "" : '<div class="admin-alert admin-alert-info">Después asignale un administrador desde la pestaña Roles para que pueda dar de alta a su gente.</div>'}
    `,
    onReady(modal) {
      const input = modal.querySelector("#o-nombre");
      input.focus();
      input.select();
    },
    async onSubmit(modal) {
      const nombre = modal.querySelector("#o-nombre").value.trim();
      if (!nombre) throw new Error("El nombre es obligatorio.");
      if (org) {
        await apiSend(`/api/admin/organizaciones/${encodeURIComponent(org.id)}`, "PATCH", { nombre });
        toast("Organización renombrada.");
      } else {
        await apiSend("/api/admin/organizaciones", "POST", { nombre });
        toast(`Se creó ${nombre}.`);
      }
      await refrescar();
    },
  });
}

// ─────────────────────────────────────────────────────────
// Pestaña Actividad (auditoría)
// ─────────────────────────────────────────────────────────

async function cargarAuditoria() {
  const panel = document.getElementById("panel-actividad");
  renderSkeleton(panel);
  try {
    adminState.auditoria = await apiGet("/api/admin/auditoria?limit=150");
    renderActividad();
  } catch (error) {
    renderErrorCarga(panel, error, cargarAuditoria);
  }
}

function renderActividad() {
  const panel = document.getElementById("panel-actividad");
  const filas = adminState.auditoria || [];
  panel.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-toolbar-title">
        <h2>Actividad reciente</h2>
        <p>${adminState.me.es_superadmin ? "Todos los cambios de administración." : "Cambios en las organizaciones que administrás."}</p>
      </div>
      <button class="admin-btn admin-btn-ghost" id="btn-refrescar-actividad" type="button">Actualizar</button>
    </div>
    <div class="admin-card">
      ${filas.length ? `<ol class="activity-list">${filas.map(actividadHtml).join("")}</ol>`
        : estadoVacio(ICONOS.reloj, "Sin actividad todavía", "Acá vas a ver cada alta, cambio de acceso y asignación de roles.")}
    </div>
  `;
  panel.querySelector("#btn-refrescar-actividad").addEventListener("click", cargarAuditoria);
}

function actividadHtml(a) {
  const b = (t) => `<strong>${escapeHtml(t ?? "")}</strong>`;
  const quien = b(a.objetivo_email);
  const org = a.organizacion_nombre ? b(a.organizacion_nombre) : "una organización eliminada";
  const rol = b(catalogoRol(a.detalle?.rol)?.nombre || a.detalle?.rol || "");
  const d = a.detalle || {};

  const textos = {
    usuario_creado: [`Alta de ${quien}${d.nombre ? ` (${escapeHtml(d.nombre)})` : ""}`, ""],
    usuario_renombrado: [`${quien} ahora figura como ${b(d.despues || "(sin nombre)")}`, ""],
    usuario_eliminado: [`${quien} quedó sin acceso a la aplicación`, "activity-quita"],
    membresia_agregada: [`${quien} ahora tiene acceso a ${org}`, ""],
    membresia_quitada: [`${quien} ya no tiene acceso a ${org}`, "activity-quita"],
    rol_asignado: [`${quien} ahora es ${rol}${a.organizacion_id ? ` de ${org}` : ""}`, "activity-rol"],
    rol_quitado: [`${quien} dejó de ser ${rol}${a.organizacion_id ? ` de ${org}` : ""}`, "activity-quita"],
    organizacion_creada: [`Se creó la organización ${b(d.nombre)}`, "activity-org"],
    organizacion_renombrada: [`${b(d.antes)} ahora se llama ${b(d.despues)}`, "activity-org"],
  };
  const [texto, clase] = textos[a.accion] || [escapeHtml(a.accion), ""];

  return `
    <li class="activity-item ${clase}">
      <span class="activity-dot"></span>
      <div>
        <div class="activity-text">${texto}</div>
        <div class="activity-meta">${escapeHtml(formatearFecha(a.created_at))} · por ${escapeHtml(a.actor_email)}</div>
      </div>
    </li>
  `;
}

// ─────────────────────────────────────────────────────────
// Piezas de UI
// ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function usuarioPorId(id) {
  return adminState.usuarios.find((u) => u.id === id);
}

function catalogoRol(codigo) {
  return adminState.roles.find((r) => r.codigo === codigo);
}

function orgsMarcadas(root) {
  return [...root.querySelectorAll(".org-pill input:checked")].map((input) => input.value);
}

function orgPickerHtml(organizaciones, seleccionadas) {
  if (!organizaciones.length) return '<span class="field-hint">No hay organizaciones disponibles.</span>';
  return `
    <div class="org-picker">
      ${organizaciones.map((o) => `
        <label class="org-pill">
          <input type="checkbox" value="${o.id}"${seleccionadas.includes(o.id) ? " checked" : ""}>
          <span>${escapeHtml(o.nombre)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function rolBadgeHtml(rol) {
  const clase = rol.rol === "superadmin" ? "role-superadmin" : rol.rol === "admin" ? "role-admin" : "role-otro";
  const nombre = rol.rol === "superadmin" ? "Superadmin" : rol.rol === "admin" ? "Admin" : (rol.nombre || rol.rol);
  return `<span class="role-badge ${clase}">${escapeHtml(nombre)}</span>`;
}

function avatarHtml(texto, semilla, claseExtra = "") {
  // Sólo palabras que empiezan con letra: "Juan — catequista 3°" → "JC".
  const iniciales = (String(texto || "").replace(/@.*/, "").match(/\p{L}[\p{L}\p{N}]*/gu) || [])
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";
  let hash = 0;
  for (const c of String(semilla)) hash = (hash * 31 + c.charCodeAt(0)) % 360;
  return `<div class="avatar ${claseExtra}" style="--hue:${hash}" aria-hidden="true">${escapeHtml(iniciales)}</div>`;
}

function estadoVacio(icono, titulo, texto) {
  return `<div class="admin-empty">${icono}<strong>${escapeHtml(titulo)}</strong><span>${escapeHtml(texto)}</span></div>`;
}

function renderSkeleton(panel) {
  panel.innerHTML = `<div class="admin-list">${Array.from({ length: 4 }, () => `
    <div class="admin-card admin-row skeleton-row">
      <div class="skeleton skeleton-avatar"></div>
      <div class="row-main">
        <div class="skeleton skeleton-line" style="width:38%"></div>
        <div class="skeleton skeleton-line" style="width:24%;margin-top:6px"></div>
      </div>
    </div>`).join("")}</div>`;
}

function renderErrorCarga(panel, error, reintentar) {
  panel.innerHTML = `
    <div class="alert alert-err admin-error">
      <span>No se pudo cargar la información: ${escapeHtml(error.message)}</span>
      <button class="admin-btn admin-btn-ghost admin-btn-sm" type="button">Reintentar</button>
    </div>
  `;
  panel.querySelector("button").addEventListener("click", reintentar);
}

function toast(mensaje, tipo = "ok") {
  const stack = document.getElementById("toast-stack");
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

function formatearFecha(iso) {
  try {
    return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Minúsculas y sin tildes: "Pérez" se encuentra buscando "perez". */
function normalizarBusqueda(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// ─────────────────────────────────────────────────────────
// Modal y API (mismo patrón que buffet.js)
// ─────────────────────────────────────────────────────────

/**
 * Abre el modal. onSubmit recibe el elemento del modal y devuelve una promesa;
 * si resuelve el modal se cierra, si falla el error se muestra adentro.
 */
function openModal({ title, description, bodyHtml, submitLabel = "Guardar", danger = false, onSubmit, onReady }) {
  const overlay = document.getElementById("admin-modal-overlay");
  const modal = document.getElementById("admin-modal");
  modal.innerHTML = `
    <div class="modal-title" id="admin-modal-title">${escapeHtml(title)}</div>
    ${description ? `<p class="modal-desc">${escapeHtml(description)}</p>` : ""}
    <form class="modal-body" id="modal-form" novalidate>${bodyHtml}</form>
    <div class="modal-error" id="modal-error" role="alert" hidden></div>
    <div class="modal-actions">
      <button class="admin-btn admin-btn-ghost" type="button" id="modal-cancel">Cancelar</button>
      <button class="admin-btn ${danger ? "admin-btn-danger" : "admin-btn-primary"}" type="submit" form="modal-form" id="modal-submit">${escapeHtml(submitLabel)}</button>
    </div>
  `;
  overlay.classList.add("open");

  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  // Un <form> para que Enter envíe desde cualquier campo.
  document.getElementById("modal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("modal-submit");
    const box = document.getElementById("modal-error");
    if (btn.disabled) return;
    btn.disabled = true;
    box.hidden = true;
    try {
      await onSubmit(modal);
      closeModal();
    } catch (error) {
      box.textContent = error.message;
      box.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  if (onReady) onReady(modal);
}

function closeModal() {
  document.getElementById("admin-modal-overlay").classList.remove("open");
  document.getElementById("admin-modal").innerHTML = "";
}

async function apiGet(path) {
  const res = await window.apiFetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

async function apiSend(path, method, body) {
  const res = await window.apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function escapeHtml(text) {
  return String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

window.onAuthenticated = initAdmin;
