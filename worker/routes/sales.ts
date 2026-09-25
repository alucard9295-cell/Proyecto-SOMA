/**
 * Rutas publicas del sitio de ventas. Sin sesion: todo aqui es de solo calculo,
 * salvo el asesor, que gasta neuronas de Workers AI y por eso va con limite por IP.
 */
import { Hono } from "hono";
import { z } from "zod";
import { calculateRemodeling, SimulationError } from "../../domain/simulation";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { HttpError, invalid } from "../errors";
import { repos } from "../repositories";
import { asesorar } from "../services/asistentes";
import { modeloDe } from "../services/copiloto";
import { corridaInput, registrarFallo, sse } from "./agui";
import { validate } from "./validate";

const simulationInput = z.object({
  area_m2: z.number().positive().max(100_000),
  units: z.number().int().min(1).max(1000),
  tier: z.enum(["basic", "standard", "premium"]),
  acquisition_cost: z.number().min(0).default(0),
  monthly_rent_per_unit: z.number().min(0).default(0),
  occupancy_rate: z.number().positive().max(1).nullish(),
  monthly_operating_expenses: z.number().min(0).default(0),
  annual_appreciation: z.number().min(0).max(1).nullish(),
});

// El presupuesto real son las 10k neuronas diarias que comparte con el copiloto:
// el limite por IP frena a un visitante (o un script) y el tope diario global
// (services/asistentes.ts) cubre a muchos a la vez.
const limiteAsesor = createMiddleware<AppEnv>(async (c, next) => {
  const { success } = await c.env.ASESOR_LIMITE.limit({ key: c.req.header("CF-Connecting-IP") ?? "local" });
  if (!success) throw new HttpError(429, "Demasiadas preguntas seguidas. Espera un minuto y vuelve a intentar.");
  await next();
});

export const sales = new Hono<AppEnv>()
  .post("/asesor", limiteAsesor, validate("json", corridaInput({ mensajes: 12, texto: 500 })), (c) =>
    asesorar(repos(c.env.DB), modeloDe(c.env.AI), c.req.valid("json"), registrarFallo(c)).then((stream) => sse(c, stream)))
  .post("/simulation", validate("json", simulationInput), (c) => {
  try {
    return c.json(calculateRemodeling(c.req.valid("json")));
  } catch (error) {
    if (error instanceof SimulationError) throw invalid(error.message);
    throw error;
  }
});
