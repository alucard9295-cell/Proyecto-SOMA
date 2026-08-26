import { Fragment, useEffect, useState } from "react";

import copy from "./content/site.yaml";

const API = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";
const money = (value) => value === null || value === undefined ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value) || 0);

async function get(path, token) {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json();
  if (!response.ok) { const error = new Error(payload?.detail || copy.revision.error_carga); error.status = response.status; throw error; }
  return payload;
}

// El detalle se pide solo al abrir una fila: la extraccion completa de un lote
// entero es mucho JSON para una lista que casi siempre se mira por encima.
function Renglones({ jobId, token }) {
  const c = copy.revision;
  const [detalle, setDetalle] = useState(null); const [message, setMessage] = useState("");
  useEffect(() => { let vivo = true; get(`/api/admin/documentos/revision/${jobId}`, token).then((d) => { if (vivo) setDetalle(d); }).catch((error) => { if (vivo) setMessage(error.message); }); return () => { vivo = false; }; }, [jobId, token]);
  if (message) return <p className="review-empty">{message}</p>;
  if (!detalle) return <p className="review-empty">{copy.comun.cargando}</p>;
  const extraccion = detalle.extraccion;
  if (!extraccion) return <p className="review-empty">{c.sin_extraccion}</p>;
  const items = extraccion.items || [];
  return <div className="review-detail">
    <p className="review-totals"><span>{c.detalle_subtotal}: <strong>{money(extraccion.subtotal)}</strong></span><span>{c.detalle_iva}: <strong>{money(extraccion.iva)}</strong></span><span>{c.detalle_total}: <strong>{money(extraccion.total)}</strong></span></p>
    {items.length === 0 ? <p className="review-empty">{c.sin_items}</p> : <table className="review-items"><thead><tr><th>Descripción</th><th>Cant.</th><th>Unidad</th><th>Unitario</th><th>Total</th></tr></thead><tbody>{items.map((item, i) => <tr key={i}><td>{item.descripcion || "—"}</td><td>{item.cantidad ?? "—"}</td><td>{item.unidad || "—"}</td><td>{money(item.valor_unitario)}</td><td>{money(item.valor_total)}</td></tr>)}</tbody></table>}
  </div>;
}

export default function RevisionFacturas({ token }) {
  const c = copy.revision;
  const [items, setItems] = useState([]); const [abierto, setAbierto] = useState(null); const [busy, setBusy] = useState(true); const [message, setMessage] = useState("");
  useEffect(() => { let vivo = true; get("/api/admin/documentos/revision", token).then((data) => { if (vivo) { setItems(data.items || []); setBusy(false); } }).catch((error) => { if (vivo) { setMessage(error.message); setBusy(false); } }); return () => { vivo = false; }; }, [token]);
  return <section className="review-panel">
    <header className="review-head"><span className="eyebrow">{c.eyebrow}</span><h2>{c.titulo}</h2><p>{c.intro}</p></header>
    {message && <p className="review-error">{message}</p>}
    {busy ? <p className="review-empty">{copy.comun.cargando}</p> : items.length === 0 ? <p className="review-empty">{c.vacio}</p> : <table className="review-table"><thead><tr><th>{c.columna_archivo}</th><th>{c.columna_emisor}</th><th>{c.columna_items}</th><th>{c.columna_total}</th><th>{c.columna_motivo}</th><th /></tr></thead><tbody>{items.map((fila) => <Fragment key={fila.job_id}>
      <tr><td className="review-file">{fila.archivo}</td><td>{fila.emisor || "—"}</td><td>{fila.items}</td><td>{money(fila.total)}</td><td className="review-reason">{fila.motivo}</td><td><button className="review-toggle" onClick={() => setAbierto(abierto === fila.job_id ? null : fila.job_id)}>{abierto === fila.job_id ? c.ocultar_detalle : c.ver_detalle}</button></td></tr>
      {abierto === fila.job_id && <tr><td colSpan={6}><Renglones jobId={fila.job_id} token={token} /></td></tr>}
    </Fragment>)}</tbody></table>}
  </section>;
}
