import { buildSchedule, partidaDuration } from "../../domain/scheduling";
import { dec, money, toNumber } from "../../domain/money";
import { notFound } from "../errors";
import type { Repos } from "../repositories";
import { loadApus } from "./apus";

async function projectView(r: Repos, id: number) {
  const project = await r.projects.get(id);
  if (!project) throw notFound("Proyecto no encontrado.");
  const partidas = await r.projects.partidas(id);
  const schedule = buildSchedule(partidas, project.fecha_inicio);
  const apus = await loadApus(r, [...new Set(partidas.map((p) => p.apu_id))]);
  const byId = new Map(schedule.partidas.map((item) => [item.partida_id, item]));
  return {
    ...project,
    partidas: partidas.map((p) => ({
      ...p,
      costo_unitario: toNumber(p.costo_unitario),
      costo_total: toNumber(p.costo_total),
      fecha_inicio: byId.get(p.partida_id)!.fecha_inicio,
      fecha_fin: byId.get(p.partida_id)!.fecha_fin,
      apu: apus.get(p.apu_id) ?? null,
    })),
    fases: schedule.fases.map((f) => ({ ...f, costo_total: toNumber(f.costo_total) })),
    costo_total: toNumber(schedule.costo_total),
    duracion_dias: schedule.duracion_dias,
    fecha_fin: schedule.fecha_fin,
  };
}

export async function createProject(r: Repos, input: { nombre: string; cliente?: string | null; ubicacion?: string | null; fecha_inicio: string }) {
  const id = await r.projects.insert({ nombre: input.nombre.trim(), cliente: input.cliente ?? null, ubicacion: input.ubicacion ?? null, fecha_inicio: input.fecha_inicio });
  return { ok: true, proyecto: await projectView(r, id) };
}

export async function listProjects(r: Repos) {
  const items = await Promise.all((await r.projects.listIds()).map((id) => projectView(r, id)));
  return { items, count: items.length };
}

export async function addPartida(
  r: Repos,
  projectId: number,
  input: { fase: string; apu_id: number; cantidad: number; rendimiento_diario: number; orden: number },
) {
  if (!(await r.projects.get(projectId))) throw notFound("Proyecto no encontrado.");
  const apu = (await loadApus(r, [input.apu_id])).get(input.apu_id);
  if (!apu) throw notFound("APU no encontrado.");
  const precioVenta = money(apu.precio_venta);
  await r.projects.insertPartida(projectId, {
    ...input,
    costo_unitario: precioVenta,
    costo_total: money(dec(input.cantidad).times(precioVenta)),
    duracion_dias: partidaDuration(input.cantidad, input.rendimiento_diario),
  });
  return { ok: true, proyecto: await projectView(r, projectId) };
}
