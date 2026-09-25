import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import yaml from "@rollup/plugin-yaml";
import { defineConfig } from "vitest/config";

// Dos proyectos: el dominio y las reglas de arquitectura corren en Node (son
// puros y leen el disco); el API corre dentro de workerd, el mismo runtime de
// produccion, con una D1 local a la que se le aplican las migraciones reales.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    test: {
      // yaml en ambos: el asesor (worker/services/asistentes.ts) lee src/content/site.yaml.
      projects: [
        { plugins: [yaml()], test: { name: "node", include: ["tests/domain/**/*.test.ts", "tests/architecture/**/*.test.ts"], environment: "node" } },
        {
          plugins: [
            yaml(),
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              // Los tests nunca tocan la cuenta: sin IA remota ni sesion de wrangler.
              remoteBindings: false,
              // R2 propio: en wrangler.jsonc queda comentado hasta habilitarlo en la cuenta.
              miniflare: { r2Buckets: ["FILES"], bindings: { ENVIRONMENT: "test", TEST_MIGRATIONS: migrations } },
            }),
          ],
          test: { name: "workers", include: ["tests/api/**/*.test.ts"], setupFiles: ["./tests/setup.ts"] },
        },
      ],
    },
  };
});
