/**
 * Palabras con coordenadas desde pdf.js, con la misma semantica que
 * `extract_words` de pdfplumber (sobre la que se calibraron los perfiles):
 * una palabra se corta en espacio o cuando el hueco entre fragmentos supera
 * X_TOLERANCIA. pdf.js entrega "runs" de texto que pueden traer varias palabras
 * o partir una a la mitad; aqui se normalizan.
 *
 * No importa pdf.js: recibe el documento ya abierto, asi sirve igual en el
 * navegador y en el script de lote de Node.
 */
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem, TextStyle } from "pdfjs-dist/types/src/display/api";
import type { Pagina, Palabra } from "../../domain/extraction";

const X_TOLERANCIA = 3;
const Y_TOLERANCIA = 3;

interface Fragmento extends Palabra {
  /** Linea base, para no pegar fragmentos de filas distintas. */
  base: number;
  /** Toca el borde del run: solo asi puede continuar una palabra en otro run. */
  abreRun: boolean;
  cierraRun: boolean;
}

function fragmentos(item: TextItem, style: TextStyle | undefined, alto: number, origenX: number): Fragmento[] {
  const [a, b, , d, e, f] = item.transform;
  // Solo texto horizontal: las facturas no rotan la tabla, y lo vertical
  // (sellos, marcas laterales) no es parte de ella.
  if (Math.abs(b) > 1e-3 || !item.str) return [];
  const size = Math.abs(d) || Math.abs(a);
  const ascent = style?.ascent ?? 0.8;
  const descent = style?.descent ?? -0.2;
  const top = alto - (f + ascent * size);
  const bottom = alto - (f + descent * size);
  // Sin anchos por glifo, cada caracter recibe la parte proporcional del run.
  const porCaracter = item.width / item.str.length;
  const salida: Fragmento[] = [];
  for (const m of item.str.matchAll(/\S+/g)) {
    const x0 = e - origenX + m.index * porCaracter;
    salida.push({
      text: m[0], x0, x1: x0 + m[0].length * porCaracter, top, bottom, base: f,
      abreRun: m.index === 0, cierraRun: m.index + m[0].length === item.str.length,
    });
  }
  return salida;
}

async function palabrasDePagina(page: PDFPageProxy): Promise<Pagina> {
  const [origenX, , , alto] = page.view;
  const contenido = await page.getTextContent();
  const sueltos = contenido.items.flatMap((item) =>
    "str" in item ? fragmentos(item, contenido.styles[item.fontName], alto, origenX) : [],
  );
  // Une una palabra partida entre runs consecutivos (kerning, cambio de
  // fuente). Un espacio explicito dentro del run siempre corta, como en
  // pdfplumber; y se respeta el orden del flujo, sin reordenar.
  const palabras: Palabra[] = [];
  let actual = null as Fragmento | null;
  for (const frag of sueltos) {
    if (actual && actual.cierraRun && frag.abreRun && Math.abs(frag.base - actual.base) <= Y_TOLERANCIA && frag.x0 - actual.x1 <= X_TOLERANCIA && frag.x0 >= actual.x0) {
      actual = { ...actual, text: actual.text + frag.text, cierraRun: frag.cierraRun, x1: Math.max(actual.x1, frag.x1), top: Math.min(actual.top, frag.top), bottom: Math.max(actual.bottom, frag.bottom) };
      continue;
    }
    if (actual) palabras.push(sinBase(actual));
    actual = frag;
  }
  if (actual) palabras.push(sinBase(actual));
  return palabras;
}

const sinBase = ({ text, x0, x1, top, bottom }: Fragmento): Palabra => ({ text, x0, x1, top, bottom });

export async function paginasDe(pdf: PDFDocumentProxy): Promise<Pagina[]> {
  const paginas: Pagina[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) paginas.push(await palabrasDePagina(await pdf.getPage(n)));
  return paginas;
}
