// Lectura de facturas en el navegador: pdf.js da las palabras con posicion y
// domain/extraction las interpreta con los perfiles de cada emisor. pdf.js pesa
// cerca de 1 MB, asi que se carga solo cuando alguien sube un archivo.
import { extraer, type FacturaExtraida } from "../../domain/extraction";
import type { Decimal } from "../../domain/money";
import { paginasDe } from "./pdf-words";

let pdfjs: typeof import("pdfjs-dist") | undefined;
async function cargarPdfjs() {
  if (!pdfjs) {
    pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}

// Texto decimal plano: Big.toString pasaria a notacion exponencial en extremos.
const decimal = (valor: Decimal | null | undefined) => (valor == null ? null : valor.toFixed());

/** Lo que espera POST /api/admin/documentos: importes como texto, nunca float. */
export function serializar(f: FacturaExtraida) {
  return {
    emisor_nit: f.emisor_nit, emisor_nombre: f.emisor_nombre, cliente_nit: f.cliente_nit, cufe: f.cufe, fecha: f.fecha, parser: f.parser,
    items: f.items.map((i) => ({ descripcion: i.descripcion, cantidad: decimal(i.cantidad), unidad: i.unidad ?? null, valor_unitario: decimal(i.valor_unitario), valor_total: decimal(i.valor_total) })),
    subtotal: decimal(f.subtotal), iva: decimal(f.iva), total: decimal(f.total),
  };
}

/** Lee un File PDF. Nunca lanza por contenido: un PDF raro queda en revision. */
export async function leerFactura(archivo: File): Promise<FacturaExtraida> {
  const { getDocument } = await cargarPdfjs();
  const tarea = getDocument({ data: new Uint8Array(await archivo.arrayBuffer()), verbosity: 0 });
  try {
    return extraer(await paginasDe(await tarea.promise));
  } finally {
    await tarea.destroy();
  }
}
