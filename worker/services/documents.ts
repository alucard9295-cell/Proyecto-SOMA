import { totalEfectivo, validar, type ItemFactura, type Veredicto } from "../../domain/facturas";
import { dec, money, toNumber } from "../../domain/money";
import { HttpError, invalid, notFound } from "../errors";
import type { Repos } from "../repositories";
import type { FacturaValues, JobRow } from "../repositories/documents";

interface ExtraccionResumen {
  emisor_nombre?: string | null;
  items?: unknown[];
  total?: string | number | null;
}

/** Fila de la lista, sin la extraccion completa: puede ser larga. */
function resumen(row: JobRow) {
  const extraccion: ExtraccionResumen = row.extraccion ? JSON.parse(row.extraccion) : {};
  return {
    job_id: row.job_id,
    archivo: row.nombre_original,
    estado: row.estado,
    motivo: row.motivo,
    parser: row.parser,
    intentos: row.intentos,
    actualizado: row.updated_at,
    emisor: extraccion.emisor_nombre ?? null,
    items: extraccion.items?.length ?? 0,
    total: extraccion.total ?? null,
  };
}

export async function listInReview(r: Repos) {
  const items = (await r.documents.jobsPorEstado("needs_review")).map(resumen);
  return { items, count: items.length };
}

export async function getJob(r: Repos, jobId: number) {
  const row = await r.documents.job(jobId);
  if (!row) throw notFound("Documento no encontrado.");
  // La extraccion completa solo en el detalle: es lo que se confirma renglon a renglon.
  return { ...resumen(row), extraccion: row.extraccion ? JSON.parse(row.extraccion) : null };
}

export async function summary(r: Repos) {
  const s = await r.summary.load();
  return {
    facturas: s.facturas,
    items: s.items,
    total_pagado: toNumber(s.total_pagado),
    proveedores: s.proveedores,
    alertas_calidad: s.en_revision,
    monthly: s.monthly.map((m) => ({ ...m, total: toNumber(m.total) })),
    providers_chart: s.providers.map((p) => ({ ...p, total: toNumber(p.total) })),
    quality: { total: s.facturas, con_total: s.con_total, con_fecha: s.con_fecha },
  };
}

// ---------------------------------------------------------------------------
// Carga de facturas. El navegador lee el PDF (pdf.js + domain/extraction) y
// manda el archivo junto con lo que extrajo. El servidor no vuelve a leer el
// PDF, pero tampoco cree el veredicto del cliente: recalcula la validacion con
// las mismas reglas del dominio y decide el estado.
// ---------------------------------------------------------------------------

/** Importes como texto decimal: asi viajan los Big serializados, sin float. */
export interface ItemEntrada {
  descripcion: string;
  cantidad: string | null;
  unidad: string | null;
  valor_unitario: string | null;
  valor_total: string | null;
}

export interface ExtraccionEntrada {
  emisor_nit: string | null;
  emisor_nombre: string | null;
  cliente_nit: string | null;
  cufe: string | null;
  fecha: string | null;
  parser: string | null;
  items: ItemEntrada[];
  subtotal: string | null;
  iva: string | null;
  total: string | null;
}

/** Lo minimo de R2 que usa la carga; los tests pueden pasar el binding real. */
export interface Almacen {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export interface Archivo {
  nombre: string;
  bytes: ArrayBuffer;
}

interface Contexto {
  actor: string;
  requestId: string;
}

export const MAX_PDF = 10 * 1024 * 1024;
const SIN_PERFIL = "Ningun perfil de emisor reconoce este documento.";
const CUFE_REPETIDO = "El CUFE ya esta registrado en otra factura.";

const dinero = (valor: string | null) => (valor === null ? null : money(valor));

function itemsDominio(items: ItemEntrada[]): ItemFactura[] {
  return items.map((i) => ({ descripcion: i.descripcion, unidad: i.unidad, cantidad: i.cantidad === null ? null : dec(i.cantidad), valor_unitario: dinero(i.valor_unitario), valor_total: dinero(i.valor_total) }));
}

function veredictoServidor(e: ExtraccionEntrada): Veredicto {
  const v = validar({ items: itemsDominio(e.items), subtotal: dinero(e.subtotal), iva: dinero(e.iva), total: dinero(e.total) });
  if (e.parser === null && !v.valida) return { ...v, motivos: [SIN_PERFIL, ...v.motivos] };
  return v;
}

function facturaDe(e: ExtraccionEntrada): FacturaValues {
  return {
    proveedor_nombre: e.emisor_nombre?.trim() || e.parser || "Proveedor sin nombre",
    proveedor_nit: e.emisor_nit,
    numero_factura: null,
    fecha_factura: e.fecha,
    cufe: e.cufe,
    subtotal: dinero(e.subtotal),
    iva: dinero(e.iva),
    total: dinero(e.total),
    items: itemsDominio(e.items).map((i) => ({ descripcion: i.descripcion, unidad: i.unidad ?? null, cantidad: i.cantidad == null ? null : Number(i.cantidad), valor_unitario: i.valor_unitario ?? null, valor_total: totalEfectivo(i) })),
  };
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const esPdf = (bytes: ArrayBuffer) => new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength))) === "%PDF-";

