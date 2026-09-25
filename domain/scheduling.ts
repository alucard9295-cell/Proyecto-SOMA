/**
 * Planificacion de obra: duracion de partidas y cronograma del proyecto.
 *
 * Regla del producto: las partidas se ejecutan en secuencia, ordenadas por
 * `orden` y luego por identificador. Cada una empieza el dia siguiente al fin de
 * la anterior. Sin solape ni dependencias: cuando hagan falta se modelan, no
 * antes.
 */
import { money, sum, type Decimal, type DecimalInput } from "./money";

/** Dias necesarios. Hacia arriba: media jornada ocupa un dia de obra. Minimo 1. */
export function partidaDuration(cantidad: number, rendimientoDiario: number): number {
  if (rendimientoDiario <= 0) throw new Error("El rendimiento diario debe ser mayor que cero");
  return Math.max(1, Math.ceil(cantidad / rendimientoDiario));
}

export interface PartidaInput {
  partida_id: number;
  fase: string;
  costo_total: DecimalInput;
  duracion_dias: number;
}

export interface ScheduledPartida {
  partida_id: number;
  fase: string;
  costo_total: Decimal;
  duracion_dias: number;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface PhaseTotals {
  fase: string;
  costo_total: Decimal;
  duracion_dias: number;
  partidas: number;
}

export interface Schedule {
  partidas: ScheduledPartida[];
  fases: PhaseTotals[];
  costo_total: Decimal;
  duracion_dias: number;
  fecha_fin: string;
}

// Fechas ISO en UTC: el cronograma cuenta dias de calendario, no horas, y la
// zona horaria del servidor no debe correr una fecha.
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `partidas` debe venir ya ordenada. */
export function buildSchedule(partidas: PartidaInput[], fechaInicio: string): Schedule {
  let cursor = fechaInicio;
  const scheduled: ScheduledPartida[] = [];
  const phases = new Map<string, PhaseTotals>();

  for (const row of partidas) {
    const duracion = Math.trunc(row.duracion_dias);
    const fin = addDays(cursor, duracion - 1);
    const costo = money(row.costo_total);
    scheduled.push({
      partida_id: row.partida_id,
      fase: row.fase,
      costo_total: costo,
      duracion_dias: duracion,
      fecha_inicio: cursor,
      fecha_fin: fin,
    });
    const phase = phases.get(row.fase) ?? { fase: row.fase, costo_total: money(0), duracion_dias: 0, partidas: 0 };
    phase.costo_total = money(phase.costo_total.plus(costo));
    phase.duracion_dias += duracion;
    phase.partidas += 1;
    phases.set(row.fase, phase);
    cursor = addDays(fin, 1);
  }

  if (!scheduled.length) {
    return { partidas: [], fases: [], costo_total: money(0), duracion_dias: 0, fecha_fin: fechaInicio };
  }
  return {
    partidas: scheduled,
    fases: [...phases.values()],
    costo_total: money(sum(scheduled.map((item) => item.costo_total))),
    duracion_dias: scheduled.reduce((acc, item) => acc + item.duracion_dias, 0),
    fecha_fin: addDays(cursor, -1),
  };
}
