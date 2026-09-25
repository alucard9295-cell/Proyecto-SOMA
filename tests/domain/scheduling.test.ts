import { describe, expect, it } from "vitest";
import { buildSchedule, partidaDuration } from "../../domain/scheduling";

const partida = (partida_id: number, fase: string, dias: number, costo = "1000") =>
  ({ partida_id, fase, duracion_dias: dias, costo_total: costo });

describe("cronograma de obra", () => {
  it("duracion redondea hacia arriba", () => {
    expect(partidaDuration(120, 10)).toBe(12);
    expect(partidaDuration(121, 10)).toBe(13);
  });

  it("duracion minima es un dia", () => expect(partidaDuration(0.5, 10)).toBe(1));

  it("rendimiento cero es error de dominio", () => {
    expect(() => partidaDuration(10, 0)).toThrow(/mayor que cero/);
  });

  it("proyecto sin partidas termina el dia que empieza", () => {
    const s = buildSchedule([], "2026-01-05");
    expect([s.partidas, s.duracion_dias, s.fecha_fin]).toEqual([[], 0, "2026-01-05"]);
  });

  it("una partida ocupa desde el inicio", () => {
    const s = buildSchedule([partida(1, "Mamposteria", 12)], "2026-01-05");
    expect([s.partidas[0].fecha_inicio, s.partidas[0].fecha_fin, s.fecha_fin, s.duracion_dias])
      .toEqual(["2026-01-05", "2026-01-16", "2026-01-16", 12]);
  });

  it("las partidas se encadenan sin solaparse", () => {
    const s = buildSchedule([partida(1, "Excavacion", 3), partida(2, "Cimentacion", 2)], "2026-03-01");
    const [a, b] = s.partidas;
    expect([a.fecha_inicio, a.fecha_fin, b.fecha_inicio, b.fecha_fin]).toEqual(["2026-03-01", "2026-03-03", "2026-03-04", "2026-03-05"]);
    expect([s.duracion_dias, s.fecha_fin]).toEqual([5, "2026-03-05"]);
  });

  it("las fases agrupan costo, duracion y conteo", () => {
    const s = buildSchedule(
      [partida(1, "Obra gris", 2, "1000"), partida(2, "Obra gris", 3, "2000"), partida(3, "Acabados", 1, "500")],
      "2026-01-01",
    );
    const fases = Object.fromEntries(s.fases.map((f) => [f.fase, f]));
    expect([fases["Obra gris"].partidas, fases["Obra gris"].duracion_dias, fases["Obra gris"].costo_total.toFixed(2)]).toEqual([2, 5, "3000.00"]);
    expect(fases["Acabados"].partidas).toBe(1);
    expect(s.costo_total.toFixed(2)).toBe("3500.00");
  });

  it("cruza fin de mes", () => expect(buildSchedule([partida(1, "Obra", 5)], "2026-01-29").partidas[0].fecha_fin).toBe("2026-02-02"));

  it("respeta anio bisiesto", () => expect(buildSchedule([partida(1, "Obra", 3)], "2028-02-28").partidas[0].fecha_fin).toBe("2028-03-01"));
});
