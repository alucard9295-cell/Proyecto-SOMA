import { toCents, type Decimal } from "../../domain/money";
import { all, lastId } from "./db";

export interface DocumentValues {
  storage_key: string;
  content_hash: string;
  nombre_original: string;
  mime: string | null;
  bytes: number;
}

export interface FacturaValues {
  proveedor_nombre: string;
  proveedor_nit: string | null;
  numero_factura: string | null;
  fecha_factura: string | null;
  cufe: string | null;
  subtotal: Decimal | null;
  iva: Decimal | null;
  total: Decimal | null;
  items: {
    descripcion: string;
    unidad: string | null;
    cantidad: number | null;
    valor_unitario: Decimal | null;
    valor_total: Decimal | null;
  }[];
}

export interface JobValues {
  estado: string;
  motivo: string | null;
  parser: string;
  extraccion: unknown;
  request_id: string | null;
}

export interface JobRow {
  job_id: number;
  documento_id: number;
  estado: string;
  intentos: number;
  motivo: string | null;
  parser: string | null;
  extraccion: string | null;
  factura_id: number | null;
  request_id: string | null;
  created_at: string;
  updated_at: string;
  nombre_original: string;
  storage_key: string;
}

const cents = (value: Decimal | null) => (value === null ? null : toCents(value));

export function documentsRepository(db: D1Database) {
  const insertFactura = (documentoId: string, f: FacturaValues) => [
    db
      .prepare(
        `INSERT INTO facturas (documento_id, proveedor_nombre, proveedor_nit, numero_factura, fecha_factura, cufe,
                               subtotal_centavos, iva_centavos, total_centavos)
         VALUES (${documentoId}, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(f.proveedor_nombre, f.proveedor_nit, f.numero_factura, f.fecha_factura, f.cufe, cents(f.subtotal), cents(f.iva), cents(f.total)),
    ...f.items.map((item) =>
      db
        .prepare(
          `INSERT INTO factura_items (factura_id, descripcion_cruda, unidad_medida, cantidad, valor_unitario_centavos, valor_total_centavos)
           VALUES (${lastId("facturas", "factura_id")}, ?, ?, ?, ?, ?)`,
        )
        .bind(item.descripcion, item.unidad, item.cantidad, cents(item.valor_unitario), cents(item.valor_total)),
    ),
  ];

  return {
    async documentoPorHash(hash: string): Promise<{ documento_id: number; job_id: number | null } | null> {
      return db
        .prepare(
          `SELECT d.documento_id, MAX(j.job_id) AS job_id
             FROM documentos_raw d LEFT JOIN document_jobs j ON j.documento_id = d.documento_id
            WHERE d.content_hash = ? GROUP BY d.documento_id`,
        )
        .bind(hash)
        .first();
    },

    async facturaPorCufe(cufe: string): Promise<{ factura_id: number } | null> {
      return db.prepare("SELECT factura_id FROM facturas WHERE cufe = ?").bind(cufe).first();
    },

    /**
     * Registra documento, job y (si la extraccion cerro) factura con items, todo
     * en un batch: o entra completo o no entra. Nunca una factura sin renglones.
     */
    async ingestar(doc: DocumentValues, job: JobValues, factura: FacturaValues | null): Promise<{ documento_id: number; job_id: number; factura_id: number | null }> {
      const docId = lastId("documentos_raw", "documento_id");
      const statements = [
        db
          .prepare("INSERT INTO documentos_raw (storage_key, content_hash, nombre_original, mime, bytes) VALUES (?,?,?,?,?)")
          .bind(doc.storage_key, doc.content_hash, doc.nombre_original, doc.mime, doc.bytes),
        ...(factura ? insertFactura(docId, factura) : []),
        db
          .prepare(
            `INSERT INTO document_jobs (documento_id, estado, intentos, motivo, parser, extraccion, factura_id, request_id)
             VALUES (${docId}, ?, 1, ?, ?, ?, ${factura ? lastId("facturas", "factura_id") : "NULL"}, ?)`,
          )
          .bind(job.estado, job.motivo, job.parser, JSON.stringify(job.extraccion), job.request_id),
      ];
      const results = await db.batch(statements);
      const job_id = Number(results[results.length - 1].meta.last_row_id);
      const documento_id = Number(results[0].meta.last_row_id);
      const factura_id = factura ? Number(results[1].meta.last_row_id) : null;
      return { documento_id, job_id, factura_id };
    },

    /**
     * Confirma un documento en revision con las cifras corregidas: crea la
     * factura con sus renglones y cierra el job en el mismo batch. La condicion
     * sobre `estado` evita cerrar dos veces el mismo job.
     */
    async aprobar(jobId: number, documentoId: number, factura: FacturaValues, extraccion: unknown): Promise<{ factura_id: number }> {
      const results = await db.batch([
        ...insertFactura(String(Number(documentoId)), factura),
        db
          .prepare(
            `UPDATE document_jobs
                SET estado = 'validated', motivo = NULL, extraccion = ?, intentos = intentos + 1,
                    factura_id = ${lastId("facturas", "factura_id")}, updated_at = CURRENT_TIMESTAMP
              WHERE job_id = ? AND estado = 'needs_review'`,
          )
          .bind(JSON.stringify(extraccion), jobId),
      ]);
      return { factura_id: Number(results[0].meta.last_row_id) };
    },

    /** Saca un documento de la cola sin crear factura (duplicado, no es nuestro...). */
    async descartar(jobId: number, motivo: string): Promise<boolean> {
      const r = await db
        .prepare("UPDATE document_jobs SET estado = 'discarded', motivo = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ? AND estado = 'needs_review'")
        .bind(motivo, jobId)
        .run();
      return r.meta.changes > 0;
    },

    jobsPorEstado(estado: string): Promise<JobRow[]> {
      return all<JobRow>(
        db
          .prepare(
            `SELECT j.*, d.nombre_original, d.storage_key
               FROM document_jobs j JOIN documentos_raw d ON d.documento_id = j.documento_id
              WHERE j.estado = ? ORDER BY j.updated_at DESC, j.job_id DESC`,
          )
          .bind(estado),
      );
    },

    job(jobId: number): Promise<JobRow | null> {
      return db
        .prepare(
          `SELECT j.*, d.nombre_original, d.storage_key
             FROM document_jobs j JOIN documentos_raw d ON d.documento_id = j.documento_id
            WHERE j.job_id = ?`,
        )
        .bind(jobId)
        .first<JobRow>();
    },
  };
}
