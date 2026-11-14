// Botón "Instalar como app" en el header, a la izquierda de "Salir".
//
// - Chrome/Edge/Android: captura `beforeinstallprompt` y lo dispara al tocar.
// - iOS (Safari): no existe esa API, así que el botón explica cómo agregarla
//   desde el menú Compartir.
// - Si la app ya está instalada (modo standalone) o el navegador no puede
//   instalarla, el botón no aparece.

(function () {
  const contenedor = document.querySelector(".header-actions");
  if (!contenedor) return;

  const instalada =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (instalada) return;

  // El service worker es parte de lo que el navegador pide para ofrecer la
  // instalación; push.js lo registra solo si hay claves VAPID, así que lo
  // aseguramos acá (registrar dos veces el mismo script es inocuo).
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  const esIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  let promptDiferido = null;
  let boton = null;

  function crearBoton() {
    if (boton) return;
    boton = document.createElement("button");
    boton.id = "btn-instalar";
    boton.className = "btn-instalar";
    boton.type = "button";
    boton.title = "Instalar como app";
    boton.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>' +
      '<span class="btn-instalar-texto">Instalar como app</span>';
    boton.addEventListener("click", alTocar);
    const salir = document.getElementById("btn-logout");
    contenedor.insertBefore(boton, salir && salir.parentNode === contenedor ? salir : null);
  }

  function ocultarBoton() {
    if (boton) boton.remove();
    boton = null;
  }

  async function alTocar() {
    if (promptDiferido) {
      const evento = promptDiferido;
      promptDiferido = null;
      evento.prompt();
      try {
        await evento.userChoice;
      } catch { /* el usuario cerró el diálogo */ }
      ocultarBoton();
      return;
    }
    if (esIOS) {
      alert("Para instalar la app: tocá el botón Compartir de Safari y elegí «Agregar a pantalla de inicio».");
    }
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptDiferido = e;
    crearBoton();
  });

  window.addEventListener("appinstalled", () => {
    promptDiferido = null;
    ocultarBoton();
  });

  if (esIOS) crearBoton();
})();
