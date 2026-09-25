import { useCallback, useEffect, useState } from "react";

import copy from "../content/site.yaml";
import { request } from "../lib/api.js";
import { number } from "../lib/format.js";

// Barra oliva hasta 70 %, terracota de 70 a 90 %, tinta con aviso por encima
// (docs/design/admin.md). Las cifras y los limites los decide el Worker.
const tono = (pct) => (pct >= 90 ? "alto" : pct >= 70 ? "medio" : "bajo");
const megas = (bytes) => `${(bytes / 1024 ** 2).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
const gigas = (bytes) => `${(bytes / 1024 ** 3).toLocaleString("es-CO", { maximumFractionDigits: 0 })} GB`;
const cifra = (valor, unidad) => (unidad === "bytes" ? megas(valor) : number(valor));
const tope = (valor, unidad) => (unidad === "bytes" ? gigas(valor) : number(valor));
const hora = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

function Medida({ m }) {
  const c = copy.consumo;
  const pct = m.uso === null ? null : Math.min(100, (m.uso / m.limite) * 100);
  return <article className={`consumo-card${pct === null ? " is-empty" : ` is-${tono(pct)}`}`}>
    <header><span>{m.servicio}</span><small>{m.periodo === "dia" ? c.periodo_dia : c.periodo_total}</small></header>
    <h2>{m.metrica}</h2>
    <strong>{pct === null ? "—" : `${pct.toLocaleString("es-CO", { maximumFractionDigits: pct < 1 ? 2 : 0 })} %`}</strong>
    <div className="consumo-barra" role="meter" aria-label={`${m.servicio} ${m.metrica}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}><i style={{ width: `${pct ?? 0}%` }} /></div>
    <small>{m.uso === null ? c.sin_dato : `${cifra(m.uso, m.unidad)} ${c.de} ${tope(m.limite, m.unidad)}`}</small>
    {pct !== null && pct >= 90 && <small className="consumo-aviso" role="status">{c.aviso_alto}</small>}
  </article>;
}

export default function Consumo() {
  const c = copy.consumo;
  const [datos, setDatos] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const cargar = useCallback(async () => {
    setBusy(true); setError("");
    try { setDatos(await request("/api/admin/consumo")); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  return <div className="panel-view module-view consumo-view">
    <div className="module-heading"><span className="eyebrow">{c.eyebrow}</span><h1>{c.titulo_linea1}<br /><em>{c.titulo_enfasis}</em></h1><p>{c.intro}</p></div>
    {datos?.analitica === "sin_token" && <div className="consumo-nota"><strong>{c.sin_token_titulo}</strong><p>{c.sin_token_texto}</p><ol>{c.sin_token_pasos.map((paso) => <li key={paso}>{paso}</li>)}</ol></div>}
    {datos?.analitica === "error" && <div className="consumo-nota is-error" role="alert"><strong>{c.error_titulo}</strong><p>{datos.detalle}</p></div>}
    {error && <div className="consumo-nota is-error" role="alert"><strong>{c.error_titulo}</strong><p>{error}</p></div>}
    {!datos && !error && <p className="consumo-pie">{c.cargando}</p>}
    {datos && <div className="consumo-grid">{datos.medidas.map((m) => <Medida key={m.id} m={m} />)}</div>}
    {datos && <footer className="consumo-pie"><span>{c.consultado} {hora(datos.consultado_en)} · {c.retraso}</span><button className="button" onClick={cargar} disabled={busy}>{c.actualizar}</button></footer>}
  </div>;
}
