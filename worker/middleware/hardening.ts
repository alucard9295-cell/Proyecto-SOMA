import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Id de peticion: se respeta el del cliente si es sano, si no se genera. */
export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const incoming = c.req.header("X-Request-ID");
  const id = incoming && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  c.set("requestId", id);
  await next();
  c.header("X-Request-ID", id);
});

/** Cabeceras de seguridad de las respuestas del API. */
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  if (c.env.ENVIRONMENT === "production") c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
});
