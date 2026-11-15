import { expect, test } from "@playwright/test";
import { Asistencia, Login } from "./pages/app";
import { USUARIOS } from "./support/entorno";
import { esperarCodigo } from "./support/mailpit";
import { iniciarSesion } from "./support/sesion";

test.describe("acceso", () => {
  test("sin sesión se muestra el login y nada de la app", async ({ page }) => {
    const login = new Login(page);
    await login.abrir();
    await expect(page.getByRole("button", { name: /Continuar con Google/ })).toBeVisible();
    await expect(new Asistencia(page).buscador()).toBeHidden();
  });

  test("entra con el código que llega por mail y puede salir", async ({ page }) => {
    const login = new Login(page);
    await login.abrir();

    const desde = new Date(Date.now() - 1000);
    await login.pedirCodigo(USUARIOS.admin);
    await login.entrarCon(await esperarCodigo(USUARIOS.admin, desde));

    await expect(new Asistencia(page).buscador()).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(login.mail()).toBeVisible();
  });

  test("un código incorrecto no deja entrar", async ({ page }) => {
    const login = new Login(page);
    await login.abrir();
    await login.pedirCodigo(USUARIOS.miembro);
    await login.entrarCon("000000");
    await expect(page.getByText(/no es válido o ya venció/)).toBeVisible();
    await expect(new Asistencia(page).buscador()).toBeHidden();
  });

  test("quien no tiene acceso ve su solicitud pendiente, no la app", async ({ page }) => {
    await iniciarSesion(page, USUARIOS.sinAcceso);
    await page.goto("/");
    await expect(page.getByText(/Solicitud #\d+ enviada|Completá tu registro/)).toBeVisible();
    await expect(new Asistencia(page).buscador()).toBeHidden();
  });

  test("un miembro sin rol admin no entra al panel de administración", async ({ page }) => {
    await iniciarSesion(page, USUARIOS.miembro);
    await page.goto("/admin.html");
    await expect(page.getByText("No tenés permisos de administración.")).toBeVisible();
    await expect(new Asistencia(page).buscador()).toBeVisible();
  });
});
