import { fromCents, money, type Decimal } from "../../domain/money";
import { all, placeholders } from "./db";

export interface Supply {
  insumo_id: number;
  nombre_normalizado: string;
  categoria: string;
  unidad_estandar: string | null;
  /** Promedio de lo pagado en facturas; 0 si nunca se compro. */
  price_average: Decimal;
  price_min: Decimal | null;
  price_max: Decimal | null;
  purchase_count: number;
  last_purchase: string | null;
}

interface SupplyRow {
  insumo_id: number;
  nombre_normalizado: string;
  categoria: string;
  unidad_estandar: string | null;
  avg_c: number | null;
  min_c: number | null;
  max_c: number | null;
  purchase_count: number;
  last_purchase: string | null;
}

const SELECT = `
  SELECT i.insumo_id, i.nombre_normalizado, i.categoria, i.unidad_estandar,
         AVG(fi.valor_unitario_centavos) AS avg_c,
         MIN(fi.valor_unitario_centavos) AS min_c, MAX(fi.valor_unitario_centavos) AS max_c,
         COUNT(fi.item_id) AS purchase_count, MAX(f.fecha_factura) AS last_purchase
    FROM insumos_maestros i
    LEFT JOIN factura_items fi ON fi.insumo_id = i.insumo_id
    LEFT JOIN facturas f ON f.factura_id = fi.factura_id`;

// El promedio de centavos no es entero: se redondea a centavo como dinero.
const toSupply = ({ avg_c, min_c, max_c, ...row }: SupplyRow): Supply => ({
  ...row,
  price_average: avg_c === null ? money(0) : money(fromCents(1).times(avg_c)),
  price_min: min_c === null ? null : fromCents(min_c),
  price_max: max_c === null ? null : fromCents(max_c),
});

export function suppliesRepository(db: D1Database) {
  return {
    async search(search: string, category: string): Promise<Supply[]> {
      const filters: string[] = [];
      const params: string[] = [];
      if (search.trim()) {
        filters.push("lower(i.nombre_normalizado) LIKE ?");
        params.push(`%${search.trim().toLowerCase()}%`);
      }
      if (category) {
        filters.push("i.categoria = ?");
        params.push(category);
      }
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = await all<SupplyRow>(
        db.prepare(`${SELECT} ${where} GROUP BY i.insumo_id ORDER BY i.nombre_normalizado`).bind(...params),
      );
      return rows.map(toSupply);
    },

    async byIds(ids: number[]): Promise<Map<number, Supply>> {
      if (!ids.length) return new Map();
      const rows = await all<SupplyRow>(
        db.prepare(`${SELECT} WHERE i.insumo_id IN (${placeholders(ids.length)}) GROUP BY i.insumo_id`).bind(...ids),
      );
      return new Map(rows.map((row) => [row.insumo_id, toSupply(row)]));
    },

    async exists(id: number): Promise<boolean> {
      return (await db.prepare("SELECT 1 FROM insumos_maestros WHERE insumo_id = ?").bind(id).first()) !== null;
    },

    async update(id: number, values: { nombre_normalizado: string; categoria: string; unidad_estandar: string | null }) {
      await db
        .prepare("UPDATE insumos_maestros SET nombre_normalizado = ?, categoria = ?, unidad_estandar = ? WHERE insumo_id = ?")
        .bind(values.nombre_normalizado, values.categoria, values.unidad_estandar, id)
        .run();
    },
  };
}
