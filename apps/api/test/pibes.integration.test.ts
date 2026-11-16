import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, limpiar, MARCA, marcaUnica, organizacionesDe, pedir, USUARIOS } from "./ayudas";

const como = USUARIOS.admin;
const HOY = "2026-11-15";
const UUID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

describe("pibes y asistencia", () => {
  let org: string;
  let gradoId: number;
  let edadId: number;
  let pibeId: string;
  const apellido = `Prueba${marcaUnica()}`;

  beforeAll(async () => {
    org = (await organizacionesDe(como))[0]!.id;
  });
  afterAll(limpiar);

  it("los catálogos traen grados con etiqueta y sólo las categorías de la organización", async () => {
    const { status, body, headers } = await pedir("GET", "/api/lookups", { como, org });
    expect(status).toBe(200);
    expect(body.grados[0]).toEqual({ id: expect.any(Number), label: expect.stringMatching(/^\w+ \d+°$/) });
    expect(headers.get("cache-control")).toBe("private, max-age=300");
    expect(headers.get("vary")).toContain("X-Organization-Id");

    const { data: propias } = await adminDb.from("edades").select("id").eq("organizacion_id", org);
    expect(body.edades.map((e: { id: number }) => e.id).sort()).toEqual(propias!.map((e) => e.id).sort());

    gradoId = body.grados[0].id;
    edadId = body.edades[0].id;
  });

  it("el alta valida los datos obligatorios", async () => {
    const res = await pedir("POST", "/api/students", { como, org, body: { nombre: MARCA, apellido } });
    expect(res).toMatchObject({ status: 400, body: { error: "Seleccioná un grado." } });
  });

  it("el alta con fecha crea al pibe y lo deja presente ese día", async () => {
    const res = await pedir("POST", "/api/students", {
      como,
      org,
      body: {
        nombre: MARCA,
        apellido,
        grado_id: String(gradoId),
        edad_id: String(edadId),
        entrego_ficha: true,
        telefono_emergencia: "11 2233-4455",
        observaciones: "",
        fecha: HOY,
      },
    });
    expect(res).toMatchObject({ status: 200, body: { ok: true, id: expect.any(String) } });
    pibeId = res.body.id;
  });

  it("la búsqueda lo encuentra con la forma común y el resumen de asistencia", async () => {
    const { body } = await pedir("GET", `/api/students/search?q=${apellido}&date=${HOY}`, { como, org });
    expect(body).toEqual([
      {
        id: pibeId,
        nombre: MARCA,
        apellido,
        nombreCompleto: `${MARCA} ${apellido}`,
        grado_id: gradoId,
        grado: expect.stringMatching(/°$/),
        edad_id: edadId,
        edad: expect.any(String),
        ficha: true,
        obs: null,
        telefono: 1122334455,
        visitas: 1,
        ultima_asistencia: expect.stringContaining(HOY),
        marcado_hoy: true,
      },
    ]);
  });

  it("buscar sin texto devuelve vacío, y sin fecha no informa el presente", async () => {
    expect((await pedir("GET", "/api/students/search?q=%20", { como, org })).body).toEqual([]);
    const { body } = await pedir("GET", `/api/students/search?q=${apellido}`, { como, org });
    expect(body[0].marcado_hoy).toBeNull();
  });

  it("la ficha trae visitas y última asistencia", async () => {
    const { status, body } = await pedir("GET", `/api/students/${pibeId}`, { como, org });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: pibeId,
      nombreCompleto: `${MARCA} ${apellido}`,
      visitas: 1,
      ficha: true,
    });
    expect(body.ultima_asistencia).toContain(HOY);
  });

  it("marcar de nuevo el mismo día no duplica", async () => {
    const body = { student_id: pibeId, fecha: HOY };
    expect((await pedir("POST", "/api/attendance/mark", { como, org, body })).body).toEqual({
      ok: true,
      alreadyMarked: true,
    });
    const { count } = await adminDb
      .from("asistencias")
      .select("id", { count: "exact", head: true })
      .eq("pibe_id", pibeId);
    expect(count).toBe(1);
  });

  it("aparece entre los presentes del día y en el historial del año", async () => {
    const porFecha = await pedir("GET", `/api/attendance/by-date?date=${HOY}`, { como, org });
    expect(porFecha.body.map((p: { id: string }) => p.id)).toContain(pibeId);
    expect(porFecha.body.find((p: { id: string }) => p.id === pibeId)).toMatchObject({
      nombreCompleto: `${MARCA} ${apellido}`,
      grado_id: gradoId,
      edad_id: edadId,
    });

    const fechas = await pedir("GET", "/api/attendance/dates?year=2026", { como, org });
    const dia = fechas.body.find((f: { fecha: string }) => f.fecha === HOY);
    expect(dia.total).toBeGreaterThanOrEqual(1);

    const top = await pedir("GET", "/api/attendance/top?year=2026", { como, org });
    expect(top.body.length).toBeLessThanOrEqual(3);
    expect(top.body[0]).toEqual({
      id: expect.any(String),
      nombre: expect.any(String),
      apellido: expect.any(String),
      nombreCompleto: expect.any(String),
      total: expect.any(Number),
    });
  });

  it("desmarcar borra el presente; desmarcar otra vez es 404", async () => {
    const body = { student_id: pibeId, fecha: HOY };
    expect((await pedir("DELETE", "/api/attendance/unmark", { como, org, body })).body).toEqual({ ok: true });
    expect(
      (await pedir("GET", `/api/attendance/check?student_id=${pibeId}&date=${HOY}`, { como, org })).body,
    ).toEqual({ marked: false });
    expect(await pedir("DELETE", "/api/attendance/unmark", { como, org, body })).toMatchObject({
      status: 404,
      body: { error: "No hay asistencia registrada para ese día" },
    });
    expect((await pedir("POST", "/api/attendance/mark", { como, org, body })).body).toEqual({
      ok: true,
      alreadyMarked: false,
    });
  });

  it("marcar valida la fecha y que el pibe exista en la organización", async () => {
    expect(
      await pedir("POST", "/api/attendance/mark", {
        como,
        org,
        body: { student_id: pibeId, fecha: "15/11/2026" },
      }),
    ).toMatchObject({ status: 400, body: { error: "La fecha debe tener formato AAAA-MM-DD." } });
    expect(
      await pedir("POST", "/api/attendance/mark", {
        como,
        org,
        body: { student_id: UUID_INEXISTENTE, fecha: HOY },
      }),
    ).toMatchObject({ status: 404, body: { error: "El pibe no existe en tu organización" } });
    expect((await pedir("GET", "/api/attendance/by-date?date=ayer", { como, org })).status).toBe(400);
  });

  it("editar cambia sólo lo que se manda", async () => {
    const editar = (body: unknown) => pedir("PATCH", `/api/students/${pibeId}`, { como, org, body });
    expect((await editar({ observaciones: "Alergia al maní" })).body).toEqual({ ok: true });
    let ficha = (await pedir("GET", `/api/students/${pibeId}`, { como, org })).body;
    expect(ficha).toMatchObject({ obs: "Alergia al maní", ficha: true });

    await editar({ entrego_ficha: false });
    ficha = (await pedir("GET", `/api/students/${pibeId}`, { como, org })).body;
    expect(ficha).toMatchObject({ obs: "Alergia al maní", ficha: false });
  });

  it("un id inexistente es 404 y uno mal formado es 400", async () => {
    expect((await pedir("GET", `/api/students/${UUID_INEXISTENTE}`, { como, org })).status).toBe(404);
    expect((await pedir("PATCH", `/api/students/${UUID_INEXISTENTE}`, { como, org, body: {} })).status).toBe(
      404,
    );
    expect(await pedir("GET", "/api/students/123", { como, org })).toMatchObject({
      status: 400,
      body: { error: "Identificador inválido." },
    });
  });

  it("desde otra organización el pibe no existe", async () => {
    const orgs = await organizacionesDe(USUARIOS.miembro);
    const otra = orgs.find((o) => o.id !== org);
    if (!otra) return; // La base local no tiene al miembro en una segunda organización.
    const opciones = { como: USUARIOS.miembro, org: otra.id };
    expect((await pedir("GET", `/api/students/${pibeId}`, opciones)).status).toBe(404);
    expect((await pedir("GET", `/api/students/search?q=${apellido}`, opciones)).body).toEqual([]);
    expect(
      (await pedir("POST", "/api/attendance/mark", { ...opciones, body: { student_id: pibeId, fecha: HOY } }))
        .status,
    ).toBe(404);
  });
});
