import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import copy from "../content/site.yaml";
import { request } from "../lib/api.js";
import { moneyOrDash as money } from "../lib/format.js";

const ESTADO = { validated: "carga_validada", needs_review: "carga_revision" };

// Uno a uno a proposito: pdf.js usa un solo worker y el lote tipico es de
// decenas de archivos; en paralelo solo se pelean la CPU y la memoria.
function Carga({ onCargadas }) {
  const c = copy.revision;
  const input = useRef(null);
  const [filas, setFilas] = useState([]); const [busy, setBusy] = useState(false);
  async function subir(event) {
    const archivos = [...event.target.files]; event.target.value = "";
    if (!archivos.length) return;
    setBusy(true);
    setFilas(archivos.map((a) => ({ nombre: a.name, estado: c.carga_leyendo })));
    const { leerFactura, serializar } = await import("../lib/leer-factura");
    for (const [i, archivo] of archivos.entries()) {
      let fila;
      try {
        const form = new FormData();
        form.set("archivo", archivo);
        form.set("extraccion", JSON.stringify(serializar(await leerFactura(archivo))));
        const r = await request("/api/admin/documentos", { method: "POST", body: form });
        fila = { nombre: archivo.name, estado: r.duplicado ? c.carga_duplicada : c[ESTADO[r.estado]], detalle: r.motivos.join(" "), tono: r.estado };
      } catch (error) {
        fila = { nombre: archivo.name, estado: c.carga_error, detalle: error.message, tono: "error" };
      }
      setFilas((actual) => actual.map((f, j) => (j === i ? fila : f)));
    }
    setBusy(false);
    onCargadas();
  }
  return <section className="tool-card upload-panel"><span className="eyebrow">{c.carga_eyebrow}</span><h3>{c.carga_titulo}</h3><p>{c.carga_texto}</p><input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={subir} /><button className="button button-dark" onClick={() => input.current.click()} disabled={busy}>{busy ? `${c.carga_leyendo}…` : c.carga_boton}</button>{filas.length > 0 && <ul className="upload-results">{filas.map((f, i) => <li key={i} className={f.tono ? `is-${f.tono}` : ""}><span>{f.nombre}</span><b>{f.estado}</b>{f.detalle && <small>{f.detalle}</small>}</li>)}</ul>}</section>;
}

const vacio = { descripcion: "", cantidad: "", unidad: "", valor_unitario: "", valor_total: "" };
const texto = (v) => (v == null ? "" : String(v));
const nulo = (v) => (v.trim() === "" ? null : v.trim());

// El formulario parte de lo que se leyo. Todo viaja como texto: el servidor
// valida el formato decimal y vuelve a comprobar que la factura cierre.
function Correccion({ detalle, onListo }) {
  const c = copy.revision;
  const e = detalle.extraccion;
  const [cab, setCab] = useState({ emisor_nombre: texto(e.emisor_nombre ?? detalle.emisor), emisor_nit: texto(e.emisor_nit), fecha: texto(e.fecha), cufe: texto(e.cufe), subtotal: texto(e.subtotal), iva: texto(e.iva), total: texto(e.total) });
  const [items, setItems] = useState(() => (e.items?.length ? e.items : [vacio]).map((i) => Object.fromEntries(Object.keys(vacio).map((k) => [k, texto(i[k])]))));
  const [motivo, setMotivo] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const editItem = (i, campo, valor) => setItems((actual) => actual.map((it, j) => (j === i ? { ...it, [campo]: valor } : it)));
  // Rutas literales: el test de contrato frontend <-> API las lee del codigo.
  async function enviar(ruta, json) {
    setBusy(true); setMessage("");
    try { await request(ruta, { method: "POST", json }); onListo(); }
    catch (error) { setMessage(error.message); setBusy(false); }
  }
  const aprobar = () => enviar(`/api/admin/documentos/revision/${detalle.job_id}/aprobar`, {
    emisor_nombre: nulo(cab.emisor_nombre), emisor_nit: nulo(cab.emisor_nit), cliente_nit: e.cliente_nit ?? null, cufe: nulo(cab.cufe), fecha: nulo(cab.fecha), parser: e.parser ?? null,
    items: items.map((it) => ({ descripcion: it.descripcion.trim(), cantidad: nulo(it.cantidad), unidad: nulo(it.unidad), valor_unitario: nulo(it.valor_unitario), valor_total: nulo(it.valor_total) })),
    subtotal: nulo(cab.subtotal), iva: nulo(cab.iva), total: nulo(cab.total),
  });
  const campo = (clave, etiqueta, props = {}) => <label>{etiqueta}<input value={cab[clave]} onChange={(ev) => setCab({ ...cab, [clave]: ev.target.value })} {...props} /></label>;
  return <div className="review-detail review-correct">
    <strong>{c.aprobar_titulo}</strong><p>{c.aprobar_texto}</p>
    <div className="review-head-grid">{campo("emisor_nombre", c.campo_proveedor)}{campo("emisor_nit", c.campo_nit)}{campo("fecha", c.campo_fecha, { type: "date" })}{campo("cufe", c.campo_cufe)}</div>
    <table className="review-items"><thead><tr><th>Descripción</th><th>Cant.</th><th>Unidad</th><th>Unitario</th><th>Total</th><th /></tr></thead><tbody>{items.map((it, i) => <tr key={i}>{Object.keys(vacio).map((k) => <td key={k}><input value={it[k]} inputMode={k === "descripcion" || k === "unidad" ? undefined : "decimal"} onChange={(ev) => editItem(i, k, ev.target.value)} aria-label={`${k} renglón ${i + 1}`} /></td>)}<td><button className="apu-remove" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={c.quitar_renglon}>×</button></td></tr>)}</tbody></table>
    <button className="button" onClick={() => setItems([...items, vacio])}>{c.agregar_renglon}</button>
    <div className="review-head-grid">{campo("subtotal", c.detalle_subtotal, { inputMode: "decimal" })}{campo("iva", c.detalle_iva, { inputMode: "decimal" })}{campo("total", c.detalle_total, { inputMode: "decimal" })}</div>
    {message && <p className="review-error" role="alert">{message}</p>}
    <div className="review-actions"><button className="button button-dark" onClick={aprobar} disabled={busy}>{c.aprobar_boton}</button><input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder={c.descartar_motivo} aria-label={c.descartar_motivo} /><button className="button" onClick={() => enviar(`/api/admin/documentos/revision/${detalle.job_id}/descartar`, { motivo })} disabled={busy || !motivo.trim()}>{c.descartar_boton}</button></div>
  </div>;
}

