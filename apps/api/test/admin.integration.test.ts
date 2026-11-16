import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAILPIT_URL } from "../../../e2e/support/entorno";
import { limpiar, MARCA, marcaUnica, organizacionesDe, pedir, USUARIOS } from "./ayudas";

const como = USUARIOS.admin;
const correo = () => `${MARCA.toLowerCase()}-${marcaUnica()}@local.test`;

/** Busca en Mailpit (los avisos a aprobadores van en copia oculta: no se filtra por "to"). */
async function buscarMails(consulta: string): Promise<{ Subject: string }[]> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(consulta)}`);
  return ((await res.json()) as { messages: { Subject: string }[] }).messages;
}

describe("panel de administración", () => {
  let org: string;

  beforeAll(async () => {
    org = (await organizacionesDe(como))[0]!.id;
  });
  afterAll(limpiar);

  it("las lecturas responden listas dentro del scope del admin", async () => {
    for (const ruta of [
      "organizaciones",
      "usuarios",
      "auditoria?limit=5",
      "roles",
      "solicitudes",
      "notificaciones",
      "dispositivos",
    ]) {
      const res = await pedir("GET", `/api/admin/${ruta}`, { como });
      expect(res.status, ruta).toBe(200);
      expect(Array.isArray(res.body), ruta).toBe(true);
    }
    const orgs = await pedir("GET", "/api/admin/organizaciones", { como });
    expect(orgs.body.map((o: { id: string }) => o.id)).toEqual([org]);
    const usuarios = await pedir("GET", "/api/admin/usuarios", { como });
    expect(usuarios.body.map((u: { email: string }) => u.email)).toContain(USUARIOS.admin);
  });

  it("alta, edición y baja de un usuario", async () => {
    const email = correo();
    const alta = await pedir("POST", "/api/admin/usuarios", {
      como,
      body: { email: email.toUpperCase(), nombre: "Usuario de integración", organizaciones: [org] },
    });
    expect(alta).toMatchObject({ status: 201, body: { creado: true } });

    const buscar = async () =>
      (await pedir("GET", "/api/admin/usuarios", { como })).body.find(
        (u: { email: string }) => u.email === email,
      );
    const usuario = await buscar();
    expect(usuario).toMatchObject({ email, nombre: "Usuario de integración" });

    const editado = await pedir("PATCH", `/api/admin/usuarios/${usuario.id}`, {
      como,
      body: { nombre: "Renombrado", organizaciones: [org] },
    });
    expect(editado.status).toBe(200);
    expect((await buscar()).nombre).toBe("Renombrado");

    const baja = await pedir("DELETE", `/api/admin/usuarios/${usuario.id}`, { como });
    expect(baja).toMatchObject({ status: 200, body: { eliminado: true } });
    expect(await buscar()).toBeUndefined();
  });

  it("los errores de las funciones SQL llegan con su status y su mensaje", async () => {
    const invalido = await pedir("POST", "/api/admin/usuarios", {
      como,
      body: { email: "no-es-un-mail", organizaciones: [org] },
    });
    expect(invalido.status).toBe(400);
    expect(invalido.body.error).toEqual(expect.any(String));
    expect(invalido.body.error).not.toMatch(/inesperado/);

    // Una organización que el admin no administra: lo rechaza la función.
    const fueraDeScope = await pedir("POST", "/api/admin/usuarios", {
      como,
      body: { email: correo(), organizaciones: ["00000000-0000-4000-8000-000000000000"] },
    });
    expect([400, 403]).toContain(fueraDeScope.status);

    const idMalo = await pedir("DELETE", "/api/admin/usuarios/no-es-uuid", { como });
    expect(idMalo).toMatchObject({ status: 400, body: { error: "Identificador inválido" } });
  });

  it("solicitud de acceso completa: pedir, avisar, tomar, aceptar y entrar", async () => {
    const solicitante = correo();

    // 1. El recién llegado todavía no tiene acceso y ve los espacios.
    const estado = await pedir("GET", "/api/registro", { como: solicitante });
    expect(estado.body).toMatchObject({ email: solicitante, registrado: false });
    expect(estado.body.espacios.map((e: { id: string }) => e.id)).toContain(org);

    // 2. Pide sumarse: se crea la solicitud y se avisa a los aprobadores.
    const creada = await pedir("POST", "/api/registro/solicitudes", {
      como: solicitante,
      body: { nombre: "Persona Nueva", organizacion_id: org },
    });
    expect(creada).toMatchObject({
      status: 201,
      body: { estado: "pendiente", solicitante_email: solicitante, solicitante_nombre: "Persona Nueva" },
    });
    expect(creada.body.notificados).toBeGreaterThan(0);
    const avisos = await buscarMails(`subject:"Solicitud #${creada.body.numero}:"`);
    expect(avisos.some((m) => m.Subject.includes(`Solicitud #${creada.body.numero}`))).toBe(true);

    // No puede pedir dos veces.
    const repetida = await pedir("POST", "/api/registro/solicitudes", {
      como: solicitante,
      body: { nombre: "Persona Nueva", organizacion_id: org },
    });
    expect(repetida.status).toBe(409);

    // 3. El admin la ve, la toma y la acepta.
    const pendientes = await pedir("GET", "/api/admin/solicitudes?estado=pendiente", { como });
    expect(pendientes.body.map((s: { id: string }) => s.id)).toContain(creada.body.id);
    expect((await pedir("POST", `/api/admin/solicitudes/${creada.body.id}/tomar`, { como })).status).toBe(
      200,
    );

    const resuelta = await pedir("POST", `/api/admin/solicitudes/${creada.body.id}/resolver`, {
      como,
      body: { decision: "aceptar", comentario: "Bienvenida" },
    });
    expect(resuelta).toMatchObject({
      status: 200,
      body: { estado: "aceptada", notificados: 1, aviso_error: null },
    });
    expect(
      (await buscarMails(`to:${solicitante}`)).some((m) => m.Subject === "Tu solicitud fue aceptada"),
    ).toBe(true);

    // Resolverla de nuevo no se puede.
    const otraVez = await pedir("POST", `/api/admin/solicitudes/${creada.body.id}/resolver`, {
      como,
      body: { decision: "rechazar" },
    });
    expect(otraVez.status).toBe(409);

    // 4. El solicitante ya entra (el contexto se cachea 30 s por instancia,
    //    pero este usuario nunca había consultado /auth/me).
    const yo = await pedir("GET", "/api/auth/me", { como: solicitante });
    expect(yo).toMatchObject({ status: 200, body: { email: solicitante, organizacion_id: org } });
  });

  it("cancelar la propia solicitud", async () => {
    const solicitante = correo();
    const creada = await pedir("POST", "/api/registro/solicitudes", {
      como: solicitante,
      body: { nombre: "Se arrepiente", organizacion_id: org },
    });
    const cancelada = await pedir("POST", `/api/registro/solicitudes/${creada.body.id}/cancelar`, {
      como: solicitante,
    });
    expect(cancelada).toMatchObject({ status: 200, body: { estado: "cancelada" } });

    // Nadie más puede cancelar la solicitud de otro.
    const ajena = await pedir("POST", `/api/registro/solicitudes/${creada.body.id}/cancelar`, {
      como: USUARIOS.sinAcceso,
    });
    expect(ajena.status).toBeGreaterThanOrEqual(400);
  });

  it("registrar un dispositivo push exige un endpoint de un navegador", async () => {
    const res = await pedir("POST", "/api/push/suscripciones", {
      como,
      body: { endpoint: "https://169.254.169.254/latest", keys: { p256dh: "x", auth: "y" } },
    });
    // 400 con push configurado; 503 si este entorno no tiene claves VAPID.
    expect([400, 503]).toContain(res.status);
  });
});