/**
 * Registra un PDF con su extraccion. Idempotente por contenido: el mismo
 * archivo dos veces devuelve el registro existente sin tocar nada.
 */
export async function subir(r: Repos, almacen: Almacen, archivo: Archivo, extraccion: ExtraccionEntrada, ctx: Contexto) {
  if (archivo.bytes.byteLength > MAX_PDF) throw new HttpError(413, "El PDF supera los 10 MB.");
  if (!esPdf(archivo.bytes)) throw invalid("El archivo no es un PDF.");
  const hash = await sha256(archivo.bytes);
  const previo = await r.documents.documentoPorHash(hash);
  if (previo) return { duplicado: true, documento_id: previo.documento_id, job_id: previo.job_id, estado: (previo.job_id && (await r.documents.job(previo.job_id))?.estado) || null, motivos: [] as string[] };

  let veredicto = veredictoServidor(extraccion);
  if (veredicto.valida && extraccion.cufe && (await r.documents.facturaPorCufe(extraccion.cufe))) {
    veredicto = { valida: false, motivos: [CUFE_REPETIDO], estado: "needs_review" };
  }
  const storage_key = `facturas/${hash}.pdf`;
  await almacen.put(storage_key, archivo.bytes, { httpMetadata: { contentType: "application/pdf" } });
  try {
    const ids = await r.documents.ingestar(
      { storage_key, content_hash: hash, nombre_original: archivo.nombre.slice(0, 240), mime: "application/pdf", bytes: archivo.bytes.byteLength },
      { estado: veredicto.estado, motivo: veredicto.motivos.join(" ") || null, parser: extraccion.parser ?? "sin-perfil", extraccion: { ...extraccion, veredicto }, request_id: ctx.requestId },
      veredicto.valida ? facturaDe(extraccion) : null,
    );
    return { duplicado: false, ...ids, estado: veredicto.estado, motivos: veredicto.motivos };
  } catch (error) {
    // Sin fila en D1 el objeto quedaria huerfano. La llave es el hash: si otra
    // peticion concurrente gano la carrera, su fila apunta al mismo contenido,
    // asi que solo se borra si de verdad no hay documento registrado.
    if (!(await r.documents.documentoPorHash(hash))) await almacen.delete(storage_key);
    throw error;
  }
}

/** Confirmacion humana: las cifras corregidas tienen que cerrar igual. */
export async function aprobar(r: Repos, jobId: number, correccion: ExtraccionEntrada, ctx: Contexto) {
  const row = await r.documents.job(jobId);
  if (!row) throw notFound("Documento no encontrado.");
  if (row.estado !== "needs_review") throw new HttpError(409, "Este documento ya no esta en revision.");
  const veredicto = validar({ items: itemsDominio(correccion.items), subtotal: dinero(correccion.subtotal), iva: dinero(correccion.iva), total: dinero(correccion.total) });
  if (!veredicto.valida) throw invalid(`La factura aun no cierra. ${veredicto.motivos.join(" ")}`);
  if (correccion.cufe && (await r.documents.facturaPorCufe(correccion.cufe))) throw new HttpError(409, CUFE_REPETIDO);
  const { factura_id } = await r.documents.aprobar(jobId, row.documento_id, facturaDe(correccion), { ...correccion, veredicto, corregida_por: ctx.actor });
  return { job_id: jobId, factura_id, estado: "validated" };
}

export async function descartar(r: Repos, jobId: number, motivo: string) {
  if (!(await r.documents.job(jobId))) throw notFound("Documento no encontrado.");
  if (!(await r.documents.descartar(jobId, motivo))) throw new HttpError(409, "Este documento ya no esta en revision.");
  return { job_id: jobId, estado: "discarded" };
}
