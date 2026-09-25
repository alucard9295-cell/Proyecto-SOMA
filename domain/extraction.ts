/**
 * Extraccion de facturas de proveedor a partir de palabras con coordenadas.
 *
 * Dominio puro: no sabe de PDF. Quien lo llama (pdf.js en el navegador, o el
 * script de lote en Node) entrega las palabras de cada pagina; aqui se decide
 * que es un renglon, que es el pie y que cifra es creible. Port fiel de
 * invoice_parsing.py, verificado contra su salida (tools/baseline).
 *
 * **No se usa OCR.** Las facturas traen capa de texto con los digitos exactos;
 * rasterizar para adivinar caracteres degrada un dato correcto.
 *
 * La tecnica:
 * 1. Agrupar palabras por coordenada Y -> filas visuales. El orden de lectura
 *    del PDF no coincide con el visual (las columnas salen entremezcladas).
 * 2. Localizar la fila de encabezado y tomar la X de cada titulo.
 * 3. Asignar cada palabra de cada fila a la columna cuyo borde la precede.
 *
 * Un solo algoritmo. Lo unico que cambia por emisor es `PerfilEmisor`.
 */
import { parseMoney, primerImporte, validar, type ItemFactura, type Veredicto } from "./facturas";
import type { Decimal } from "./money";

