import { describe, expect, it } from "vitest";
import { SUPABASE_KEY } from "../../../e2e/support/entorno";
import { organizacionesDe, pedir, USUARIOS } from "./ayudas";

describe("quién entra a qué", () => {
  it("health responde sin sesión", async () => {
    expect(await pedir("GET", "/api/health")).toMatchObject({ status: 200, body: { status: "ok" } });
  });

  it("sin token: 401 en cualquier ruta de datos", async () => {
    for (const ruta of [
      "/api/auth/me",
      "/api/students/search?q=a",
      "/api/buffet/products",
      "/api/admin/usuarios",
    ]) {
      expect(await pedir("GET", ruta)).toMatchObject({ status: 401, body: { error: "No autenticado" } });
    }
    expect((await pedir("GET", "/api/registro")).status).toBe(401);
  });

  it("un token inventado o la clave pública no sirven como sesión", async () => {
    for (const token of ["no-es-un-jwt", SUPABASE_KEY]) {
      const res = await pedir("GET", "/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      expect(res).toMatchObject({ status: 401, body: { error: "Sesión inválida o expirada" } });
    }
  });

  it("/auth/me devuelve organizaciones y permisos del admin", async () => {
    const { status, body } = await pedir("GET", "/api/auth/me", { como: USUARIOS.admin });
    expect(status).toBe(200);
    expect(body).toMatchObject({ email: USUARIOS.admin, es_superadmin: false, puede_administrar: true });
    expect(body.organizations.length).toBeGreaterThan(0);
    expect(body.organizacion_id).toBe(body.organizations[0].id);
    expect(body.organizaciones_admin).toContain(body.organizacion_id);
  });

  it("un miembro sin rol no puede administrar ni entra a /admin", async () => {
    const yo = await pedir("GET", "/api/auth/me", { como: USUARIOS.miembro });
    expect(yo.body.puede_administrar).toBe(false);
    expect(await pedir("GET", "/api/admin/usuarios", { como: USUARIOS.miembro })).toMatchObject({
      status: 403,
      body: { error: "No tenés permisos de administración" },
    });
  });

  it("sesión válida sin registro: 403 SIN_REGISTRO, pero puede usar /registro", async () => {
    expect(await pedir("GET", "/api/auth/me", { como: USUARIOS.sinAcceso })).toMatchObject({
      status: 403,
      body: { code: "SIN_REGISTRO" },
    });
    const registro = await pedir("GET", "/api/registro", { como: USUARIOS.sinAcceso });
    expect(registro.status).toBe(200);
    expect(registro.body).toMatchObject({ email: USUARIOS.sinAcceso, registrado: false });
    expect(Array.isArray(registro.body.espacios)).toBe(true);
  });

  it("mandar el id de una organización ajena es 403, salvo en /auth/me que lo ignora", async () => {
    const ajena = "00000000-0000-4000-8000-000000000000";
    expect(await pedir("GET", "/api/buffet/products", { como: USUARIOS.admin, org: ajena })).toMatchObject({
      status: 403,
      body: { error: "No pertenecés a esa organización" },
    });
    expect((await pedir("GET", "/api/auth/me", { como: USUARIOS.admin, org: ajena })).status).toBe(200);
  });

  it("un admin no puede usar las rutas de superadmin", async () => {
    const res = await pedir("POST", "/api/admin/organizaciones", {
      como: USUARIOS.admin,
      body: { nombre: "No debería crearse" },
    });
    expect(res).toMatchObject({ status: 403, body: { error: "Sólo un superadmin puede hacer esto" } });
  });

  it("el despacho de notificaciones no acepta una sesión de usuario como secreto", async () => {
    const res = await pedir("POST", "/api/push/despachar", { como: USUARIOS.admin });
    // 401 con push configurado; 503 si este entorno no tiene claves VAPID o secreto.
    expect([401, 503]).toContain(res.status);
  });

  it("una ruta que no existe responde 404 en JSON", async () => {
    expect(await pedir("GET", "/api/no-existe", { como: USUARIOS.admin })).toMatchObject({
      status: 404,
      body: { error: "No encontrado" },
    });
  });

  it("un JSON mal formado es 400, no 500", async () => {
    const [org] = await organizacionesDe(USUARIOS.admin);
    const res = await pedir("POST", "/api/buffet/products", {
      como: USUARIOS.admin,
      org: org!.id,
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });
});
