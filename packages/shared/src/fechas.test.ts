import { describe, expect, it } from "vitest";
import { esFechaISO, hoyLocal, rangoDiaUTC } from "./fechas";

describe("esFechaISO", () => {
  it("acepta fechas reales en formato AAAA-MM-DD", () => {
    expect(esFechaISO("2026-11-15")).toBe(true);
    expect(esFechaISO("2024-02-29")).toBe(true);
  });

  it.each([
    "2026-02-31",
    "2025-02-29",
    "2026-13-01",
    "15/11/2026",
    "2026-11-15T10:00:00Z",
    "",
    null,
    20261115,
  ])("rechaza %j", (valor) => {
    expect(esFechaISO(valor)).toBe(false);
  });
});

describe("rangoDiaUTC", () => {
  it("abarca el día completo en UTC, con fin exclusivo", () => {
    expect(rangoDiaUTC("2026-11-15")).toEqual({
      desde: "2026-11-15T00:00:00.000Z",
      hasta: "2026-11-16T00:00:00.000Z",
    });
  });

  it("cruza fin de mes y de año", () => {
    expect(rangoDiaUTC("2026-12-31").hasta).toBe("2027-01-01T00:00:00.000Z");
    expect(rangoDiaUTC("2024-02-28").hasta).toBe("2024-02-29T00:00:00.000Z");
  });

  it("falla con una fecha inválida en vez de devolver un rango corrido", () => {
    expect(() => rangoDiaUTC("2026-02-31")).toThrow(RangeError);
  });
});

describe("hoyLocal", () => {
  it("usa el día del dispositivo, no el de UTC", () => {
    // 22:30 del 14 en hora local: en UTC-3 ya es 15, pero el presente es del 14.
    expect(hoyLocal(new Date(2026, 10, 14, 22, 30))).toBe("2026-11-14");
    expect(hoyLocal(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
  });
});
