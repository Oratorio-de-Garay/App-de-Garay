import { expect, test } from "@playwright/test";
import { Buffet } from "./pages/app";
import { MARCA, marcaUnica, USUARIOS } from "./support/entorno";
import { adminDb, iniciarSesion } from "./support/sesion";

test.describe("buffet", () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesion(page, USUARIOS.admin);
  });

  test("crear y eliminar un producto", async ({ page }) => {
    const buffet = new Buffet(page);
    const nombre = `${MARCA} Empanada ${marcaUnica()}`;

    await buffet.abrir();
    await buffet.crearProducto(nombre, "1500");
    await expect(buffet.filaProducto(nombre)).toBeVisible();
    await expect(buffet.filaProducto(nombre)).toContainText("$1.500");

    await buffet.eliminarProducto(nombre);
    await expect(buffet.filaProducto(nombre)).toHaveCount(0);
  });

  test("una venta calcula el total, descuenta el stock y suma al evento", async ({ page }) => {
    const buffet = new Buffet(page);
    const sufijo = marcaUnica();
    const producto = `${MARCA} Choripán ${sufijo}`;
    const evento = `${MARCA} Feria ${sufijo}`;

    await buffet.abrir();
    await buffet.crearProducto(producto, "1500");
    await expect(buffet.filaProducto(producto)).toBeVisible();

    await buffet.abrirVentas();
    await buffet.crearEvento(evento);
    await buffet.registrarVenta(producto, 3);
    await expect(buffet.totalDeLaVenta()).toContainText("$4.500");
    await buffet.confirmarVenta();

    await expect(buffet.resumenDelEvento(evento)).toContainText("1 venta");
    await expect(buffet.resumenDelEvento(evento)).toContainText("$4.500");
    await expect(page.getByRole("row").filter({ hasText: "Venta 1" })).toContainText(`3× ${producto}`);

    // El stock arrancó en 0 y se vendieron 3 (se permite stock negativo).
    await page.getByRole("tab", { name: "Productos" }).click();
    await expect(buffet.filaProducto(producto)).toContainText("-3");
  });

  test("un producto sin nombre no se guarda", async ({ page }) => {
    const buffet = new Buffet(page);
    await buffet.abrir();
    await buffet.crearProducto("", "100");
    await expect(page.getByText("El nombre es obligatorio.")).toBeVisible();
  });

  test("un evento cerrado no se puede eliminar", async ({ page }) => {
    const buffet = new Buffet(page);
    const evento = `${MARCA} Feria cerrada ${marcaUnica()}`;

    await buffet.abrir();
    await buffet.abrirVentas();
    await buffet.crearEvento(evento);
    await buffet.cerrarEvento();
    await page.getByRole("button", { name: "Volver" }).click();

    await expect(buffet.filaDeEvento(evento).getByRole("button", { name: "Eliminar" })).toBeDisabled();
  });
});

test.describe("buffet sin ser admin", () => {
  test("un miembro no puede eliminar ni cerrar eventos, y ve por qué", async ({ page }) => {
    const evento = `${MARCA} Feria miembro ${marcaUnica()}`;
    // Se crea en todas las organizaciones del miembro: no importa cuál abra la app.
    const { data: orgs } = await adminDb.from("organizaciones").select("id");
    await adminDb
      .from("buffet_eventos")
      .insert((orgs ?? []).map((o) => ({ nombre: evento, organizacion_id: o.id })));

    await iniciarSesion(page, USUARIOS.miembro);
    const buffet = new Buffet(page);
    await buffet.abrir();
    await buffet.abrirVentas();

    await expect(buffet.filaDeEvento(evento)).toBeVisible();
    await expect(buffet.filaDeEvento(evento).getByRole("button", { name: "Eliminar" })).toHaveCount(0);

    // Puede editarlo, pero no cambiarle el estado.
    await buffet.filaDeEvento(evento).getByRole("button", { name: "Abrir" }).click();
    await page.getByRole("button", { name: "Editar evento" }).click();
    await expect(page.getByRole("dialog").getByLabel("Nombre")).toBeVisible();
    const estado = page.getByRole("dialog").getByLabel("Estado");
    await expect(estado).toBeDisabled();
    const aviso = page.getByRole("tooltip");
    await expect(aviso).toBeHidden();
    await page
      .getByRole("dialog")
      .getByText("Estado", { exact: true })
      .locator("..")
      .locator("div")
      .first()
      .hover();
    await expect(aviso).toContainText("Sólo los usuarios con permisos de administrador");
  });
});