/** Una palabra de la pagina. Coordenadas en puntos, origen arriba a la izquierda. */
export interface Palabra {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

export type Pagina = Palabra[];

/** NIT del comprador. Si no aparece, la factura no es nuestra. */
export const NIT_COMPRADOR = "901687820";

/** CUFE: 96 hexadecimales. Clave determinista para deduplicar sin leer cifras. */
const CUFE = /[0-9a-f]{96}/;

const FECHA = /\b(\d{4}[/-]\d{2}[/-]\d{2}|\d{2}[/-]\d{2}[/-]\d{4})\b/;

/** Tolerancia horizontal: los titulos rara vez estan justo sobre su dato. */
const MARGEN_COLUMNA = 12;

/** Dos palabras son de la misma fila si sus centros verticales distan esto o menos. */
const TOLERANCIA_FILA = 2.5;

export interface PerfilEmisor {
  nit: string;
  nombre: string;
  titulos: Record<string, string[]>;
  filaItem: RegExp;
  camposTotales: Record<string, "subtotal" | "iva" | "total">;
}

export interface FacturaExtraida {
  emisor_nit: string | null;
  emisor_nombre: string | null;
  cliente_nit: string | null;
  cufe: string | null;
  /** ISO yyyy-mm-dd. Las facturas colombianas escriben dd/mm/aaaa o aaaa/mm/dd. */
  fecha: string | null;
  parser: string | null;
  items: ItemFactura[];
  subtotal: Decimal | null;
  iva: Decimal | null;
  total: Decimal | null;
  veredicto: Veredicto;
}

const revision = (motivo: string): Veredicto => ({ valida: false, motivos: [motivo], estado: "needs_review" });

export const PERFILES: readonly PerfilEmisor[] = [
  {
    nit: "901649012",
    nombre: "FERRETERIA CONSTRUCTIVA Y DEPOSITO DE MATERIALES SAS",
    titulos: {
      linea: ["NO"],
      referencia: ["REF"],
      descripcion: ["DESCRIPCIÓN", "DESCRIPCION"],
      cantidad: ["CANT"],
      unidad: ["U/M"],
      valor_unitario: ["PRECIO"],
      impuesto: ["IMP"],
      // La columna SUBTOTAL del renglon, no TOTAL ITEM: es la que suma el
      // subtotal de la factura. Derivar cantidad x unitario da 25 pesos de menos
      // en una factura real, porque el emisor redondea el unitario.
      valor_total: ["SUBTOTAL"],
      // "TOTAL" y no "ITEM": el titulo es "TOTAL ITEM" y la columna empieza en
      // la primera palabra. Anclarla en "ITEM" corre el borde a la derecha de
      // sus propias cifras, que caen en la columna previa.
      total_con_impuesto: ["TOTAL"],
    },
    filaItem: /^\d+\s/,
    camposTotales: { Subtotal: "subtotal", IVA: "iva", Total: "total" },
  },
  {
    nit: "901464983",
    nombre: "ELEEQUIPOS SAS",
    titulos: {
      linea: ["ITEM"],
      referencia: ["CÓDIGO", "CODIGO"],
      descripcion: ["DESCRIPCIÓN", "DESCRIPCION"],
      cantidad: ["CANTIDAD"],
      unidad: ["U"],
      valor_unitario: ["VALOR"],
      valor_total: ["TOTAL"],
    },
    filaItem: /^\d+\s/,
    camposTotales: { SUBTOTAL: "subtotal", IVA: "iva", "TOTAL A PAGAR": "total" },
  },
  {
    nit: "800242106",
    nombre: "SODIMAC COLOMBIA S.A.",
    titulos: {
      cantidad: ["CANT"],
      referencia: ["SKU"],
      descripcion: ["DESCRIPCIÓN", "DESCRIPCION"],
    },
    filaItem: /^\d+\s+\d+\s/,
    camposTotales: { "SUB.TOTAL": "subtotal", IVA: "iva", "TOTAL A PAGAR": "total" },
  },
];

type Fila = [y: number, palabras: Palabra[]];

/** Agrupa las palabras de la pagina en filas visuales por coordenada Y. */
export function filas(pagina: Pagina, tolerancia = TOLERANCIA_FILA): Fila[] {
  const agrupadas = new Map<number, Palabra[]>();
  for (const palabra of pagina) {
    const centro = (palabra.top + palabra.bottom) / 2;
    let clave = centro;
    for (const k of agrupadas.keys()) {
      if (Math.abs(k - centro) <= tolerancia) {
        clave = k;
        break;
      }
    }
    const fila = agrupadas.get(clave);
    if (fila) fila.push(palabra);
    else agrupadas.set(clave, [palabra]);
  }
  return [...agrupadas.keys()].sort((a, b) => a - b).map((k) => [k, [...agrupadas.get(k)!].sort((a, b) => a.x0 - b.x0)]);
}

const texto = (palabras: Palabra[]) => palabras.map((p) => p.text).join(" ");

/** Coordenada X de inicio de cada columna, segun los titulos hallados. */
function columnas(palabras: Palabra[], titulos: Record<string, string[]>): Map<string, number> {
  const halladas = new Map<string, number>();
  for (const [campo, claves] of Object.entries(titulos)) {
    for (const palabra of palabras) {
      if (claves.includes(palabra.text.toUpperCase().replace(/^[.:]+|[.:]+$/g, "")) && !halladas.has(campo)) {
        halladas.set(campo, palabra.x0);
      }
    }
  }
  return halladas;
}

/** Asigna cada palabra a la columna de mayor inicio que la preceda. */
function repartir(palabras: Palabra[], cols: Map<string, number>): Record<string, string> {
  // Orden estable por X: con empate gana el titulo declarado primero, como en Python.
  const orden = [...cols.entries()].sort((a, b) => a[1] - b[1]);
  const celdas: Record<string, string[]> = Object.fromEntries(orden.map(([campo]) => [campo, []]));
  for (const palabra of palabras) {
    let elegida = orden[0][0];
    for (const [campo, x] of orden) if (palabra.x0 >= x - MARGEN_COLUMNA) elegida = campo;
    celdas[elegida].push(palabra.text);
  }
  return Object.fromEntries(Object.entries(celdas).map(([campo, partes]) => [campo, partes.join(" ").trim()]));
}

/** Primer perfil cuyo NIT aparezca en el documento. Sin match, revision. */
function perfilDe(textoPlano: string): PerfilEmisor | null {
  const plano = textoPlano.replace(/[. -]/g, "");
  return PERFILES.find((perfil) => plano.includes(perfil.nit)) ?? null;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Lee subtotal, IVA y total del pie. Reglas que costaron iteraciones sobre
 * facturas reales (ver skill soma-facturas):
 * 1. Solo **debajo** de la ultima fila de item: "IVA" hace match dentro de un
 *    renglon ("IVA 19% $285,714.00").
 * 2. Palabra completa: sin frontera, "Total" hace match dentro de "Subtotal".
 * 3. El monto trae separador de miles (primerImporte), o el "19" de "IVA 19%"
 *    se cuela como importe.
 * 4. Etiquetas largas primero: "TOTAL A PAGAR" le gana a "TOTAL".
 */
function totales(todas: Fila[], perfil: PerfilEmisor, ultimaYItem: number) {
  const etiquetas = Object.entries(perfil.camposTotales).sort((a, b) => b[0].length - a[0].length);
  const encontrados: Partial<Record<"subtotal" | "iva" | "total", Decimal>> = {};
  for (const [y, palabras] of todas) {
    if (y <= ultimaYItem) continue;
    const linea = texto(palabras);
    for (const [etiqueta, campo] of etiquetas) {
      if (encontrados[campo]) continue;
      // \b de Python es Unicode; en JS se emula con lookarounds de letra/digito.
      const hallazgo = new RegExp(`(?<![A-Za-zÁÉÍÓÚÑ])${escapar(etiqueta)}(?![\\p{L}\\p{N}_])`, "iu").exec(linea);
      if (!hallazgo) continue;
      const monto = primerImporte(linea.slice(hallazgo.index + hallazgo[0].length));
      if (monto !== null) encontrados[campo] = monto;
    }
  }
  return encontrados;
}

/** dd/mm/aaaa o aaaa/mm/dd (con / o -) a ISO. */
export function fechaIso(cruda: string | null): string | null {
  if (!cruda) return null;
  const [a, b, c] = cruda.split(/[/-]/);
  return a.length === 4 ? `${a}-${b}-${c}` : `${c}-${b}-${a}`;
}

/**
 * Texto plano por filas visuales, como `extract_text` de pdfplumber: basta para
 * buscar NIT, CUFE y fecha, que no dependen de la tabla.
 */
function textoPlano(paginas: Fila[][]): string {
  return paginas.map((fs) => fs.map(([, palabras]) => texto(palabras)).join("\n")).join("\n");
}

/** Lee una factura a partir de sus paginas. Nunca lanza: un fallo es `needs_review`. */
export function extraer(paginas: Pagina[]): FacturaExtraida {
  const factura: FacturaExtraida = {
    emisor_nit: null, emisor_nombre: null, cliente_nit: null, cufe: null, fecha: null, parser: null,
    items: [], subtotal: null, iva: null, total: null, veredicto: revision("Sin procesar."),
  };
  try {
    const porPagina = paginas.map((p) => filas(p));
    const plano = textoPlano(porPagina);
    const sinEspacios = plano.replace(/\s+/g, "");

    factura.cufe = CUFE.exec(sinEspacios)?.[0] ?? null;
    if (sinEspacios.replace(/[.-]/g, "").includes(NIT_COMPRADOR)) factura.cliente_nit = NIT_COMPRADOR;

    const perfil = perfilDe(plano);
    if (!perfil) {
      factura.veredicto = revision("Ningun perfil de emisor reconoce este documento.");
      return factura;
    }
    factura.emisor_nit = perfil.nit;
    factura.emisor_nombre = perfil.nombre;
    factura.parser = perfil.nombre;
    factura.fecha = fechaIso(FECHA.exec(plano)?.[0] ?? null);

    const todas: Fila[] = [];
    let ultimaYItem = 0;
    // Las Y se reinician en cada pagina; como en Python, la frontera del pie se
    // compara contra la Y de la ultima fila de item de cualquier pagina.
    for (const filasPagina of porPagina) {
      todas.push(...filasPagina);
      const minimo = Math.max(3, Object.keys(perfil.titulos).length - 3);
      let cols: Map<string, number> | null = null;
      let yEncabezado = 0;
      for (const [y, palabras] of filasPagina) {
        const candidatas = columnas(palabras, perfil.titulos);
        if (candidatas.size >= minimo) {
          cols = candidatas;
          yEncabezado = y;
          break;
        }
      }
      if (!cols) continue;

      for (const [y, palabras] of filasPagina) {
        if (y <= yEncabezado || !perfil.filaItem.test(texto(palabras))) continue;
        const celdas = repartir(palabras, cols);
        // Una fila de item trae al menos un importe distinto de cero. No se puede
        // exigir la columna "precio": Sodimac no titula sus montos.
        if (!Object.values(celdas).some((valor) => { const m = parseMoney(valor); return m !== null && !m.eq(0); })) continue;
        factura.items.push({
          descripcion: (celdas.descripcion ?? "").trim(),
          cantidad: parseMoney(celdas.cantidad),
          unidad: celdas.unidad || null,
          valor_unitario: parseMoney(celdas.valor_unitario),
          valor_total: parseMoney(celdas.valor_total),
        });
        ultimaYItem = Math.max(ultimaYItem, y);
      }
    }

    const t = totales(todas, perfil, ultimaYItem);
    factura.subtotal = t.subtotal ?? null;
    factura.iva = t.iva ?? null;
    factura.total = t.total ?? null;
  } catch (error) {
    factura.veredicto = revision(`No se pudo leer el documento: ${error instanceof Error ? error.message : String(error)}`);
    return factura;
  }
  factura.veredicto = validar({ items: factura.items, subtotal: factura.subtotal, iva: factura.iva, total: factura.total });
  return factura;
}
