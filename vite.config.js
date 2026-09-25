import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import yaml from "@rollup/plugin-yaml";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // yaml habilita importar src/content/*.yaml como objetos: los textos de la
  // interfaz se editan ahi, sin tocar componentes.
  // cloudflare corre el Worker (worker/index.ts) dentro de `vite dev` sobre
  // workerd, con D1/R2 locales: web y API en el mismo origen, igual que en
  // produccion. Sin IA remota por defecto: no pide login ni gasta neuronas.
  // SOMA_IA_REMOTA=1 conecta el binding AI a la cuenta para probar los asistentes.
  plugins: [react(), yaml(), cloudflare({ remoteBindings: process.env.SOMA_IA_REMOTA === "1" })],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // .tmp/ es borrador local (logs, perfiles de navegador): vigilarlo tumba
    // el servidor con EBUSY en Windows cuando otro proceso bloquea un archivo.
    watch: { ignored: ["**/.tmp/**"] },
  },
});
