/**
 * Importa un lote de PDFs por el mismo endpoint que usa la UI, con el mismo
 * extractor. No hay un segundo camino de escritura: lo que valida y guarda es
 * siempre POST /api/admin/documentos.
 *
 *   npx tsx tools/import-facturas.ts <carpeta-pdfs> [--api http://127.0.0.1:5173]
 *
 * Pensado para el servidor local (`npm run dev`), donde Access no aplica. Es
 * idempotente: los PDFs ya cargados vuelven como duplicados.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extraer } from "../domain/extraction";
import { serializar } from "../src/lib/leer-factura";
import { paginasDe } from "../src/lib/pdf-words";

const args = process.argv.slice(2);
const carpeta = args.find((a) => !a.startsWith("--"));
const api = args.includes("--api") ? args[args.indexOf("--api") + 1] : "http://127.0.0.1:5173";
if (!carpeta) throw new Error("Uso: tsx tools/import-facturas.ts <carpeta-pdfs> [--api URL]");

function pdfs(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((n) => {
    const full = path.join(dir, n);
    return statSync(full).isDirectory() ? pdfs(full) : n.toLowerCase().endsWith(".pdf") ? [full] : [];
  });
}

const conteo: Record<string, number> = {};
for (const archivo of pdfs(carpeta)) {
  const bytes = readFileSync(archivo);
  const tarea = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const extraccion = serializar(extraer(await paginasDe(await tarea.promise)));
  await tarea.destroy();
  const form = new FormData();
  form.set("archivo", new File([bytes], path.basename(archivo), { type: "application/pdf" }));
  form.set("extraccion", JSON.stringify(extraccion));
  const r = await fetch(`${api}/api/admin/documentos`, { method: "POST", body: form });
  const body = (await r.json()) as { duplicado?: boolean; estado?: string; detail?: string };
  const clave = !r.ok ? `error ${r.status}` : body.duplicado ? "duplicado" : String(body.estado);
  conteo[clave] = (conteo[clave] ?? 0) + 1;
  if (!r.ok) console.log(`ERROR ${r.status}  ${archivo}  ${body.detail}`);
}
console.log(conteo);
process.exit(Object.keys(conteo).some((k) => k.startsWith("error")) ? 1 : 0);
