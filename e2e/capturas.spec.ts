import { test } from "@playwright/test";
import { USUARIOS } from "./support/entorno";
import { iniciarSesion } from "./support/sesion";

// Capturas de cada pantalla para revisar el diseño. No verifican nada, así que
// no corren con la suite: `npm run capturas` las deja en test-results/capturas.
test.describe("capturas @capturas", () => {
  test.skip(!process.env.CAPTURAS, "Sólo con CAPTURAS=1 (npm run capturas)");

  const tamanos = [
    { nombre: "escritorio", width: 1280, height: 800 },
    { nombre: "celular", width: 390, height: 844 },
  ];

  test("pestañas de superadmin", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await iniciarSesion(page, USUARIOS.superadmin);
    for (const [archivo, tab] of [
      ["17-admin-roles", "roles"],
      ["18-admin-organizaciones", "organizaciones"],
    ]) {
      await page.goto(`/admin?tab=${tab}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(350);
      await page.screenshot({ path: `test-results/capturas/escritorio-${archivo}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Nueva organización" }).click();
    await page.screenshot({ path: "test-results/capturas/escritorio-19-nueva-organizacion.png" });
  });

  for (const tamano of tamanos) {
    test(`pantallas en ${tamano.nombre}`, async ({ page }) => {
      await page.setViewportSize(tamano);
      const captura = async (nombre: string) => {
        // Que terminen de llegar los datos y las animaciones.
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(350);
        await page.screenshot({
          path: `test-results/capturas/${tamano.nombre}-${nombre}.png`,
          fullPage: true,
        });
      };

      await page.goto("/");
      await captura("01-login");

      await iniciarSesion(page, USUARIOS.admin);
      await page.goto("/");
      await captura("02-asistencia-vacia");

      await page.getByRole("searchbox").fill("pe");
      await page.getByRole("row").nth(1).waitFor();
      await captura("03-asistencia-resultados");

      await page.getByRole("row").nth(1).getByRole("cell").first().click();
      await page.getByRole("button", { name: /presente/ }).waitFor();
      await captura("04-ficha");

      await page.goto("/?vista=nuevo");
      await page.getByLabel("Nombre", { exact: true }).waitFor();
      await captura("05-nuevo-chico");

      await page.goto("/?vista=historial");
      await captura("06-historial");

      await page.goto("/buffet");
      await captura("07-buffet-productos");
      await page.getByRole("button", { name: "Nuevo producto" }).click();
      await captura("08-buffet-nuevo-producto");
      await page.keyboard.press("Escape");

      await page.goto("/buffet?tab=ventas");
      await captura("09-buffet-eventos");
      const abrir = page.getByRole("button", { name: "Abrir", exact: true }).first();
      if (await abrir.isVisible()) {
        await abrir.click();
        await captura("10-buffet-evento");
        await page.getByRole("button", { name: "Nueva venta" }).click();
        const selector = page.getByLabel("Agregar ítem");
        const opciones = await selector.locator("option").count();
        if (opciones > 1) await selector.selectOption({ index: 1 });
        await captura("11-buffet-nueva-venta");
        await page.keyboard.press("Escape");
      }

      await page.goto("/admin");
      await captura("12-admin-usuarios");
      await page.goto("/admin?tab=solicitudes");
      await captura("13-admin-solicitudes");
      await page.goto("/admin?tab=notificaciones");
      await captura("14-admin-notificaciones");
      await page.goto("/admin?tab=actividad");
      await captura("15-admin-actividad");

      if (tamano.nombre === "celular") {
        await page.getByRole("button", { name: "Abrir menú" }).click();
        await captura("16-menu");
      }
    });
  }
});
