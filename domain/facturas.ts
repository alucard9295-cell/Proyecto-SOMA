/**
 * Lectura y validacion de importes de factura.
 *
 * Reglas puras: no sabe de PDF, de base de datos ni de HTTP. Recibe texto y
 * numeros, devuelve Decimal y veredictos. Extraer el texto del documento es
 * trabajo de infraestructura; decidir si las cifras son creibles es de aqui.
 */
import { dec, money, sum, type Decimal, type DecimalInput } from "./money";

// Un peso. Las facturas reales redondean: una de las de prueba declara un total
// un peso mayor que subtotal + IVA. Rechazarla por eso seria ruido, no control.
const TOLERANCIA = dec("1.00");

// Un importe de factura siempre trae separador de miles. Exigirlo descarta el
// ruido que rodea a las etiquetas del pie: el "19" de "IVA 19%" y el "2026" de
// una fecha, que si no se cuelan como si fueran montos.
const IMPORTE = /\$?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?/;

/**
 * Lee un importe en cualquiera de los formatos de los proveedores reales:
 *
 *     $150,000.00  -> 150000.00   (coma miles, punto decimal)
 *     73.361,34    -> 73361.34    (punto miles, coma decimal)
 *     330.000      -> 330000.00   (punto miles, sin decimales)
 *
 * Regla: **el ultimo separador es decimal solo si le siguen exactamente dos
 * digitos**. La validacion aritmetica confirma despues si la lectura fue
 * correcta. Devuelve null cuando no hay numero legible; nunca lanza.
 */
export function parseMoney(texto: string | null | undefined): Decimal | null {
  if (texto === null || texto === undefined) return null;
  // Solo el primer numero: limpiar todo lo que no sea digito concatenaria dos
  // importes vecinos ("285,714.00 340,000.00") en uno gigante sin avisar.
  const encontrado = /-?\d[\d.,]*/.exec(String(texto));
  if (!encontrado) return null;
  const limpio = encontrado[0].replace(/[.,]+$/, "");
  if (!limpio || !/\d/.test(limpio)) return null;

  const ultimo = Math.max(limpio.lastIndexOf("."), limpio.lastIndexOf(","));
  let entero = limpio;
  let decimales = "";
  if (ultimo !== -1) {
    const cola = limpio.slice(ultimo + 1);
    if (/^\d{2}$/.test(cola)) {
      entero = limpio.slice(0, ultimo);
      decimales = cola;
    }
  }
  entero = entero.replace(/[.,]/g, "");
  if (!entero.replace(/^-+/, "")) return null;
  try {
    return money(decimales ? `${entero}.${decimales}` : entero);
  } catch {
    return null;
  }
}

/** Primer monto con formato de dinero dentro de un texto. */
export function primerImporte(texto: string | null | undefined): Decimal | null {
  const encontrado = IMPORTE.exec(texto ?? "");
  return encontrado ? parseMoney(encontrado[0]) : null;
}

/** Un renglon de la factura, ya leido pero todavia no confiable. */
export interface ItemFactura {
  descripcion: string;
  cantidad?: Decimal | null;
  unidad?: string | null;
  valor_unitario?: Decimal | null;
  valor_total?: Decimal | null;
}

/** Total del renglon: el declarado, o cantidad x unitario si falta. */
export function totalEfectivo(item: ItemFactura): Decimal | null {
  if (item.valor_total != null) return money(item.valor_total);
  if (item.cantidad != null && item.valor_unitario != null) return money(item.cantidad.times(item.valor_unitario));
  return null;
}

export type EstadoFactura = "validated" | "needs_review";

export interface Veredicto {
  valida: boolean;
  motivos: string[];
  estado: EstadoFactura;
}

const fmt = (value: Decimal) => value.toFixed(2);

/**
 * Comprueba que la factura cierra consigo misma. Hacen falta las dos pruebas:
 *
 * 1. La suma de los items coincide con el subtotal.
 * 2. Subtotal mas impuestos coincide con el total.
 *
 * La segunda sola no alcanza: el pie se lee aparte de la tabla, asi que los
 * renglones pueden estar destrozados y la factura igual "cuadrar" (verificado
 * sobre facturas reales). Una factura que no cierra va a revision humana.
 */
export function validar(args: {
  items: ItemFactura[];
  subtotal: DecimalInput | null;
  iva: DecimalInput | null;
  total: DecimalInput | null;
  tolerancia?: Decimal;
}): Veredicto {
  const { items, tolerancia = TOLERANCIA } = args;
  const subtotal = args.subtotal == null ? null : money(args.subtotal);
  const total = args.total == null ? null : money(args.total);
  const motivos: string[] = [];

  if (!items.length) motivos.push("La factura no tiene items legibles.");
  if (subtotal === null) motivos.push("No se pudo leer el subtotal.");
  if (total === null) motivos.push("No se pudo leer el total.");

  if (items.length && subtotal !== null) {
    const totales = items.map(totalEfectivo);
    if (totales.some((valor) => valor === null)) {
      motivos.push("Hay items sin importe legible.");
    } else {
      const suma = money(sum(totales as Decimal[]));
      if (suma.minus(subtotal).abs().gt(tolerancia)) {
        motivos.push(`La suma de los items (${fmt(suma)}) no coincide con el subtotal (${fmt(subtotal)}).`);
      }
    }
  }

  if (subtotal !== null && total !== null) {
    const impuestos = args.iva == null ? money(0) : money(args.iva);
    const esperado = money(subtotal.plus(impuestos));
    if (esperado.minus(total).abs().gt(tolerancia)) {
      motivos.push(`Subtotal mas IVA (${fmt(esperado)}) no coincide con el total (${fmt(total)}).`);
    }
  }

  return { valida: !motivos.length, motivos, estado: motivos.length ? "needs_review" : "validated" };
}
