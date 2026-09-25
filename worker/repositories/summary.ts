import { fromCents, type Decimal } from "../../domain/money";

export interface SummaryData {
  facturas: number;
  items: number;
  total_pagado: Decimal;
  proveedores: number;
  con_total: number;
  con_fecha: number;
  en_revision: number;
  monthly: { mes: string; total: Decimal; facturas: number }[];
  providers: { proveedor: string; total: Decimal; facturas: number }[];
}

export function summaryRepository(db: D1Database) {
  return {
    /** Cuatro consultas en un solo viaje a D1. Las sumas son enteras (centavos): exactas. */
    async load(): Promise<SummaryData> {
      const [totals, review, monthly, providers] = await db.batch([
        db.prepare(
          `SELECT COUNT(*) AS facturas,
                  (SELECT COUNT(*) FROM factura_items) AS items,
                  COALESCE(SUM(total_centavos), 0) AS total_c,
                  COUNT(DISTINCT COALESCE(proveedor_nit, proveedor_nombre)) AS proveedores,
                  COUNT(total_centavos) AS con_total,
                  COUNT(fecha_factura) AS con_fecha
             FROM facturas`,
        ),
        db.prepare("SELECT COUNT(*) AS en_revision FROM document_jobs WHERE estado = 'needs_review'"),
        db.prepare(
          `SELECT substr(fecha_factura, 1, 7) AS mes, COALESCE(SUM(total_centavos), 0) AS total_c, COUNT(*) AS facturas
             FROM facturas WHERE fecha_factura IS NOT NULL GROUP BY mes ORDER BY mes`,
        ),
        db.prepare(
          `SELECT proveedor_nombre AS proveedor, COALESCE(SUM(total_centavos), 0) AS total_c, COUNT(*) AS facturas
             FROM facturas GROUP BY COALESCE(proveedor_nit, proveedor_nombre) ORDER BY total_c DESC LIMIT 8`,
        ),
      ]);
      const t = totals.results[0] as { facturas: number; items: number; total_c: number; proveedores: number; con_total: number; con_fecha: number };
      type Group = { total_c: number; facturas: number };
      return {
        facturas: t.facturas,
        items: t.items,
        total_pagado: fromCents(t.total_c),
        proveedores: t.proveedores,
        con_total: t.con_total,
        con_fecha: t.con_fecha,
        en_revision: (review.results[0] as { en_revision: number }).en_revision,
        monthly: (monthly.results as (Group & { mes: string })[]).map(({ total_c, ...r }) => ({ ...r, total: fromCents(total_c) })),
        providers: (providers.results as (Group & { proveedor: string })[]).map(({ total_c, ...r }) => ({ ...r, total: fromCents(total_c) })),
      };
    },
  };
}
