import copy from "../content/site.yaml";
import { useEffect, useState } from "react";
import { request } from "../lib/api.js";
import { money, number } from "../lib/format.js";
import { navigate } from "../lib/route.js";
import ModuleHelper from "./ModuleHelper.jsx";

function Kpi({ label, value, detail, accent = "" }) {
  return <article className={`kpi-card ${accent}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function MonthlyChart({ data }) {
  const rows = data?.length ? data : [{ mes: "Sin datos", total: 0, facturas: 0 }];
  const max = Math.max(...rows.map((row) => row.total || 0), 1);
  return <article className="chart-card chart-monthly"><div className="chart-heading"><div><span className="eyebrow">RITMO DE GASTO</span><h3>Lo que se mueve en el tiempo</h3></div><span className="chart-caption">COP / MES</span></div><div className="bar-chart">{rows.slice(-8).map((row) => <div className="bar-column" key={row.mes}><span className="bar-value">{row.total ? money(row.total) : "—"}</span><div className="bar-track"><i style={{ height: `${Math.max((row.total / max) * 100, row.total ? 8 : 2)}%` }} /></div><b>{row.mes}</b><small>{row.facturas} factura(s)</small></div>)}</div></article>;
}

function ProviderChart({ data }) {
  const rows = data?.length ? data.slice(0, 5) : [{ proveedor: "Sin proveedores", total: 0, facturas: 0 }];
  const max = Math.max(...rows.map((row) => row.total || 0), 1);
  return <article className="chart-card"><div className="chart-heading"><div><span className="eyebrow">CONCENTRACIÓN</span><h3>Quién está pesando</h3></div><span className="chart-caption">TOP 5</span></div><div className="provider-chart">{rows.map((row, index) => <div className="provider-row" key={row.proveedor}><div className="provider-label"><b>0{index + 1}</b><span title={row.proveedor}>{row.proveedor}</span><strong>{money(row.total)}</strong></div><div className="provider-track"><i style={{ width: `${Math.max((row.total / max) * 100, row.total ? 7 : 2)}%` }} /></div><small>{row.facturas} documento(s)</small></div>)}</div></article>;
}

function QualityChart({ finance }) {
  const quality = finance?.quality || {};
  const total = quality.total || 0;
  const complete = total ? Math.round(((quality.con_total || 0) / total) * 100) : 0;
  const dated = total ? Math.round(((quality.con_fecha || 0) / total) * 100) : 0;
  return <article className="chart-card quality-card"><div className="chart-heading"><div><span className="eyebrow">CALIDAD DE LECTURA</span><h3>¿Qué tan completa está la señal?</h3></div><span className="chart-caption">CONTROL</span></div><div className="quality-layout"><div className="quality-ring" style={{ "--quality": `${complete}%` }}><strong>{complete}%</strong><span>totales<br />capturados</span></div><div className="quality-list"><div><span><i className="legend terracotta" />Totales con valor</span><b>{complete}%</b></div><div><span><i className="legend olive" />Fechas identificadas</span><b>{dated}%</b></div><div><span><i className="legend graphite" />Alertas de calidad</span><b>{finance?.alertas_calidad || 0}</b></div></div></div></article>;
}

export default function Dashboard() {
  const c = copy.resumen;
  const [finance, setFinance] = useState(null); const [message, setMessage] = useState("");
  useEffect(() => { let vivo = true; request("/api/admin/summary").then((d) => { if (vivo) setFinance(d); }).catch((error) => { if (vivo) setMessage(error.message); }); return () => { vivo = false; }; }, []);
  const [facturas, gasto, proveedores, revision] = c.kpis;
  return <div className="panel-view dashboard-view"><div className="dashboard-intro"><div><span className="eyebrow">{c.eyebrow}</span><h1>{c.titulo_linea1}<br />{c.titulo_linea2}<br /><em>{c.titulo_enfasis}</em></h1></div><div className="intro-note"><span className="pulse-dot" /> <b>{c.estado_activo}</b><p>{c.estado_texto}</p></div></div><ModuleHelper title={c.ayuda_titulo}>{c.ayuda_texto}</ModuleHelper>{message && <div className="feedback-card" role="status">{message}</div>}<div className="kpi-grid"><Kpi label={facturas.etiqueta} value={number(finance?.facturas)} detail={facturas.detalle} accent="terra" /><Kpi label={gasto.etiqueta} value={money(finance?.total_pagado)} detail={gasto.detalle} /><Kpi label={proveedores.etiqueta} value={number(finance?.proveedores)} detail={proveedores.detalle} /><Kpi label={revision.etiqueta} value={number(finance?.alertas_calidad)} detail={revision.detalle} accent={finance?.alertas_calidad ? "warning" : ""} /></div><div className="chart-grid"><MonthlyChart data={finance?.monthly} /><ProviderChart data={finance?.providers_chart} /><QualityChart finance={finance} /></div><div className="dashboard-actions"><div><span className="eyebrow">{c.acciones_eyebrow}</span><h2>{c.acciones_titulo}</h2><p>{c.acciones_texto}</p></div><div className="action-stack">{c.acciones.map((a) => <button key={a.ruta} className={a.principal ? "button button-dark" : "button"} onClick={() => navigate(a.ruta)}>{a.etiqueta}</button>)}</div></div></div>;
}
