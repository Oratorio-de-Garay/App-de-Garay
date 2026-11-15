import { expect, test } from "@playwright/test";
import { aceptarDialogos, Buffet } from "./pages/app";
import { MARCA, marcaUnica, USUARIOS } from "./support/entorno";
import { iniciarSesion } from "./support/sesion";

test.describe("buffet", () => {
  test.beforeEach(async ({ page }) => {
    aceptarDialogos(page);
    await iniciarSesion(page, USUARIOS.admin);
  });

  test("crear y eliminar un producto", async ({ page }) => {
    const buffet = new Buffet(page);
    const nombre = `${MARCA} Empanada ${marcaUnica()}`;

    await buffet.abrir();
    await buffet.crearProducto(nombre, "1500");
    await expect(buffet.filaProducto(nombre)).toBeVisible();
    await expect(buffet.filaProducto(nombre)).toContainText("1500");

    await buffet.eliminarProducto(nombre);
    await expect(buffet.filaProducto(nombre)).toHaveCount(0);
  });

  test("un producto sin nombre no se guarda", async ({ page }) => {
    const buffet = new Buffet(page);
    await buffet.abrir();
    await buffet.crearProducto("", "100");
    await expect(page.getByText("El nombre es obligatorio.")).toBeVisible();
  });
});
