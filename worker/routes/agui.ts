/**
 * Entrada y salida HTTP de los asistentes (protocolo AG-UI de CopilotKit). Los
 * topes van por perfil: el asesor publico recibe menos historia y texto que el
 * copiloto con sesion, porque cada token del prompt gasta neuronas gratuitas.
 */
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { z } from "zod";
import type { Corrida } from "../services/copiloto";

interface Topes { mensajes: number; texto: number }

const id = z.string().min(1).max(100);

export function corridaInput({ mensajes, texto }: Topes) {
  const contenido = z.string().max(texto);
  const mensaje = z.discriminatedUnion("role", [
    z.object({ id, role: z.literal("user"), content: contenido }),
    z.object({
      id, role: z.literal("assistant"), content: contenido.nullish(),
      toolCalls: z.array(z.object({ id, function: z.object({ name: z.string().max(64), arguments: z.string().max(texto) }) })).max(5).optional(),
    }),
    z.object({ id, role: z.literal("tool"), content: contenido, toolCallId: id }),
    // Se aceptan para no romper al cliente, pero el servicio los descarta.
    z.object({ id, role: z.enum(["system", "developer"]), content: z.string().max(texto) }),
  ]);
  return z.object({
    threadId: id,
    runId: id,
    messages: z.array(mensaje).min(1).max(mensajes),
    tools: z.array(z.object({ name: z.string().max(64), description: z.string().max(500).optional(), parameters: z.unknown().optional() })).max(10).default([]),
    context: z.array(z.object({ description: z.string().max(200), value: z.string().max(2000) })).max(5).default([]),
  }).loose() satisfies z.ZodType<Corrida>;
}

export function sse(c: Context, stream: ReadableStream<Uint8Array>) {
  return c.body(stream, 200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
}

/** El detalle del fallo va al log con el request_id; al cliente, un mensaje generico. */
export const registrarFallo = (c: Context<AppEnv>) => (error: unknown) =>
  console.error(JSON.stringify({ request_id: c.get("requestId"), asistente: c.req.path, error: String(error) }));