// El detalle se pide solo al abrir una fila: la extraccion completa de un lote
// entero es mucho JSON para una lista que casi siempre se mira por encima.
function Detalle({ jobId, onListo }) {
  const c = copy.revision;
  const [detalle, setDetalle] = useState(null); const [message, setMessage] = useState("");
  useEffect(() => { let vivo = true; request(`/api/admin/documentos/revision/${jobId}`).then((d) => { if (vivo) setDetalle(d); }).catch((error) => { if (vivo) setMessage(error.message); }); return () => { vivo = false; }; }, [jobId]);
  if (message) return <p className="review-empty">{message}</p>;
  if (!detalle) return <p className="review-empty">{copy.comun.cargando}</p>;
  if (!detalle.extraccion) return <p className="review-empty">{c.sin_extraccion}</p>;
  return <Correccion detalle={detalle} onListo={onListo} />;
}

export default function RevisionFacturas() {
  const c = copy.revision;
  const [items, setItems] = useState([]); const [abierto, setAbierto] = useState(null); const [busy, setBusy] = useState(true); const [message, setMessage] = useState("");
  const cargar = useCallback(() => request("/api/admin/documentos/revision").then((data) => { setItems(data.items || []); setMessage(""); }).catch((error) => setMessage(error.message)).finally(() => setBusy(false)), []);
  useEffect(() => { cargar(); }, [cargar]);
  function listo() { setAbierto(null); cargar(); }
  return <div className="panel-view module-view">
    <Carga onCargadas={cargar} />
    <section className="review-panel">
      <header className="review-head"><span className="eyebrow">{c.eyebrow}</span><h2>{c.titulo}</h2><p>{c.intro}</p></header>
      {message && <p className="review-error">{message}</p>}
      {busy ? <p className="review-empty">{copy.comun.cargando}</p> : items.length === 0 ? <p className="review-empty">{c.vacio}</p> : <table className="review-table"><thead><tr><th>{c.columna_archivo}</th><th>{c.columna_emisor}</th><th>{c.columna_items}</th><th>{c.columna_total}</th><th>{c.columna_motivo}</th><th /></tr></thead><tbody>{items.map((fila) => <Fragment key={fila.job_id}>
        <tr><td className="review-file">{fila.archivo}</td><td>{fila.emisor || "—"}</td><td>{fila.items}</td><td>{money(fila.total)}</td><td className="review-reason">{fila.motivo}</td><td><button className="review-toggle" onClick={() => setAbierto(abierto === fila.job_id ? null : fila.job_id)}>{abierto === fila.job_id ? c.ocultar_detalle : c.ver_detalle}</button></td></tr>
        {abierto === fila.job_id && <tr><td colSpan={6}><Detalle jobId={fila.job_id} onListo={listo} /></td></tr>}
      </Fragment>)}</tbody></table>}
    </section>
  </div>;
}
