import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Idempotente: applyD1Migrations salta las ya aplicadas.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
