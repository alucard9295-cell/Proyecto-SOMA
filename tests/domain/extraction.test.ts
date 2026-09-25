/**
 * Extractor sobre paginas sinteticas: las facturas reales no se versionan (datos
 * de proveedores). La paridad con el extractor Python sobre los 60 PDFs reales
 * la mide tools/extraction-parity.ts.
 */
import { describe, expect, it } from "vitest";
import { extraer, fechaIso, filas, type Pagina, type Palabra } from "../../domain/extraction";

/** Una fila: pares [x, texto]; cada texto es una palabra. */
const fila = (y: number, celdas: [number, string][]): Palabra[] =>
  celdas.flatMap(([x, texto]) => texto.split(" ").map((t, i) => ({ text: t, x0: x + i * 30, x1: x + i * 30 + t.length * 5, top: y - 4, bottom: y + 4 })));

const CUFE = "ab12".repeat(24);

// ELEEQUIPOS: ITEM | CODIGO | DESCRIPCION | CANTIDAD | U | VALOR | TOTAL
const COLS = { item: 20, codigo: 50, desc: 100, cant: 250, u: 300, valor: 340, total: 420 };
const renglon = (y: number, n: string, cod: string, desc: string, cant: string, u: string, valor: string, total: string) =>
  fila(y, [[COLS.item, n], [COLS.codigo, cod], [COLS.desc, desc], [COLS.cant, cant], [COLS.u, u], [COLS.valor, valor], [COLS.total, total]]);

function eleequipos(pie: [number, string][][] = [
  [[20, "SUBTOTAL"], [100, "$700,000.00"]],
  [[20, "IVA 19%"], [100, "$133,000.00"]],
  [[20, "TOTAL A PAGAR"], [130, "$833,000.00"]],
]): Pagina {
  return [
    ...fila(10, [[20, "ELEEQUIPOS SAS NIT: 901.464.983-1"]]),
    ...fila(20, [[20, "Fecha: 15/03/2026 Cliente 901.687.820"]]),
    ...fila(30, [[20, "CUFE:"], [60, CUFE.slice(0, 48)], [300, CUFE.slice(48)]]),
    ...fila(40, [[COLS.item, "ITEM"], [COLS.codigo, "CÓDIGO"], [COLS.desc, "DESCRIPCIÓN"], [COLS.cant, "CANTIDAD"], [COLS.u, "U"], [COLS.valor, "VALOR"], [COLS.total, "TOTAL"]]),
    ...renglon(50, "1", "C01", "Cemento", "2", "UND", "300,000.00", "600,000.00"),
    // "IVA" con importe dentro de un renglon: no debe tomarse como IVA de la factura.
    ...renglon(60, "2", "C02", "Tubo", "1", "", "100,000.00", "100,000.00"),
    ...fila(60, [[160, "IVA"], [190, "$285,714.00"]]),
    // Texto que no empieza por numero de linea: no es item.
    ...fila(70, [[20, "Observaciones de entrega $50,000.00"]]),
    ...pie.flatMap((celdas, i) => fila(80 + i * 10, celdas)),
  ];
}

describe("extraer", () => {
  it("lee cabecera, renglones y pie de una factura que cierra", () => {
    const f = extraer([eleequipos()]);
    expect(f.veredicto).toEqual({ valida: true, motivos: [], estado: "validated" });
    expect(f).toMatchObject({ emisor_nit: "901464983", cliente_nit: "901687820", cufe: CUFE, fecha: "2026-03-15", parser: "ELEEQUIPOS SAS" });
    expect(f.items.map((i) => [i.descripcion, i.cantidad?.toString(), i.unidad, i.valor_total?.toString()])).toEqual([
      ["Cemento", "2", "UND", "600000"],
      ["Tubo IVA $285,714.00", "1", null, "100000"],
    ]);
    expect([f.subtotal, f.iva, f.total].map(String)).toEqual(["700000", "133000", "833000"]);
  });

  it("el 19 de 'IVA 19%' no es un importe: exige separador de miles", () => {
    const f = extraer([eleequipos([[[20, "SUBTOTAL"], [100, "$700,000.00"]], [[20, "IVA 19%"]], [[20, "TOTAL A PAGAR"], [130, "$833,000.00"]]])]);
    expect(f.iva).toBeNull();
    expect(f.veredicto.estado).toBe("needs_review");
  });

  it("la etiqueta larga gana: 'TOTAL A PAGAR' no se confunde con el TOTAL de otra linea", () => {
    const f = extraer([eleequipos([[[20, "SUBTOTAL"], [100, "$700,000.00"]], [[20, "IVA"], [100, "$133,000.00"]], [[20, "TOTAL A PAGAR"], [130, "$833,000.00"]]])]);
    expect(f.total?.toString()).toBe("833000");
  });

  it("una suma que no cierra queda en revision con el motivo", () => {
    const f = extraer([eleequipos([[[20, "SUBTOTAL"], [100, "$700,000.00"]], [[20, "IVA"], [100, "$133,000.00"]], [[20, "TOTAL A PAGAR"], [130, "$900,000.00"]]])]);
    expect(f.veredicto.estado).toBe("needs_review");
    expect(f.veredicto.motivos.join(" ")).toMatch(/total/i);
  });

  it("'Total' como palabra completa: no hace match dentro de 'Subtotal'", () => {
    const ferreteria = (pie: [number, string][][]) => [[
      ...fila(10, [[20, "FERRETERIA CONSTRUCTIVA NIT 901649012"]]),
      ...pie.flatMap((celdas, i) => fila(80 + i * 10, celdas)),
    ]];
    expect(extraer(ferreteria([[[20, "Subtotal"], [100, "$100,000.00"]]])).total).toBeNull();
    const f = extraer(ferreteria([[[20, "Subtotal"], [100, "$100,000.00"]], [[20, "Total"], [100, "$119,000.00"]]]));
    expect([f.subtotal?.toString(), f.total?.toString()]).toEqual(["100000", "119000"]);
  });

  it("sin perfil de emisor, revision y nunca excepcion", () => {
    const f = extraer([fila(10, [[20, "Proveedor desconocido NIT 123456789"]])]);
    expect(f.veredicto).toEqual({ valida: false, motivos: ["Ningun perfil de emisor reconoce este documento."], estado: "needs_review" });
    expect(extraer([]).veredicto.estado).toBe("needs_review");
  });
});

describe("apoyo", () => {
  it("agrupa por centro vertical con tolerancia y ordena por X", () => {
    const palabras = [...fila(50.0, [[200, "b"]]), ...fila(51.5, [[100, "a"]]), ...fila(60, [[10, "c"]])];
    expect(filas(palabras).map(([, ps]) => ps.map((p) => p.text).join(" "))).toEqual(["a b", "c"]);
  });

  it("fecha a ISO desde los dos formatos colombianos", () => {
    expect(fechaIso("05/03/2025")).toBe("2025-03-05");
    expect(fechaIso("2026/01/29")).toBe("2026-01-29");
    expect(fechaIso("2026-01-29")).toBe("2026-01-29");
    expect(fechaIso(null)).toBeNull();
  });
});
