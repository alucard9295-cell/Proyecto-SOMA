/**
 * Contrato frontend <-> API: la UI no llama rutas que el Worker no implementa
 * (invariante 5). Se rompio una vez en un merge sin que nada lo detectara.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { app } from "../../worker/app";

const SRC = path.resolve(import.meta.dirname, "../../src");
const API_LITERAL = /["'`](\/api\/[^"'`]*)["'`]/g;

/** Sin query string y con todo segmento dinamico colapsado a '*'. */
const shape = (p: string) =>
  p.split("?")[0].replace(/\/$/, "").replace(/\$\{[^}]*\}/g, "*").replace(/:\w+/g, "*");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sources(full) : /\.(jsx?|tsx?)$/.test(name) ? [full] : [];
  });
}

const frontend = new Map(
  sources(SRC).map((file) => [path.relative(SRC, file), new Set([...readFileSync(file, "utf8").matchAll(API_LITERAL)].map((m) => shape(m[1])))]),
);
const registered = new Set(app.routes.map((r) => shape(r.path)).filter((p) => p.startsWith("/api/") && p !== "/api/*"));

describe("contrato frontend <-> API", () => {
  // Invariante 5: nada en la UI que no exista en el backend.
  it("el frontend solo llama rutas implementadas", () => {
    const missing = [...frontend].flatMap(([file, paths]) => [...paths].filter((p) => !registered.has(p)).map((p) => `${file} llama ${p}`));
    expect(missing).toEqual([]);
  });

  it("el extractor ve al menos las rutas conocidas", () => {
    const all = new Set([...frontend.values()].flatMap((s) => [...s]));
    expect(all.has("/api/sales/simulation")).toBe(true);
    expect(registered.has("/api/admin/apus/*")).toBe(true);
  });
});
