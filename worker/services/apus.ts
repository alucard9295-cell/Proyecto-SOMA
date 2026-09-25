/**
 * Casos de uso de insumos y APUs. Orquestan dominio y repositorios; no saben
 * de HTTP (lanzan HttpError) ni de SQL.
 */
import { costApu, costingToJson, IVA_BASES, lineCost, type SupplyLine } from "../../domain/costing";
import { dec, money, toNumber, type Decimal } from "../../domain/money";
import { invalid, notFound } from "../errors";
import type { Repos } from "../repositories";
import type { ApuDetail, ApuRow } from "../repositories/apus";

export const SUPPLY_CATEGORIES = ["material", "mano_obra", "equipo", "transporte", "servicio_terceros"] as const;
export const APU_CATEGORIES = ["excavaciones", "obra_gris", "acabados", "instalaciones"] as const;

export interface ApuInput {
  nombre_partida: string;
  unidad: string;
  categoria: string;
  descripcion?: string | null;
  administracion_pct: number;
  imprevistos_pct: number;
  utilidad_pct: number;
  iva_pct: number;
  iva_base: string;
  detalles: { insumo_id: number; categoria: string; rendimiento: number; desperdicio_pct: number; precio_unitario?: number | null }[];
}

const includes = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

// ---- insumos ----

export async function listSupplies(r: Repos, search: string, category: string) {
  if (category && !includes(SUPPLY_CATEGORIES, category)) throw invalid("Categoria de insumo invalida.");
  const items = (await r.supplies.search(search, category)).map((s) => ({
    ...s,
    price_average: toNumber(s.price_average),
    price_min: s.price_min && toNumber(s.price_min),
    price_max: s.price_max && toNumber(s.price_max),
  }));
  return { items, count: items.length };
}

export async function updateSupply(r: Repos, id: number, input: { nombre_normalizado: string; categoria: string; unidad_estandar?: string | null }) {
  if (!includes(SUPPLY_CATEGORIES, input.categoria)) throw invalid("Categoria de insumo invalida.");
  if (!(await r.supplies.exists(id))) throw notFound("Insumo no encontrado.");
  await r.supplies.update(id, { nombre_normalizado: input.nombre_normalizado.trim(), categoria: input.categoria, unidad_estandar: input.unidad_estandar ?? null });
  return { ok: true, insumo_id: id };
}

// ---- APUs ----

const ratesOf = (row: Pick<ApuRow, "administracion_pct" | "imprevistos_pct" | "utilidad_pct" | "iva_pct" | "iva_base">) => ({
  administracion_pct: dec(row.administracion_pct),
  imprevistos_pct: dec(row.imprevistos_pct),
  utilidad_pct: dec(row.utilidad_pct),
  iva_pct: dec(row.iva_pct),
  iva_base: row.iva_base,
});

/** Vista de un APU a partir de filas ya cargadas: sin consultas, calcula en memoria. */
export function apuView(row: ApuRow, details: ApuDetail[]) {
  const lines: SupplyLine[] = [];
  const detalles = details.map((detail) => {
    const precio: Decimal = detail.precio_unitario ?? detail.precio_catalogo;
    const line = { rendimiento: dec(detail.rendimiento), precio_unitario: precio, desperdicio_pct: dec(detail.desperdicio_pct) };
    lines.push(line);
    return {
      ...detail,
      precio_unitario: detail.precio_unitario && toNumber(detail.precio_unitario),
      precio_catalogo: toNumber(detail.precio_catalogo),
      precio_aplicado: toNumber(precio),
      costo: toNumber(lineCost(line)),
    };
  });
  return { ...row, detalles, ...costingToJson(costApu(lines, ratesOf(row))) };
}

export async function loadApus(r: Repos, ids: number[]) {
  // Tres consultas en total, no dos por APU.
  const [rows, details] = await Promise.all([r.apus.getMany(ids), r.apus.detailsMany(ids)]);
  return new Map(ids.filter((id) => rows.has(id)).map((id) => [id, apuView(rows.get(id)!, details.get(id) ?? [])]));
}

async function loadApu(r: Repos, id: number) {
  const apu = (await loadApus(r, [id])).get(id);
  if (!apu) throw notFound("APU no encontrado.");
  return apu;
}

export async function listApus(r: Repos) {
  const items = [...(await loadApus(r, await r.apus.listIds())).values()];
  return { items, count: items.length };
}

async function validateApu(r: Repos, input: ApuInput) {
  if (!includes(APU_CATEGORIES, input.categoria) || !includes(IVA_BASES, input.iva_base)) {
    throw invalid("Categoria o base de IVA invalida.");
  }
  for (const d of input.detalles) if (!includes(SUPPLY_CATEGORIES, d.categoria)) throw invalid("Categoria de insumo invalida.");
  const known = await r.supplies.byIds([...new Set(input.detalles.map((d) => d.insumo_id))]);
  const missing = input.detalles.find((d) => !known.has(d.insumo_id));
  if (missing) throw invalid(`Insumo no encontrado: ${missing.insumo_id}`);
  const values = {
    nombre_partida: input.nombre_partida.trim(),
    unidad: input.unidad.trim(),
    descripcion: input.descripcion ?? null,
    categoria: input.categoria,
    administracion_pct: input.administracion_pct,
    imprevistos_pct: input.imprevistos_pct,
    utilidad_pct: input.utilidad_pct,
    iva_pct: input.iva_pct,
    iva_base: input.iva_base,
  };
  const details = input.detalles.map((d) => ({
    insumo_id: d.insumo_id,
    categoria: d.categoria,
    rendimiento: d.rendimiento,
    desperdicio_pct: d.desperdicio_pct,
    precio_unitario: d.precio_unitario == null ? null : money(d.precio_unitario),
  }));
  return { values, details };
}

export async function createApu(r: Repos, input: ApuInput) {
  const { values, details } = await validateApu(r, input);
  const id = await r.apus.insert(values, details);
  return { ok: true, apu: await loadApu(r, id) };
}

export async function updateApu(r: Repos, id: number, input: ApuInput) {
  const { values, details } = await validateApu(r, input);
  if (!(await r.apus.exists(id))) throw notFound("APU no encontrado.");
  await r.apus.update(id, values, details);
  return { ok: true, apu: await loadApu(r, id) };
}

/**
 * Precio de una partida sin guardarla. Existe para que el frontend no
 * reimplemente la formula AIU: una sola fuente de verdad para el costeo.
 */
export async function previewApu(r: Repos, input: ApuInput) {
  if (!includes(IVA_BASES, input.iva_base)) throw invalid("Base de IVA invalida.");
  const catalog = await r.supplies.byIds([...new Set(input.detalles.map((d) => d.insumo_id))]);
  const lines: SupplyLine[] = [];
  const detalles = input.detalles.map((d) => {
    const precio = d.precio_unitario != null ? dec(d.precio_unitario) : catalog.get(d.insumo_id)?.price_average ?? money(0);
    const line = { rendimiento: dec(d.rendimiento), precio_unitario: precio, desperdicio_pct: dec(d.desperdicio_pct) };
    lines.push(line);
    return { insumo_id: d.insumo_id, precio_aplicado: toNumber(precio), costo: toNumber(lineCost(line)) };
  });
  return { detalles, ...costingToJson(costApu(lines, ratesOf(input))) };
}
