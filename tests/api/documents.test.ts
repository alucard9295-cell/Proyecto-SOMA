import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { dec } from "../../domain/money";
import { repos } from "../../worker/repositories";
import type { FacturaValues } from "../../worker/repositories/documents";
import { api } from "./helpers";

let seq = 0;
const doc = () => {
  seq += 1;
  return { storage_key: `facturas/${seq}.pdf`, content_hash: `hash-${seq}-${crypto.randomUUID()}`, nombre_original: `F${seq}.pdf`, mime: "application/pdf", bytes: 1234 };
};
const job = (estado: string, extraccion: unknown = {}) => ({ estado, motivo: estado === "needs_review" ? "Suma de renglones no cuadra" : null, parser: "pdfjs-v1", extraccion, request_id: "req-1" });
const factura = (overrides: Partial<FacturaValues> = {}): FacturaValues => ({
  proveedor_nombre: "Ferreteria El Tornillo", proveedor_nit: "900123456", numero_factura: `FE-${seq}`, fecha_factura: "2026-03-15",
  cufe: null, subtotal: dec("1000.10"), iva: dec("190.02"), total: dec("1190.12"),
  items: [
    { descripcion: "Cemento gris 50kg", unidad: "bulto", cantidad: 2, valor_unitario: dec("300.05"), valor_total: dec("600.10") },
    { descripcion: "Arena", unidad: "m3", cantidad: 1, valor_unitario: dec("400"), valor_total: dec("400") },
  ],
  ...overrides,
});

describe("ingesta de documentos", () => {
  it("una factura validada entra completa con sus renglones y dinero exacto", async () => {
    const r = repos(env.DB);
    const ids = await r.documents.ingestar(doc(), job("validated"), factura());
    expect(ids.factura_id).toBeGreaterThan(0);

    const f = await env.DB.prepare("SELECT documento_id, total_centavos FROM facturas WHERE factura_id = ?").bind(ids.factura_id).first<{ documento_id: number; total_centavos: number }>();
    expect(f).toEqual({ documento_id: ids.documento_id, total_centavos: 119012 });
    const items = await env.DB.prepare("SELECT valor_total_centavos FROM factura_items WHERE factura_id = ? ORDER BY item_id").bind(ids.factura_id).all<{ valor_total_centavos: number }>();
    expect(items.results.map((i) => i.valor_total_centavos)).toEqual([60010, 40000]);
    const j = await r.documents.job(ids.job_id);
    expect(j).toMatchObject({ documento_id: ids.documento_id, factura_id: ids.factura_id, estado: "validated", intentos: 1 });
  });

  it("needs_review guarda el documento y el job, pero ninguna factura", async () => {
    const antes = (await env.DB.prepare("SELECT COUNT(*) AS n FROM facturas").first<{ n: number }>())!.n;
    const ids = await repos(env.DB).documents.ingestar(doc(), job("needs_review", { emisor_nombre: "Proveedor X", items: [{}, {}, {}], total: "5000.00" }), null);
    expect(ids.factura_id).toBeNull();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM facturas").first<{ n: number }>())!.n).toBe(antes);

    const lista = (await api("/api/admin/documentos/revision")).body;
    const fila = lista.items.find((i: { job_id: number }) => i.job_id === ids.job_id);
    expect(fila).toMatchObject({ estado: "needs_review", emisor: "Proveedor X", items: 3, total: "5000.00", motivo: "Suma de renglones no cuadra" });
    expect(fila.extraccion).toBeUndefined(); // la lista no arrastra la extraccion completa

    const detalle = (await api(`/api/admin/documentos/revision/${ids.job_id}`)).body;
    expect(detalle.extraccion.items).toHaveLength(3);
  });

  it("el hash identifica el documento: un PDF repetido se detecta antes de reingestar", async () => {
    const d = doc();
    const ids = await repos(env.DB).documents.ingestar(d, job("validated"), factura());
    expect(await repos(env.DB).documents.documentoPorHash(d.content_hash)).toEqual({ documento_id: ids.documento_id, job_id: ids.job_id });
    expect(await repos(env.DB).documents.documentoPorHash("no-existe")).toBeNull();
    // La unicidad tambien la impone el esquema: el batch falla entero.
    const antes = (await env.DB.prepare("SELECT COUNT(*) AS n FROM document_jobs").first<{ n: number }>())!.n;
    await expect(repos(env.DB).documents.ingestar(d, job("validated"), factura())).rejects.toThrow();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM document_jobs").first<{ n: number }>())!.n).toBe(antes);
  });

  it("un CUFE repetido revierte todo el batch (sin documento huerfano)", async () => {
    const cufe = `cufe-${crypto.randomUUID()}`;
    await repos(env.DB).documents.ingestar(doc(), job("validated"), factura({ cufe }));
    expect(await repos(env.DB).documents.facturaPorCufe(cufe)).toMatchObject({ factura_id: expect.any(Number) });
    const d = doc();
    await expect(repos(env.DB).documents.ingestar(d, job("validated"), factura({ cufe }))).rejects.toThrow();
    expect(await repos(env.DB).documents.documentoPorHash(d.content_hash)).toBeNull();
  });

  it("detalle inexistente da 404 con mensaje en espanol", async () => {
    const r = await api("/api/admin/documentos/revision/999999");
    expect(r.status).toBe(404);
    expect(r.body.detail).toBe("Documento no encontrado.");
  });
});

describe("resumen del control room", () => {
  it("agrega facturas por mes y proveedor con sumas exactas", async () => {
    const antes = (await api("/api/admin/summary")).body;
    const proveedor = `Proveedor ${crypto.randomUUID().slice(0, 8)}`;
    // 0.10 + 0.20 en float da 0.30000000000000004; en centavos, exacto.
    await repos(env.DB).documents.ingestar(doc(), job("validated"), factura({ proveedor_nombre: proveedor, fecha_factura: "2025-11-02", total: dec("0.10") }));
    await repos(env.DB).documents.ingestar(doc(), job("validated"), factura({ proveedor_nombre: proveedor, fecha_factura: "2025-11-20", total: dec("0.20") }));
    await repos(env.DB).documents.ingestar(doc(), job("needs_review"), null);

    const s = (await api("/api/admin/summary")).body;
    expect(s.facturas).toBe(antes.facturas + 2);
    expect(s.items).toBe(antes.items + 4);
    expect(s.alertas_calidad).toBe(antes.alertas_calidad + 1);
    expect(s.total_pagado).toBe(Number((antes.total_pagado + 0.3).toFixed(2)));
    expect(s.monthly.find((m: { mes: string }) => m.mes === "2025-11")?.total).toBe(0.3);
    expect(Object.keys(s)).toEqual(["facturas", "items", "total_pagado", "proveedores", "alertas_calidad", "monthly", "providers_chart", "quality"]);
  });
});
