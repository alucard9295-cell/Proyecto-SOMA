// Pruebas de punta a punta contra un servidor que ya corre (no lo levanta).
// En Docker: `docker compose run --rm e2e` contra `wrangler dev` del host.
// La version de @playwright/test y la de la imagen del compose van juntas.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./specs",
  outputDir: "./resultados/artefactos",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "./resultados/informe", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8787",
    locale: "es-CO",
    video: "on",
    screenshot: "on",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "movil", use: { ...devices["Pixel 7"] } },
  ],
});
