import { expect, test } from "@playwright/test";
import { aceptarDialogos, Asistencia } from "./pages/app";
import { MARCA, marcaUnica, USUARIOS } from "./support/entorno";
import { iniciarSesion } from "./support/sesion";

test.describe("registro de asistencia", () => {
  test.beforeEach(async ({ page }) => {
    aceptarDialogos(page);
    await iniciarSesion(page, USUARIOS.admin);
  });

  test("alta de un chico, búsqueda, desmarcar y volver a marcar presente", async ({ page }) => {
    const asistencia = new Asistencia(page);
    const apellido = `Prueba${marcaUnica()}`;
    const nombreCompleto = `${MARCA} ${apellido}`;

    await asistencia.abrir();
    await asistencia.darDeAlta(MARCA, apellido);
    await expect(page.getByText(/fue agregado y el presente quedó marcado para hoy/)).toBeVisible();

    await asistencia.buscar(apellido);
    await asistencia.abrirFicha(nombreCompleto);

    // El alta ya lo dejó presente hoy.
    await expect(asistencia.botonPresente()).toHaveText(/Desmarcar presente/);
    await asistencia.botonPresente().click();
    await expect(asistencia.botonPresente()).toHaveText(/Marcar presente/);
    await expect(asistencia.botonPresente()).not.toHaveText(/Desmarcar/);

    await asistencia.botonPresente().click();
    await expect(asistencia.botonPresente()).toHaveText(/Desmarcar presente/);
  });

  test("buscar a alguien que no existe ofrece darlo de alta", async ({ page }) => {
    const asistencia = new Asistencia(page);
    await asistencia.abrir();
    await asistencia.buscar(`zzz${marcaUnica()}`);
    await asistencia.confirmarBusqueda();
    await expect(page.getByRole("row")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Agregar y marcar presente/ })).toBeVisible();
  });

  test("el historial muestra las asistencias del año @celular", async ({ page }) => {
    const asistencia = new Asistencia(page);
    await asistencia.abrir();
    await asistencia.abrirHistorial();
    await expect(page.getByText("Historial de asistencias")).toBeVisible();
  });
});
