import { expect, test } from "@playwright/test";
import { Admin } from "./pages/app";
import { MARCA, marcaUnica, USUARIOS } from "./support/entorno";
import { iniciarSesion } from "./support/sesion";

test.describe("panel de administración", () => {
  test.beforeEach(async ({ page }) => {
    await iniciarSesion(page, USUARIOS.admin);
  });

  test("el admin ve los usuarios de su organización", async ({ page }) => {
    const admin = new Admin(page);
    await admin.abrir();
    await expect(admin.filaUsuario(USUARIOS.admin)).toBeVisible();
    await expect(admin.filaUsuario(USUARIOS.miembro)).toBeVisible();
  });

  test("dar de alta un usuario y quitarle el acceso", async ({ page }) => {
    const admin = new Admin(page);
    const email = `${MARCA.toLowerCase()}-${marcaUnica()}@local.test`;

    await admin.abrir();
    await admin.darDeAlta(email, "Usuario de prueba");
    await expect(admin.filaUsuario(email)).toBeVisible();

    await admin.quitarAcceso(email);
    await expect(admin.filaUsuario(email)).toHaveCount(0);
  });
});
