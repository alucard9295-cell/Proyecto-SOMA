import { env } from "cloudflare:workers";
import { app } from "../../worker/app";
import type { Env } from "../../worker/env";

/** Peticion al API dentro de workerd, con la D1 local ya migrada. */
export async function api(path: string, init: RequestInit & { json?: unknown } = {}, overrides: Partial<Env> = {}) {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const response = await app.request(
    path,
    { ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body },
    { ...env, ...overrides },
  );
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}

export const post = (path: string, json: unknown) => api(path, { method: "POST", json });
export const put = (path: string, json: unknown) => api(path, { method: "PUT", json });

export function apuPayload(overrides: Record<string, unknown> = {}) {
  return {
    nombre_partida: "Muro de prueba",
    unidad: "m2",
    categoria: "obra_gris",
    administracion_pct: 5,
    imprevistos_pct: 5,
    utilidad_pct: 10,
    iva_pct: 19,
    iva_base: "utilidad",
    detalles: [{ insumo_id: 1, categoria: "mano_obra", rendimiento: 0.1, desperdicio_pct: 0, precio_unitario: 269231 }],
    ...overrides,
  };
}
