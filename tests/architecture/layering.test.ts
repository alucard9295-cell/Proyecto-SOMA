/**
 * Reglas de capas verificadas sobre el codigo, no sobre la buena voluntad.
 *
 *   routes (controllers) -> services (casos de uso) -> repositories (SQL D1)
 *                                   \-> domain (puro, compartido con la UI)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

function files(dir: string, ext = /\.(ts|tsx|js|jsx)$/): string[] {
  const abs = path.join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const full = path.join(abs, name);
    if (statSync(full).isDirectory()) return files(path.join(dir, name), ext);
    return ext.test(name) ? [path.join(dir, name).replaceAll("\\", "/")] : [];
  });
}

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const imports = (file: string) => [...read(file).matchAll(/(?:import|export)[^'"]*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);

function violations(dir: string, forbidden: (spec: string) => boolean) {
  return files(dir).flatMap((file) => imports(file).filter(forbidden).map((spec) => `${file} importa ${spec}`));
}

describe("capas", () => {
  it("domain/ es puro: solo big.js y otros modulos del dominio", () => {
    expect(files("domain").length).toBeGreaterThan(3);
    expect(violations("domain", (spec) => spec !== "big.js" && !spec.startsWith("./"))).toEqual([]);
  });

  it("repositories/ no conoce HTTP, casos de uso ni reglas de negocio (solo money para mapear)", () => {
    expect(violations("worker/repositories", (spec) =>
      spec.startsWith("hono") || spec.includes("/services") || spec.includes("/routes") ||
      (spec.includes("domain/") && !spec.endsWith("domain/money")),
    )).toEqual([]);
  });

  it("services/ no conoce HTTP ni escribe SQL", () => {
    expect(violations("worker/services", (spec) => spec.startsWith("hono") || spec.includes("/routes"))).toEqual([]);
    expect(files("worker/services").filter((f) => /\.prepare\(|\bSELECT\b|\bINSERT\b/.test(read(f)))).toEqual([]);
  });

  it("routes/ no escribe SQL ni entra a un repositorio concreto (solo la fabrica repos())", () => {
    expect(files("worker/routes").filter((f) => /\.prepare\(|\bSELECT\b|\bINSERT\b|\.batch\(/.test(read(f)))).toEqual([]);
    expect(violations("worker/routes", (spec) => /repositories\/.+/.test(spec))).toEqual([]);
  });

  it("routes/ no calcula costos: el costeo pasa por services", () => {
    expect(violations("worker/routes", (spec) => /domain\/(costing|scheduling|money)/.test(spec))).toEqual([]);
  });

  it("el SQL vive solo en repositories/", () => {
    const outside = files("worker").filter((f) => !f.startsWith("worker/repositories/") && /\.prepare\(/.test(read(f)));
    expect(outside).toEqual([]);
  });

  it("el frontend no importa el Worker", () => {
    expect(violations("src", (spec) => spec.includes("worker/"))).toEqual([]);
  });

  // Mismo origen: la UI no necesita URL de API, y asi ningun secreto puede
  // colarse por una variable VITE_*.
  it("el frontend no lee variables de entorno propias (mismo origen, sin secretos)", () => {
    const envVars = files("src").flatMap((f) => [...read(f).matchAll(/import\.meta\.env\.(\w+)/g)].map((m) => m[1]));
    expect(envVars.filter((name) => !["DEV", "PROD", "MODE", "BASE_URL"].includes(name))).toEqual([]);
  });
});
