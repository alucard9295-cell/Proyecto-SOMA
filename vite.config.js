import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import yaml from "@rollup/plugin-yaml";

export default defineConfig({
  // yaml habilita importar src/content/*.yaml como objetos: los textos de la
  // interfaz se editan ahi, sin tocar componentes.
  plugins: [react(), yaml()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
