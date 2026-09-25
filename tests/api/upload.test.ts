/**
 * Carga de facturas: PDF a R2 + extraccion del navegador, revalidada en el
 * servidor. Los PDFs son sinteticos (solo la cabecera %PDF-): el servidor no
 * vuelve a leerlos, asi que el contenido real no cambia lo que se prueba.
 */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { api } from "./helpers";

const pdf = (marca = crypto.randomUUID()) => new File([`%PDF-1.7\n% ${marca}\n`], `factura-${marca.slice(0, 6)}.pdf`, { type: "application/pdf" });

const extraccion = (overrides: Record<string, unknown> = {}) => ({
  emisor_nit: "901464983", emisor_nombre: "ELEEQUIPOS SAS", cliente_nit: "901687820", cufe: `cufe-${crypto.randomUUID()}`,
  fecha: "2026-03-15", parser: "ELEEQUIPOS SAS",
  items: [
    { descripcion: "Cemento", cantidad: "2", unidad: "UND", valor_unitario: "300000.00", valor_total: "600000.00" },
    { descripcion: "Tubo", cantidad: "1", unidad: null, valor_unitario: "100000.00", valor_total: "100000.00" },
  ],
  subtotal: "700000.00", iva: "133000.00", total: "833000.00",
  ...overrides,
});

function subir(archivo: File | string | null, datos: unknown = extraccion(), origen = "http://localhost") {
  const form = new FormData();
  if (archivo !== null) form.set("archivo", archivo);
  form.set("extraccion", typeof datos === "string" ? datos : JSON.stringify(datos));
  // El navegador siempre manda Origin en un POST; app.request usa http://localhost.
  return api("/api/admin/documentos", { method: "POST", body: form, headers: { Origin: origen } });
}

const cuenta = async (tabla: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).first<{ n: number }>())!.n;

describe("POST /api/admin/documentos", () => {
  it("un formulario desde otro sitio no puede subir facturas con la cookie de Access", async () => {
    const r = await subir(pdf(), extraccion(), "https://evil.example");
    expect(r.status).toBe(403);
    expect(await cuenta("documentos_raw")).toBe(0);
  });

  it("una factura que cierra entra validada: PDF en R2, factura en D1 y auditoria", async () => {
    const r = await subir(pdf());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ duplicado: false, estado: "validated", motivos: [], factura_id: expect.any(Number) });

    const doc = await env.DB.prepare("SELECT storage_key, content_hash, bytes FROM documentos_raw WHERE documento_id = ?").bind(r.body.documento_id).first<{ storage_key: string; content_hash: string; bytes: number }>();
    expect(doc!.storage_key).toBe(`facturas/${doc!.content_hash}.pdf`);
    const objeto = await env.FILES!.get(doc!.storage_key);
    expect(objeto?.httpMetadata?.contentType).toBe("application/pdf");
    expect((await objeto!.text()).startsWith("%PDF-")).toBe(true);

    const f = await env.DB.prepare("SELECT total_centavos, proveedor_nombre FROM facturas WHERE factura_id = ?").bind(r.body.factura_id).first();
    expect(f).toEqual({ total_centavos: 83300000, proveedor_nombre: "ELEEQUIPOS SAS" });
    const audit = await env.DB.prepare("SELECT event_type FROM audit_events WHERE event_type = 'document.uploaded' AND details LIKE ?").bind(`%"job_id":${r.body.job_id},%`).first();
    expect(audit).toEqual({ event_type: "document.uploaded" });
  });

  it("el servidor decide el veredicto: una suma que no cierra va a revision aunque el cliente diga otra cosa", async () => {
    const r = await subir(pdf(), { ...extraccion({ total: "900000.00" }), veredicto: { valida: true, motivos: [], estado: "validated" } });
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe("needs_review");
    expect(r.body.factura_id).toBeNull();
    expect(r.body.motivos.join(" ")).toMatch(/no coincide con el total/);
    const detalle = (await api(`/api/admin/documentos/revision/${r.body.job_id}`)).body;
    expect(detalle.extraccion.veredicto.estado).toBe("needs_review");
  });

  it("sin perfil de emisor queda en revision y lo dice primero", async () => {
    const r = await subir(pdf(), extraccion({ parser: null, emisor_nit: null, emisor_nombre: null, items: [], subtotal: null, iva: null, total: null }));
    expect(r.body.estado).toBe("needs_review");
    expect(r.body.motivos[0]).toBe("Ningun perfil de emisor reconoce este documento.");
  });

  it("es idempotente por contenido: el mismo PDF dos veces no duplica nada", async () => {
    const archivo = pdf();
    const primero = await subir(archivo);
    const antes = await Promise.all(["documentos_raw", "document_jobs", "facturas"].map(cuenta));
    const segundo = await subir(archivo, extraccion());
    expect(segundo.status).toBe(200);
    expect(segundo.body).toMatchObject({ duplicado: true, documento_id: primero.body.documento_id, job_id: primero.body.job_id, estado: "validated" });
    expect(await Promise.all(["documentos_raw", "document_jobs", "facturas"].map(cuenta))).toEqual(antes);
  });

  it("un CUFE ya registrado no rompe la carga: el documento queda en revision", async () => {
    const cufe = `cufe-${crypto.randomUUID()}`;
    await subir(pdf(), extraccion({ cufe }));
    const r = await subir(pdf(), extraccion({ cufe }));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ estado: "needs_review", factura_id: null, motivos: ["El CUFE ya esta registrado en otra factura."] });
  });

  it("rechaza lo que no es PDF, entradas malformadas y dinero con float", async () => {
    expect((await subir(new File(["hola"], "x.pdf"))).body.detail).toBe("El archivo no es un PDF.");
    expect((await subir(null)).status).toBe(422);
    expect((await subir(pdf(), "{no-json")).status).toBe(422);
    const float = await subir(pdf(), extraccion({ total: 833000.0 }));
    expect(float.status).toBe(422);
    expect(float.body.detail).toMatch(/total/);
    expect((await subir(pdf(), extraccion({ total: "833000.001" }))).status).toBe(422);
  });

  it("el PDF tiene su propio techo de tamano, por encima del limite del JSON", async () => {
    const grande = new File(["%PDF-", new Uint8Array(3 * 1024 * 1024)], "grande.pdf");
    expect((await subir(grande)).status).toBe(201); // 3 MB: pasa, el JSON normal no
    const enorme = new File(["%PDF-", new Uint8Array(13 * 1024 * 1024)], "enorme.pdf");
    const r = await subir(enorme);
    expect(r.status).toBe(413);
    expect(r.body.detail).toBe("El PDF supera los 10 MB.");
    const json = await api("/api/admin/supplies/1", { method: "PUT", json: { nombre_normalizado: "x".repeat(3 * 1024 * 1024), categoria: "material" } });
    expect(json.status).toBe(413);
  });
});

