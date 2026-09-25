// @rollup/plugin-yaml (vite.config y vitest.config) convierte el YAML en objeto.
declare module "*.yaml" {
  const contenido: Record<string, any>;
  export default contenido;
}
