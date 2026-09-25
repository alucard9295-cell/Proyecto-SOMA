import { describe, expect, it } from "vitest";
import { costApu, costingToJson, lineCost } from "../../domain/costing";
import { money } from "../../domain/money";

const s = (value: { toFixed(dp: number): string }) => value.toFixed(2);

describe("formula AIU", () => {
  it("costo de insumo aplica rendimiento y desperdicio", () => {
    expect(s(lineCost({ rendimiento: "0.1", precio_unitario: "269231", desperdicio_pct: "0" }))).toBe("26923.10");
  });

  it("costo de insumo sin error de punto flotante (0.1 * 269231)", () => {
    const costo = lineCost({ rendimiento: "0.1", precio_unitario: "269231" });
    expect(costo.toString()).toBe("26923.1");
    expect(Number(costo)).toBe(26923.1);
  });

  it("desperdicio incrementa el costo", () => {
    expect(s(lineCost({ rendimiento: 2, precio_unitario: 1000 }))).toBe("2000.00");
    expect(s(lineCost({ rendimiento: 2, precio_unitario: 1000, desperdicio_pct: 10 }))).toBe("2200.00");
  });

  it("APU sin porcentajes es solo costo directo", () => {
    const c = costApu([{ rendimiento: 1, precio_unitario: 100 }], {});
    expect([s(c.costo_directo), s(c.precio_venta), s(c.iva)]).toEqual(["100.00", "100.00", "0.00"]);
  });

  it("AIU completo con IVA sobre utilidad", () => {
    const c = costApu([{ rendimiento: 1, precio_unitario: 1000 }], {
      administracion_pct: 5, imprevistos_pct: 5, utilidad_pct: 10, iva_pct: 19, iva_base: "utilidad",
    });
    expect(costingToJson(c)).toEqual({
      costo_directo: 1000, administracion: 50, imprevistos: 50, utilidad: 100,
      subtotal: 1200, base_iva: 100, iva: 19, precio_venta: 1219,
    });
  });

  it.each([
    ["utilidad", "100.00", "19.00"],
    ["directo", "1000.00", "190.00"],
    ["subtotal", "1200.00", "228.00"],
  ])("base del IVA %s cambia el resultado", (base, baseIva, iva) => {
    const c = costApu([{ rendimiento: 1, precio_unitario: 1000 }], {
      administracion_pct: 5, imprevistos_pct: 5, utilidad_pct: 10, iva_pct: 19, iva_base: base,
    });
    expect([s(c.base_iva), s(c.iva)]).toEqual([baseIva, iva]);
  });

  it("base de IVA desconocida cae en utilidad", () => {
    const c = costApu([{ rendimiento: 1, precio_unitario: 1000 }], { utilidad_pct: 10, iva_pct: 19, iva_base: "???" });
    expect(c.base_iva.eq(c.utilidad)).toBe(true);
  });

  it("APU sin insumos da cero", () => {
    const c = costApu([], { utilidad_pct: 10 });
    expect([s(c.costo_directo), s(c.precio_venta)]).toEqual(["0.00", "0.00"]);
  });

  it("varios insumos suman el costo directo", () => {
    const c = costApu([
      { rendimiento: 2, precio_unitario: 500 },
      { rendimiento: 1, precio_unitario: 250 },
      { rendimiento: 3, precio_unitario: 100, desperdicio_pct: 10 },
    ], {});
    expect(s(c.costo_directo)).toBe("1580.00");
  });

  it("costingToJson expone numbers con las ocho claves", () => {
    const payload = costingToJson(costApu([{ rendimiento: 1, precio_unitario: 100 }], {}));
    expect(payload.precio_venta).toBe(100);
    expect(Object.keys(payload).sort()).toEqual(
      ["administracion", "base_iva", "costo_directo", "imprevistos", "iva", "precio_venta", "subtotal", "utilidad"],
    );
  });

  it("money redondea a dos decimales, mitad hacia arriba", () => {
    expect(s(money("10.005"))).toBe("10.01");
    expect(s(money("10.004"))).toBe("10.00");
  });
});
