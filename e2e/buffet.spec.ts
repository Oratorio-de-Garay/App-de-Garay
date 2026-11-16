import { expect, test } from "@playwright/test";
import { Buffet } from "./pages/app";
import { MARCA, marcaUnica, USUARIOS } from "./support/entorno";
import { iniciarSesion } from "./support/sesion";

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
});
