import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./env";
import { HttpError } from "./errors";
import { requestId, securityHeaders } from "./middleware/hardening";
import { admin } from "./routes/admin";
import { sales } from "./routes/sales";
import { MAX_PDF } from "./services/documents";

// JSON del API. La subida de facturas lleva el PDF y tiene su propio techo.
const MAX_BODY = 2 * 1024 * 1024;
const RUTA_SUBIDA = "/api/admin/documentos";
const demasiado = (mensaje: string) => () => { throw new HttpError(413, mensaje); };
const limiteJson = bodyLimit({ maxSize: MAX_BODY, onError: demasiado("La peticion supera el tamano permitido.") });
// El PDF mas el JSON de la extraccion y el sobre multipart.
const limiteSubida = bodyLimit({ maxSize: MAX_PDF + MAX_BODY, onError: demasiado("El PDF supera los 10 MB.") });

export const app = new Hono<AppEnv>();

app.use("/api/*", requestId, securityHeaders);
// Un formulario de otro sitio puede mandar multipart con la cookie de Access
// (la subida de facturas); el JSON no pasa sin preflight CORS. csrf() exige
// Origin propio en esos content-types.
app.use("/api/*", csrf());
app.use("/api/*", (c, next) => (c.req.method === "POST" && c.req.path === RUTA_SUBIDA ? limiteSubida : limiteJson)(c, next));

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/sales", sales);
app.route("/api/admin", admin);
app.all("/api/*", () => { throw new HttpError(404, "Ruta no encontrada."); });

app.onError((error, c) => {
  const request_id = c.get("requestId");
  if (error instanceof HttpError) return c.json({ detail: error.message, request_id }, error.status);
  // Los middlewares de Hono (csrf) lanzan HTTPException, con mensaje en ingles.
  if (error instanceof HTTPException) return c.json({ detail: error.status === 403 ? "Origen no permitido." : "Peticion rechazada.", request_id }, error.status);
  // Nunca el mensaje interno al cliente: puede llevar SQL o rutas.
  console.error(JSON.stringify({ request_id, error: String(error), stack: error instanceof Error ? error.stack : undefined }));
  return c.json({ detail: "Error interno del servidor.", request_id }, 500);
});
