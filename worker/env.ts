export interface Env {
  DB: D1Database;
  /** Opcional mientras R2 no este habilitado en la cuenta: sin el, no se suben facturas. */
  FILES?: R2Bucket;
  AI: Ai;
  /** Limite por IP del asesor publico (binding de rate limiting). */
  ASESOR_LIMITE: RateLimit;
  ASSETS: Fetcher;
  ENVIRONMENT: "production" | "development" | "test";
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Secreto (wrangler secret put): emails admitidos, separados por comas. */
  ADMIN_EMAILS?: string;
}

export interface Variables {
  requestId: string;
  /** Email de quien entro por Cloudflare Access. */
  actor: string;
}

export type AppEnv = { Bindings: Env; Variables: Variables };
