/**
 * Consumo del plan gratis de Cloudflare para el control room. Los contadores de
 * la plataforma salen del GraphQL Analytics API con un token de solo lectura
 * (secreto del Worker, el navegador nunca lo ve); el cupo del asesor sale de D1.
 * Los limites diarios de Cloudflare se reinician a las 00:00 UTC.
 */
import type { Repos } from "../repositories";
import { TOPE_DIARIO_ASESOR } from "./asistentes";

export const GRAPHQL_CLOUDFLARE = "https://api.cloudflare.com/client/v4/graphql";

export interface Medida {
  id: string;
  servicio: string;
  metrica: string;
  uso: number | null;
  limite: number;
  periodo: "dia" | "total";
  unidad?: "bytes";
}

export interface Consumo {
  consultado_en: string;
  /** ok: cifras de Cloudflare; sin_token: falta configurar; error: la consulta fallo. */
  analitica: "ok" | "sin_token" | "error";
  detalle?: string;
  medidas: Medida[];
}

const CONSULTA = `query($cuenta: string!, $dia: Date!, $desde: Time!, $hasta: Time!) { viewer { accounts(filter: { accountTag: $cuenta }) {
  workers: workersInvocationsAdaptive(limit: 10, filter: { date: $dia }) { sum { requests } }
  d1: d1AnalyticsAdaptiveGroups(limit: 10, filter: { date: $dia }) { sum { rowsRead rowsWritten } }
  almacen: d1StorageAdaptiveGroups(limit: 100, filter: { date: $dia }) { max { databaseSizeBytes } }
  ia: aiInferenceAdaptiveGroups(limit: 10, filter: { datetime_geq: $desde, datetime_leq: $hasta }) { sum { totalNeurons } }
} } }`;

interface Respuesta {
  data?: { viewer?: { accounts?: Array<{
    workers: Array<{ sum: { requests: number } }>;
    d1: Array<{ sum: { rowsRead: number; rowsWritten: number } }>;
    almacen: Array<{ max: { databaseSizeBytes: number } }>;
    ia: Array<{ sum: { totalNeurons: number } }>;
  }> } };
  errors?: Array<{ message: string }> | null;
}

const suma = <T>(filas: T[], valor: (f: T) => number) => filas.reduce((total, f) => total + (valor(f) ?? 0), 0);

type Plataforma = Record<"workers" | "neuronas" | "leidas" | "escritas" | "almacen", number | null>;
const SIN_DATOS: Plataforma = { workers: null, neuronas: null, leidas: null, escritas: null, almacen: null };

async function plataforma(cuenta: string, token: string, ahora: Date, pedir: typeof fetch): Promise<Plataforma> {
  const dia = ahora.toISOString().slice(0, 10);
  const res = await pedir(GRAPHQL_CLOUDFLARE, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: CONSULTA, variables: { cuenta, dia, desde: `${dia}T00:00:00Z`, hasta: ahora.toISOString() } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Cloudflare respondio ${res.status}`);
  const cuerpo = (await res.json()) as Respuesta;
  if (cuerpo.errors?.length) throw new Error(cuerpo.errors[0].message);
  const c = cuerpo.data?.viewer?.accounts?.[0];
  if (!c) throw new Error("El token no tiene acceso a la analitica de esta cuenta.");
  return {
    workers: suma(c.workers, (f) => f.sum.requests),
    neuronas: Math.round(suma(c.ia, (f) => f.sum.totalNeurons)),
    leidas: suma(c.d1, (f) => f.sum.rowsRead),
    escritas: suma(c.d1, (f) => f.sum.rowsWritten),
    almacen: suma(c.almacen, (f) => f.max.databaseSizeBytes),
  };
}

export async function consumoPlan(
  r: Repos,
  cfg: { cuenta?: string; token?: string },
  ahora = new Date(),
  pedir: typeof fetch = fetch,
): Promise<Consumo> {
  let analitica: Consumo["analitica"] = "sin_token";
  let detalle: string | undefined;
  let p = SIN_DATOS;
  if (cfg.cuenta && cfg.token) {
    try {
      p = await plataforma(cfg.cuenta, cfg.token, ahora, pedir);
      analitica = "ok";
    } catch (e) {
      analitica = "error";
      detalle = e instanceof Error ? e.message : String(e);
    }
  }
  const asesor = await r.usoAsesor.delDia(ahora.toISOString().slice(0, 10));
  return {
    consultado_en: ahora.toISOString(),
    analitica,
    ...(detalle ? { detalle } : {}),
    medidas: [
      { id: "workers", servicio: "Workers", metrica: "Peticiones", uso: p.workers, limite: 100_000, periodo: "dia" },
      { id: "ia", servicio: "Workers AI", metrica: "Neuronas", uso: p.neuronas, limite: 10_000, periodo: "dia" },
      { id: "d1_lecturas", servicio: "D1", metrica: "Filas leídas", uso: p.leidas, limite: 5_000_000, periodo: "dia" },
      { id: "d1_escrituras", servicio: "D1", metrica: "Filas escritas", uso: p.escritas, limite: 100_000, periodo: "dia" },
      { id: "d1_almacen", servicio: "D1", metrica: "Almacenamiento", uso: p.almacen, limite: 5 * 1024 ** 3, periodo: "total", unidad: "bytes" },
      { id: "asesor", servicio: "Asesor", metrica: "Respuestas", uso: asesor, limite: TOPE_DIARIO_ASESOR, periodo: "dia" },
    ],
  };
}
