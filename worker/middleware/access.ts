/**
 * Cloudflare Access delante de /api/admin/*.
 *
 * Access autentica en el borde y reenvia un JWT firmado en
 * `Cf-Access-Jwt-Assertion`. El Worker lo verifica igual: si alguien llega al
 * Worker por otra ruta (workers.dev, una regla de Access mal puesta), sin firma
 * valida no entra. Defensa en profundidad, no confianza en la red.
 *
 * Firma valida no basta: Access emite JWT a cualquiera que su politica deje
 * pasar, y una politica amplia (p. ej. "cualquier email con codigo") dejaria
 * entrar a todos. ADMIN_EMAILS (secreto) fija quien es admin en el propio Worker.
 */
import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AppEnv } from "../env";
import { HttpError } from "../errors";

const DEV_ACTOR = "dev@local";

export async function verifyAccessToken(
  token: string,
  options: { issuer: string; audience: string; keys: JWTVerifyGetKey },
): Promise<string> {
  const { payload } = await jwtVerify(token, options.keys, { issuer: options.issuer, audience: options.audience });
  const actor = payload.email ?? payload.sub;
  if (typeof actor !== "string" || !actor) throw new Error("JWT sin identidad");
  return actor;
}

/** Lista separada por comas, sin distinguir mayusculas. */
export function esAdmin(actor: string, adminEmails: string): boolean {
  const admitidos = adminEmails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admitidos.includes(actor.toLowerCase());
}

// Un JWKS por isolate: jose cachea las llaves y las renueva al rotar.
const keySets = new Map<string, JWTVerifyGetKey>();
function remoteKeys(issuer: string): JWTVerifyGetKey {
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, keys);
  }
  return keys;
}

export const requireAccess = createMiddleware<AppEnv>(async (c, next) => {
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAILS = "", ENVIRONMENT } = c.env;
  if (!ACCESS_TEAM_DOMAIN || !ACCESS_AUD || !ADMIN_EMAILS.trim()) {
    // Sin configuracion solo se entra en local. En produccion falla cerrado.
    if (ENVIRONMENT !== "production") {
      c.set("actor", DEV_ACTOR);
      return next();
    }
    throw new HttpError(503, "El acceso de administrador no esta configurado.");
  }
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) throw new HttpError(401, "Inicia sesion para continuar.");
  const issuer = `https://${ACCESS_TEAM_DOMAIN}`;
  let actor: string;
  try {
    actor = await verifyAccessToken(token, { issuer, audience: ACCESS_AUD, keys: remoteKeys(issuer) });
  } catch {
    throw new HttpError(401, "La sesion no es valida o vencio.");
  }
  if (!esAdmin(actor, ADMIN_EMAILS)) throw new HttpError(403, "Esta cuenta no tiene acceso al control room.");
  c.set("actor", actor);
  await next();
});
