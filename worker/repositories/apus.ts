import { fromCents, money, toCents, type Decimal } from "../../domain/money";
import { all, lastId, placeholders } from "./db";

export interface ApuRow {
  apu_id: number;
  nombre_partida: string;
  unidad: string;
  descripcion: string | null;
  categoria: string;
  administracion_pct: number;
  imprevistos_pct: number;
  utilidad_pct: number;
  iva_pct: number;
  iva_base: string;
}

export interface ApuDetail {
  detalle_id: number;
  apu_id: number;
  insumo_id: number;
  categoria: string;
  rendimiento: number;
  desperdicio_pct: number;
  /** Precio fijado a mano; null = usar el del catalogo. */
  precio_unitario: Decimal | null;
  nombre_normalizado: string;
  unidad_estandar: string | null;
  precio_catalogo: Decimal;
}

export type ApuValues = Omit<ApuRow, "apu_id">;

export interface ApuDetailValues {
  insumo_id: number;
  categoria: string;
  rendimiento: number;
  desperdicio_pct: number;
  precio_unitario: Decimal | null;
}

interface DetailRow extends Omit<ApuDetail, "precio_unitario" | "precio_catalogo"> {
  precio_unitario_centavos: number | null;
  catalogo_c: number | null;
}

const DETAILS = `
  SELECT ad.detalle_id, ad.apu_id, ad.insumo_id, ad.categoria, ad.rendimiento, ad.desperdicio_pct,
         ad.precio_unitario_centavos, i.nombre_normalizado, i.unidad_estandar,
         AVG(fi.valor_unitario_centavos) AS catalogo_c
    FROM apu_detalle ad
    JOIN insumos_maestros i ON i.insumo_id = ad.insumo_id
    LEFT JOIN factura_items fi ON fi.insumo_id = i.insumo_id`;

const toDetail = ({ precio_unitario_centavos, catalogo_c, ...row }: DetailRow): ApuDetail => ({
  ...row,
  precio_unitario: precio_unitario_centavos === null ? null : fromCents(precio_unitario_centavos),
  precio_catalogo: catalogo_c === null ? money(0) : money(fromCents(1).times(catalogo_c)),
});

const APU_COLUMNS = "nombre_partida, unidad, descripcion, categoria, administracion_pct, imprevistos_pct, utilidad_pct, iva_pct, iva_base";
const apuParams = (v: ApuValues) => [
  v.nombre_partida, v.unidad, v.descripcion, v.categoria,
  v.administracion_pct, v.imprevistos_pct, v.utilidad_pct, v.iva_pct, v.iva_base,
];

export function apusRepository(db: D1Database) {
  const insertDetail = (apuIdSql: string, detail: ApuDetailValues, apuId?: number) =>
    db
      .prepare(
        `INSERT INTO apu_detalle (apu_id, insumo_id, categoria, rendimiento, desperdicio_pct, precio_unitario_centavos)
         VALUES (${apuIdSql}, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ...(apuId === undefined ? [] : [apuId]),
        detail.insumo_id, detail.categoria, detail.rendimiento, detail.desperdicio_pct,
        detail.precio_unitario === null ? null : toCents(detail.precio_unitario),
      );

  return {
    async listIds(): Promise<number[]> {
      return (await all<{ apu_id: number }>(db.prepare("SELECT apu_id FROM apus ORDER BY apu_id DESC"))).map((r) => r.apu_id);
    },

    async getMany(ids: number[]): Promise<Map<number, ApuRow>> {
      if (!ids.length) return new Map();
      const rows = await all<ApuRow>(db.prepare(`SELECT * FROM apus WHERE apu_id IN (${placeholders(ids.length)})`).bind(...ids));
      return new Map(rows.map((row) => [row.apu_id, row]));
    },

    /** Detalles de varios APUs en una consulta: sin N+1 al armar un listado. */
    async detailsMany(ids: number[]): Promise<Map<number, ApuDetail[]>> {
      const grouped = new Map<number, ApuDetail[]>(ids.map((id) => [id, []]));
      if (!ids.length) return grouped;
      const rows = await all<DetailRow>(
        db
          .prepare(`${DETAILS} WHERE ad.apu_id IN (${placeholders(ids.length)}) GROUP BY ad.detalle_id ORDER BY ad.apu_id, ad.detalle_id`)
          .bind(...ids),
      );
      for (const row of rows) grouped.get(row.apu_id)?.push(toDetail(row));
      return grouped;
    },

    async exists(id: number): Promise<boolean> {
      return (await db.prepare("SELECT 1 FROM apus WHERE apu_id = ?").bind(id).first()) !== null;
    },

    /** Crea el APU y sus detalles en una transaccion (un batch de D1). */
    async insert(values: ApuValues, details: ApuDetailValues[]): Promise<number> {
      const results = await db.batch([
        db.prepare(`INSERT INTO apus (${APU_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?)`).bind(...apuParams(values)),
        ...details.map((detail) => insertDetail(lastId("apus", "apu_id"), detail)),
      ]);
      return Number(results[0].meta.last_row_id);
    },

    /** Reemplaza cabecera y detalles en una transaccion. */
    async update(id: number, values: ApuValues, details: ApuDetailValues[]): Promise<void> {
      await db.batch([
        db
          .prepare(
            `UPDATE apus SET nombre_partida=?, unidad=?, descripcion=?, categoria=?, administracion_pct=?,
             imprevistos_pct=?, utilidad_pct=?, iva_pct=?, iva_base=? WHERE apu_id=?`,
          )
          .bind(...apuParams(values), id),
        db.prepare("DELETE FROM apu_detalle WHERE apu_id = ?").bind(id),
        ...details.map((detail) => insertDetail("?", detail, id)),
      ]);
    },
  };
}
