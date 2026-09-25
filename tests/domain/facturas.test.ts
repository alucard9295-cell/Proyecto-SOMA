import { describe, expect, it } from "vitest";
import { parseMoney, primerImporte, totalEfectivo, validar } from "../../domain/facturas";
import { dec } from "../../domain/money";

// Cifras tomadas de facturas reales de proveedor, no inventadas.
describe("lectura de importes", () => {
  it.each([
    ["$150,000.00", "150000.00"],
    ["$28,571.00", "28571.00"],
    ["73.361,34", "73361.34"],
    ["13.938,66", "13938.66"],
    ["330.000", "330000.00"],
    ["346.500", "346500.00"],
    ["1092", "1092.00"],
    ["$ 87.300,00", "87300.00"],
  ])("parseMoney(%s) = %s", (texto, esperado) => {
    expect(parseMoney(texto)?.toFixed(2)).toBe(esperado);
  });

  it.each([null, "", "   ", "IVA", "$", "-"])("parseMoney(%s) devuelve null en vez de lanzar", (texto) => {
    expect(parseMoney(texto)).toBeNull();
  });

  it("no concatena dos importes vecinos", () => {
    expect(parseMoney("$285,714.00 $340,000.00")?.toFixed(2)).toBe("285714.00");
  });

  it("primerImporte ignora el porcentaje y el anio", () => {
    expect(primerImporte("IVA 19% $69,725.00")?.toFixed(2)).toBe("69725.00");
    expect(primerImporte("Fecha de Generacion 06/02/2026 11:52")).toBeNull();
  });
});

describe("validacion de factura", () => {
  it("factura que cierra queda validada (Eleequipos FESE 1348)", () => {
    const v = validar({
      items: [{ descripcion: "VENTA DE MADERA", cantidad: dec(1), valor_unitario: dec(330000), valor_total: dec(330000) }],
      subtotal: 330000, iva: 16500, total: 346500,
    });
    expect(v).toEqual({ valida: true, motivos: [], estado: "validated" });
  });

  it("tolera un peso de redondeo", () => {
    const v = validar({ items: [{ descripcion: "varios", valor_total: dec(1366218) }], subtotal: 1366218, iva: 183581, total: 1549800 });
    expect(v.valida).toBe(true);
  });

  it("items ilegibles no pasan aunque el pie cuadre", () => {
    const v = validar({ items: [{ descripcion: "basura", valor_total: dec(5) }], subtotal: "73361.34", iva: "13938.66", total: "87300.00" });
    expect(v.estado).toBe("needs_review");
    expect(v.motivos).toContain("La suma de los items (5.00) no coincide con el subtotal (73361.34).");
  });

  it("pie que no cuadra no pasa", () => {
    const v = validar({ items: [{ descripcion: "x", valor_total: dec(100000) }], subtotal: 100000, iva: 19000, total: 500000 });
    expect(v.motivos).toContain("Subtotal mas IVA (119000.00) no coincide con el total (500000.00).");
  });

  it("factura sin items va a revision", () => {
    const v = validar({ items: [], subtotal: 1000, iva: 0, total: 1000 });
    expect(v.motivos).toEqual(["La factura no tiene items legibles."]);
  });

  it("item sin total declarado usa cantidad por unitario", () => {
    expect(totalEfectivo({ descripcion: "Cemento", cantidad: dec(10), valor_unitario: dec("28571.00") })?.toFixed(2)).toBe("285710.00");
  });

  it("item sin importes no es calculable", () => {
    expect(totalEfectivo({ descripcion: "sin datos" })).toBeNull();
  });
});
