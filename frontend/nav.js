/**
 * Sidebar desplegable para celulares y tablets en vertical.
 *
 * En pantallas anchas el sidebar es parte del layout y este script no hace
 * nada visible. En la vista compacta el sidebar arranca cerrado y se abre
 * superpuesto sobre el contenido, con el resto de la pantalla grisada.
 */
(function () {
  const toggle = document.getElementById("nav-toggle");
  const sideNav = document.getElementById("side-nav");
  const scrim = document.getElementById("nav-scrim");
  const closeBtn = document.getElementById("nav-close");
  const appShell = document.getElementById("app-shell");
  if (!toggle || !sideNav || !scrim) return;

  // Debe coincidir con la media query de base.css.
  const compact = window.matchMedia(
    "(max-width: 900px), (max-width: 1024px) and (orientation: portrait)"
  );

  function setOpen(open) {
    sideNav.classList.toggle("open", open);
    scrim.classList.toggle("open", open);
    document.body.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  }

  const close = () => setOpen(false);

  toggle.addEventListener("click", () => {
    setOpen(!sideNav.classList.contains("open"));
  });

  scrim.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);

  // Navegar a otra sección cierra el panel (además de recargar la página).
  sideNav.querySelectorAll(".side-link").forEach((link) => {
    link.addEventListener("click", close);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Al pasar a pantalla ancha el sidebar vuelve al layout: sacamos el estado
  // abierto para no dejar el body bloqueado.
  compact.addEventListener("change", (e) => {
    if (!e.matches) close();
  });

  // El botón sólo tiene sentido cuando la app está visible (sesión iniciada).
  if (appShell) {
    const syncVisibility = () => {
      toggle.hidden = appShell.hidden;
      if (appShell.hidden) close();
    };
    syncVisibility();
    new MutationObserver(syncVisibility).observe(appShell, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
  }
})();
