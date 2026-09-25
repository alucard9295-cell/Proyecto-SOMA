import { fromCents, toCents, type Decimal } from "../../domain/money";
import { all } from "./db";

export interface ProjectRow {
  proyecto_id: number;
  nombre: string;
  cliente: string | null;
  ubicacion: string | null;
  fecha_inicio: string;
  fecha_creado: string;
}

export interface Partida {
  partida_id: number;
  proyecto_id: number;
  fase: string;
  apu_id: number;
  cantidad: number;
  rendimiento_diario: number;
  orden: number;
  costo_unitario: Decimal;
  costo_total: Decimal;
  duracion_dias: number;
  nombre_partida: string;
  unidad: string;
}

interface PartidaRow extends Omit<Partida, "costo_unitario" | "costo_total"> {
  costo_unitario_centavos: number;
  costo_total_centavos: number;
}

export interface PartidaValues {
  fase: string;
  apu_id: number;
  cantidad: number;
  rendimiento_diario: number;
  orden: number;
  costo_unitario: Decimal;
  costo_total: Decimal;
  duracion_dias: number;
}

export function projectsRepository(db: D1Database) {
  return {
    async listIds(): Promise<number[]> {
      return (await all<{ proyecto_id: number }>(db.prepare("SELECT proyecto_id FROM proyectos ORDER BY proyecto_id DESC"))).map(
        (r) => r.proyecto_id,
      );
    },

    get(id: number): Promise<ProjectRow | null> {
      return db.prepare("SELECT * FROM proyectos WHERE proyecto_id = ?").bind(id).first<ProjectRow>();
    },

    async partidas(id: number): Promise<Partida[]> {
      const rows = await all<PartidaRow>(
        db
          .prepare(
            `SELECT pp.*, a.nombre_partida, a.unidad
               FROM proyecto_partidas pp JOIN apus a ON a.apu_id = pp.apu_id
              WHERE pp.proyecto_id = ? ORDER BY pp.orden, pp.partida_id`,
          )
          .bind(id),
      );
      return rows.map(({ costo_unitario_centavos, costo_total_centavos, ...row }) => ({
        ...row,
        costo_unitario: fromCents(costo_unitario_centavos),
        costo_total: fromCents(costo_total_centavos),
      }));
    },

    async insert(values: { nombre: string; cliente: string | null; ubicacion: string | null; fecha_inicio: string }): Promise<number> {
      const result = await db
        .prepare("INSERT INTO proyectos (nombre, cliente, ubicacion, fecha_inicio) VALUES (?,?,?,?)")
        .bind(values.nombre, values.cliente, values.ubicacion, values.fecha_inicio)
        .run();
      return Number(result.meta.last_row_id);
    },

    async insertPartida(projectId: number, v: PartidaValues): Promise<void> {
      await db
        .prepare(
          `INSERT INTO proyecto_partidas
             (proyecto_id, fase, apu_id, cantidad, rendimiento_diario, orden,
              costo_unitario_centavos, costo_total_centavos, duracion_dias)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .bind(projectId, v.fase, v.apu_id, v.cantidad, v.rendimiento_diario, v.orden, toCents(v.costo_unitario), toCents(v.costo_total), v.duracion_dias)
        .run();
    },
  };
}