describe("revision humana", () => {
  const enRevision = async () => (await subir(pdf(), extraccion({ total: "900000.00" }))).body.job_id as number;

  it("aprobar con cifras corregidas crea la factura y saca el job de la cola", async () => {
    const jobId = await enRevision();
    const r = await api(`/api/admin/documentos/revision/${jobId}/aprobar`, { method: "POST", json: extraccion() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ job_id: jobId, estado: "validated", factura_id: expect.any(Number) });
    const job = (await api(`/api/admin/documentos/revision/${jobId}`)).body;
    expect(job).toMatchObject({ estado: "validated", motivo: null, intentos: 2 });
    expect(job.extraccion.corregida_por).toBe("dev@local");
    const cola = (await api("/api/admin/documentos/revision")).body.items.map((i: { job_id: number }) => i.job_id);
    expect(cola).not.toContain(jobId);
    // Aprobar dos veces no crea otra factura.
    expect((await api(`/api/admin/documentos/revision/${jobId}/aprobar`, { method: "POST", json: extraccion() })).status).toBe(409);
  });

  it("una correccion que aun no cierra se rechaza con el motivo y no toca nada", async () => {
    const jobId = await enRevision();
    const antes = await cuenta("facturas");
    const r = await api(`/api/admin/documentos/revision/${jobId}/aprobar`, { method: "POST", json: extraccion({ subtotal: "650000.00", total: "783000.00" }) });
    expect(r.status).toBe(422);
    expect(r.body.detail).toMatch(/^La factura aun no cierra\. La suma de los items/);
    expect(await cuenta("facturas")).toBe(antes);
  });

  it("descartar saca el documento de la cola sin factura", async () => {
    const jobId = await enRevision();
    const r = await api(`/api/admin/documentos/revision/${jobId}/descartar`, { method: "POST", json: { motivo: "No es una factura de obra." } });
    expect(r.body).toEqual({ job_id: jobId, estado: "discarded" });
    expect((await api(`/api/admin/documentos/revision/${jobId}`)).body).toMatchObject({ estado: "discarded", motivo: "No es una factura de obra." });
    expect(await env.DB.prepare("SELECT factura_id FROM document_jobs WHERE job_id = ?").bind(jobId).first()).toEqual({ factura_id: null });
    expect((await api(`/api/admin/documentos/revision/${jobId}/descartar`, { method: "POST", json: { motivo: "otra vez" } })).status).toBe(409);
    expect((await api("/api/admin/documentos/revision/999999/descartar", { method: "POST", json: { motivo: "x" } })).status).toBe(404);
  });
});
