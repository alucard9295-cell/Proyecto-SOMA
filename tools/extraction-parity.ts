/**
 * Paridad del extractor TS (pdf.js + domain/extraction) contra la linea base
 * del extractor Python (tools/baseline/baseline.json, por sha256).
 *
 *   npx tsx tools/extraction-parity.ts <carpeta-pdfs> [--detalle]
 *
 * Compara estado, emisor, CUFE, fecha, pie e items campo a campo. Sale con
 * codigo 1 si algun documento difiere.
 *
 * Unica diferencia tolerada: la descripcion de un item en un documento que ambos
 * dejan en needs_review. pdf.js no da la X de cada glifo, solo la del run; dentro
 * de un run de varias palabras la posicion se estima, y la palabra pegada al
 * borde SKU|descripcion de Sodimac puede cambiar de columna. No toca montos ni
 * veredictos, y esos items pasan por revision humana antes de entrar a la base.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import Big from "big.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extraer, fechaIso, type FacturaExtraida } from "../domain/extraction";
import { totalEfectivo } from "../domain/facturas";
import { paginasDe } from "../src/lib/pdf-words";

interface Linea {
  hash: string;
  archivo: string;
  estado: string;
  motivos: string[];
  emisor_nit: string | null;
  cufe: string | null;
  fecha: string | null;
  subtotal: string | null;
  iva: string | null;
  total: string | null;
  items: { descripcion: string; cantidad: string | null; unidad: string | null; valor_unitario: string | null; valor_total: string | null }[];
}

const [carpeta, ...flags] = process.argv.slice(2);
if (!carpeta) throw new Error("Uso: tsx tools/extraction-parity.ts <carpeta-pdfs> [--detalle]");
const detalle = flags.includes("--detalle");
const base = new Map<string, Linea>(
  (JSON.parse(readFileSync(path.join(import.meta.dirname, "baseline/baseline.json"), "utf8")) as Linea[]).map((l) => [l.hash, l]),
);

function pdfs(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((n) => {
    const full = path.join(dir, n);
    return statSync(full).isDirectory() ? pdfs(full) : n.toLowerCase().endsWith(".pdf") ? [full] : [];
  });
}

const igualMonto = (a: string | null, b: Big | null) => (a === null ? b === null : b !== null && new Big(a).eq(b));

function diferencias(py: Linea, ts: FacturaExtraida): string[] {
  const d: string[] = [];
  const cmp = (campo: string, a: unknown, b: unknown) => { if (a !== b) d.push(`${campo}: py=${JSON.stringify(a)} ts=${JSON.stringify(b)}`); };
  cmp("estado", py.estado, ts.veredicto.estado);
  cmp("emisor", py.emisor_nit, ts.emisor_nit);
  cmp("cufe", py.cufe, ts.cufe);
  cmp("fecha", fechaIso(py.fecha), ts.fecha);
  for (const k of ["subtotal", "iva", "total"] as const) if (!igualMonto(py[k], ts[k])) cmp(k, py[k], ts[k]?.toString() ?? null);
  cmp("n_items", py.items.length, ts.items.length);
  py.items.forEach((pi, i) => {
    const ti = ts.items[i];
    if (!ti) return;
    cmp(`item${i}.descripcion`, pi.descripcion, ti.descripcion);
    cmp(`item${i}.unidad`, pi.unidad, ti.unidad ?? null);
    if (!igualMonto(pi.cantidad, ti.cantidad ?? null)) cmp(`item${i}.cantidad`, pi.cantidad, ti.cantidad?.toString() ?? null);
    if (!igualMonto(pi.valor_unitario, ti.valor_unitario ?? null)) cmp(`item${i}.valor_unitario`, pi.valor_unitario, ti.valor_unitario?.toString() ?? null);
    if (!igualMonto(pi.valor_total, totalEfectivo(ti))) cmp(`item${i}.valor_total`, pi.valor_total, totalEfectivo(ti)?.toString() ?? null);
  });
  if (py.estado === "needs_review" && ts.veredicto.estado === "needs_review") cmp("motivos", py.motivos.join(" | "), ts.veredicto.motivos.join(" | "));
  return d;
}

const tolerada = (py: Linea, ts: FacturaExtraida, x: string) =>
  py.estado === "needs_review" && ts.veredicto.estado === "needs_review" && /^item\d+\.descripcion:/.test(x);

let iguales = 0, toleradas = 0, validadosTs = 0, itemsTs = 0;
const vistos = new Set<string>();
const porCampo = new Map<string, number>();
for (const archivo of pdfs(carpeta)) {
  const bytes = readFileSync(archivo);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (vistos.has(hash)) continue;
  vistos.add(hash);
  const py = base.get(hash);
  if (!py) { console.log(`SIN LINEA BASE  ${archivo}`); continue; }
  const tarea = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const ts = extraer(await paginasDe(await tarea.promise));
  await tarea.destroy();
  validadosTs += ts.veredicto.estado === "validated" ? 1 : 0;
  itemsTs += ts.items.length;
  const todas = diferencias(py, ts);
  const d = todas.filter((x) => !tolerada(py, ts, x));
  toleradas += todas.length - d.length;
  if (d.length === 0) { iguales += 1; continue; }
  for (const x of d) { const campo = x.split(":")[0].replace(/^item\d+\./, "item."); porCampo.set(campo, (porCampo.get(campo) ?? 0) + 1); }
  console.log(`DIFIERE  ${py.archivo}  [${py.emisor_nit ?? "-"} ${py.estado}]`);
  for (const x of detalle ? d : d.slice(0, 4)) console.log(`   ${x.slice(0, 220)}`);
}
const validadosPy = [...base.values()].filter((l) => l.estado === "validated").length;
console.log(`\n${iguales}/${vistos.size} documentos en paridad (${toleradas} descripciones toleradas en needs_review) | validados py=${validadosPy} ts=${validadosTs} | items py=${[...base.values()].reduce((s, l) => s + l.items.length, 0)} ts=${itemsTs}`);
if (porCampo.size) console.log("diferencias por campo:", Object.fromEntries([...porCampo].sort((a, b) => b[1] - a[1])));
process.exit(iguales === vistos.size ? 0 : 1);
