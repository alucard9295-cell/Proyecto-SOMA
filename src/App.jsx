import { useEffect, useRef, useState } from "react";
import copy from "./content/site.yaml";
import ApuEditor from "./ApuEditor.jsx";
import ProjectSimulator from "./ProjectSimulator.jsx";
import mark from "./assets/soma-mark.svg";
import collectiveHousing from "../assets/vivienda colectiva.jpg";
import existingHouse from "../assets/proyecto.webp";
import droneVideo from "../assets/la_idea_no_es_ver_el_dron_sino.mp4";

const API = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) { const error = new Error(payload?.detail || payload?.error || "La API no pudo completar la solicitud."); error.status = response.status; throw error; }
  return payload;
}

const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
const number = (value) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value || 0);

function RemodelSimulator() {
  const c = copy.ventas.simulador;
  const [form, setForm] = useState({ area_m2: 120, units: 2, tier: "standard", acquisition_cost: 0, monthly_rent_per_unit: 0, monthly_operating_expenses: 0 });
  const [result, setResult] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  async function calculate(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      setResult(await request("/api/sales/simulation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, area_m2: Number(form.area_m2), units: Number(form.units), acquisition_cost: Number(form.acquisition_cost), monthly_rent_per_unit: Number(form.monthly_rent_per_unit), monthly_operating_expenses: Number(form.monthly_operating_expenses) }) }));
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  const roi = result?.returns?.annual_roi_pct == null ? "—" : `${result.returns.annual_roi_pct}%`;
  const payback = result?.returns?.payback_years == null ? "—" : `${result.returns.payback_years} años`;
  return <section className="sales-simulator"><div className="simulator-copy"><span className="eyebrow">{c.eyebrow}</span><h2>{c.titulo_linea1}<br /><em>{c.titulo_enfasis}</em></h2><p>{c.descripcion}</p></div><form className="simulator-form" onSubmit={calculate}><label>{c.campos.area}<input name="area_m2" type="number" min="1" max="100000" value={form.area_m2} onChange={change} required /></label><label>{c.campos.unidades}<select name="units" value={form.units} onChange={change}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="6">6</option></select></label><label>{c.campos.calidad}<select name="tier" value={form.tier} onChange={change}><option value="basic">Base</option><option value="standard">Estándar</option><option value="premium">Alta</option></select></label><label>{c.campos.compra}<input name="acquisition_cost" type="number" min="0" step="1000000" value={form.acquisition_cost} onChange={change} /></label><label>{c.campos.renta}<input name="monthly_rent_per_unit" type="number" min="0" step="50000" value={form.monthly_rent_per_unit} onChange={change} /></label><label>{c.campos.gastos}<input name="monthly_operating_expenses" type="number" min="0" step="50000" value={form.monthly_operating_expenses} onChange={change} /></label><button className="button button-dark" disabled={busy}>{busy ? c.calculando : c.boton}</button>{error && <small className="simulator-error" role="status">{error}</small>}</form><div className="sales-result"><span className="eyebrow">{c.resultado_eyebrow}</span><div className="sales-kpis"><div><small>{c.kpis.inversion}</small><strong>{result ? money(result.investment.total) : "—"}</strong></div><div><small>{c.kpis.flujo}</small><strong>{result ? money(result.income.net_annual) : "—"}</strong></div><div><small>{c.kpis.roi}</small><strong>{roi}</strong></div><div><small>{c.kpis.payback}</small><strong>{payback}</strong></div></div>{result?.assumptions?.note && <small className="simulator-note">{result.assumptions.note}</small>}</div></section>;
}

function Brand({ onHome }) {
  return <button className="brand" onClick={onHome}><img src={mark} alt="" /><span>SOMA</span></button>;
}

function goTo(view, onNavigate) {
  if (view === "sales") window.history.pushState({}, "", "/ventas");
  if (view === "login") {
    window.history.pushState({}, "", "/");
    // Si la sesion sigue viva, volver del sitio publico no debe pedir login
    // otra vez: se entra directo al control room.
    if (sessionStorage.getItem("atlas_admin_token")) { onNavigate("dashboard"); return; }
  }
  onNavigate(view);
}

function Header({ view, onNavigate, onLogout }) {
  if (view === "login") return <header className="site-header auth-header"><Brand onHome={() => goTo("sales", onNavigate)} /><span className="nav-context">{copy.login.contexto}</span><button className="header-action" onClick={() => goTo("sales", onNavigate)}>{copy.nav.ver_ventas}</button></header>;
  if (view === "sales") return <><header className="site-header"><Brand onHome={() => goTo("sales", onNavigate)} /><span className="nav-context">SOMA / VENTAS</span><button className="header-action" onClick={() => goTo("login", onNavigate)}>Acceso admin ↗</button></header><RemodelSimulator /></>;
  return <header className="site-header"><Brand onHome={() => goTo("sales", onNavigate)} /><span className="nav-context">SOMA / CONTROL ROOM</span><div className="header-actions"><button className="header-sales" onClick={() => goTo("sales", onNavigate)}>Ver ventas ↗</button><button className="header-action" onClick={onLogout}>Cerrar sesión</button></div></header>;
}

function AdminLogin({ onLogin }) {
  const c = copy.login;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  async function login(event) {
    event.preventDefault();
    setMessage(c.validando);
    try {
      const data = await request("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      onLogin(data.token);
    } catch (error) { setMessage(error.message); }
  }
  return <main className="login-shell"><div className="login-rail"><span className="eyebrow">{c.eyebrow}</span><h1>{c.titulo_linea1}<br />{c.titulo_linea2} <em>{c.titulo_enfasis}</em></h1><p>{c.descripcion}</p><div className="login-sequence">{c.secuencia.map((paso) => <span key={paso.paso}><b>{paso.paso}</b>{paso.nombre}</span>)}</div></div><form className="login-card" onSubmit={login}><div className="login-card-mark"><img src={mark} alt="" /></div><span className="eyebrow">{c.area}</span><h2>{c.encabezado}</h2><p>{c.ayuda}</p><label>{c.campo_usuario}<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>{c.campo_password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="button button-dark wide" type="submit">{c.boton}</button>{message && <small className="login-message" role="status">{message}</small>}<small className="login-note">{c.nota}</small></form></main>;
}

function DashboardNav({ view, onNavigate }) {
  // Facturas (pipeline) e Inteligencia (RAG) permanecen ocultas hasta que exista
  // backend: /api/pipeline/process, /api/rag/* y /api/chat no estan implementados.
  const options = [["dashboard", "Resumen"], ["supplies", "Insumos"], ["apus", "APUs"], ["simulator", "Simulador"], ["guide", "Orientación"]];
  return <nav className="dashboard-nav" aria-label="Módulos administrativos">{options.map(([id, label]) => <button className={view === id ? "active" : ""} onClick={() => onNavigate(id)} key={id}>{label}</button>)}</nav>;
}

function ModuleHelper({ title, children }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return <button className="helper-reopen" onClick={() => setVisible(true)}>Mostrar ayuda</button>;
  return <aside className="module-helper"><div><span className="eyebrow">AYUDA RÁPIDA</span><strong>{title}</strong><p>{children}</p></div><button aria-label="Ocultar ayuda" onClick={() => setVisible(false)}>×</button></aside>;
}

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

function Dashboard({ finance, onNavigate }) {
  return <div className="panel-view dashboard-view"><div className="dashboard-intro"><div><span className="eyebrow">SOMA / LECTURA OPERATIVA</span><h1>El proyecto empieza<br />cuando aparecen<br /><em>los patrones.</em></h1></div><div className="intro-note"><span className="pulse-dot" /> <b>CONTROL ROOM ACTIVO</b><p>Los insumos, los APUs y el simulador ya operan sobre datos reales. La lectura de facturas llegará después.</p></div></div><ModuleHelper title="Estado de este resumen">Los indicadores de documentos aún no están conectados a la base: la ingesta de facturas no está implementada. Los módulos de Insumos, APUs y Simulador sí trabajan con datos reales.</ModuleHelper><div className="kpi-grid"><Kpi label="Facturas procesadas" value={number(finance?.facturas)} detail="Ingesta pendiente de implementar" accent="terra" /><Kpi label="Gasto registrado" value={money(finance?.total_pagado)} detail="Se poblará con la lectura de facturas" /><Kpi label="Proveedores" value={number(finance?.proveedores)} detail="Se poblará con la lectura de facturas" /><Kpi label="Alertas de calidad" value={number(finance?.alertas_calidad)} detail="Requieren revisión" accent={finance?.alertas_calidad ? "warning" : ""} /></div><div className="chart-grid"><MonthlyChart data={finance?.monthly} /><ProviderChart data={finance?.providers_chart} /><QualityChart finance={finance} /></div><div className="dashboard-actions"><div><span className="eyebrow">SIGUIENTE MOVIMIENTO</span><h2>Lo que ya puedes trabajar hoy.</h2><p>Normaliza el catálogo de insumos, arma los análisis de precio unitario y proyecta un cronograma con costos reales.</p></div><div className="action-stack"><button className="button button-dark" onClick={() => onNavigate("apus")}>Construir un APU ↗</button><button className="button" onClick={() => onNavigate("supplies")}>Ordenar insumos</button><button className="button" onClick={() => onNavigate("simulator")}>Simular proyecto</button></div></div></div>;
}

const SUPPLY_CATEGORIES = ["material", "mano_obra", "equipo", "transporte", "servicio_terceros"];

function Supplies({ token }) {
  const [items, setItems] = useState([]); const [search, setSearch] = useState(""); const [category, setCategory] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function load() {
    setBusy(true); setMessage("");
    try { const params = new URLSearchParams(); if (search.trim()) params.set("search", search.trim()); if (category) params.set("category", category); const data = await request(`/api/admin/supplies?${params}`, { headers: { Authorization: `Bearer ${token}` } }); setItems(data.items || []); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [category]);
  function edit(id, field, value) { setItems((current) => current.map((item) => item.insumo_id === id ? { ...item, [field]: value } : item)); }
  async function save(item) {
    setBusy(true); setMessage("");
    try { await request(`/api/admin/supplies/${item.insumo_id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ nombre_normalizado: item.nombre_normalizado, categoria: item.categoria, unidad_estandar: item.unidad_estandar || null }) }); setMessage(`Insumo ${item.insumo_id} actualizado.`); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <div className="panel-view module-view"><div className="module-heading"><span className="eyebrow">02 / CATÁLOGO</span><h1>Ordenar los<br /><em>insumos.</em></h1><p>Corrige el nombre canónico, la categoría y la unidad que usarán las facturas y los futuros APUs.</p></div><ModuleHelper title="Normalización segura">Editar un insumo no cambia las facturas originales ni sus precios históricos. Solo corrige el catálogo maestro al que apuntan sus ítems.</ModuleHelper><div className="supply-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="Buscar por nombre o alias..." aria-label="Buscar insumos" /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>{SUPPLY_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select><button className="button button-dark" onClick={load} disabled={busy}>{busy ? "Cargando…" : "Buscar"}</button></div>{message && <div className="feedback-card" role="status">{message}</div>}<section className="supplies-table-wrap"><table className="supplies-table"><thead><tr><th>Insumo normalizado</th><th>Categoría</th><th>Unidad</th><th>Precio promedio</th><th>Historial</th><th>Acción</th></tr></thead><tbody>{items.map((item) => <tr key={item.insumo_id}><td><input value={item.nombre_normalizado} onChange={(event) => edit(item.insumo_id, "nombre_normalizado", event.target.value)} aria-label={`Nombre del insumo ${item.insumo_id}`} /><small>{item.alias_count || 0} alias · {(item.aliases || []).slice(0, 2).map((alias) => alias.texto_original).join(" · ") || "sin alias"}</small></td><td><select value={item.categoria} onChange={(event) => edit(item.insumo_id, "categoria", event.target.value)} aria-label={`Categoría del insumo ${item.insumo_id}`}>{SUPPLY_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></td><td><input value={item.unidad_estandar || ""} onChange={(event) => edit(item.insumo_id, "unidad_estandar", event.target.value)} placeholder="und" aria-label={`Unidad del insumo ${item.insumo_id}`} /></td><td>{item.price_average == null ? "—" : money(item.price_average)}<small>{item.price_min == null ? "sin compras" : `${money(item.price_min)} – ${money(item.price_max)}`}</small></td><td>{item.purchase_count || 0} compras<small>{item.last_purchase || "sin fecha"}</small></td><td><button className="button" onClick={() => save(item)} disabled={busy}>Guardar</button></td></tr>)}</tbody></table>{!busy && !items.length && <p className="empty-state">No hay insumos que coincidan con la búsqueda.</p>}</section></div>;
}

function ApuBuilder({ token }) {
  const [supplies, setSupplies] = useState([]); const [apus, setApus] = useState([]); const [name, setName] = useState(""); const [unit, setUnit] = useState("und"); const [apuCategory, setApuCategory] = useState("obra_gris"); const [description, setDescription] = useState(""); const [details, setDetails] = useState([]); const [administration, setAdministration] = useState(0); const [contingencies, setContingencies] = useState(0); const [utility, setUtility] = useState(0); const [iva, setIva] = useState(0); const [ivaBase, setIvaBase] = useState("utilidad"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [preview, setPreview] = useState(null);
  async function load() { setBusy(true); try { const headers = { Authorization: `Bearer ${token}` }; const [suppliesData, apusData] = await Promise.all([request("/api/admin/supplies", { headers }), request("/api/admin/apus", { headers })]); setSupplies(suppliesData.items || []); setApus(apusData.items || []); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  useEffect(() => { load(); }, []);
  function addDetail() { const first = supplies[0]; if (first) setDetails((current) => [...current, { insumo_id: first.insumo_id, rendimiento: 1, desperdicio_pct: 0 }]); }
  function editDetail(index, field, value) { setDetails((current) => current.map((detail, currentIndex) => currentIndex === index ? { ...detail, [field]: value } : detail)); }
  function detailSupply(detail) { const supply = supplies.find((item) => item.insumo_id === Number(detail.insumo_id)); if (supply?.categoria === "mano_obra") return { ...supply, price_average: Number(localStorage.getItem("soma-labor-price")) || 0 }; return supply; }
  function detailPayload(detail) { return { insumo_id: Number(detail.insumo_id), categoria: detailSupply(detail)?.categoria || "material", rendimiento: Number(detail.rendimiento) || 0, desperdicio_pct: Number(detail.desperdicio_pct) || 0, precio_unitario: detailSupply(detail)?.categoria === "mano_obra" ? Number(localStorage.getItem("soma-labor-price")) || null : null }; }
  function detailCost(index) { return preview?.detalles?.[index]?.costo ?? 0; }
  useEffect(() => {
    if (!details.length) { setPreview(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setPreview(await request("/api/admin/apus/preview", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ nombre_partida: name || "borrador", unidad: unit || "und", categoria: apuCategory, administracion_pct: Number(administration) || 0, imprevistos_pct: Number(contingencies) || 0, utilidad_pct: Number(utility) || 0, iva_pct: Number(iva) || 0, iva_base: ivaBase, detalles: details.map(detailPayload) }) }));
      } catch (error) { if (error.name !== "AbortError") setPreview(null); }
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [details, administration, contingencies, utility, iva, ivaBase, supplies]);
  async function save() { if (!name.trim() || !unit.trim() || !details.length) { setMessage("Completa nombre, unidad y agrega al menos un insumo."); return; } setBusy(true); setMessage(""); try { const data = await request("/api/admin/apus", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ nombre_partida: name, unidad: unit, categoria: localStorage.getItem("soma-apu-category") || apuCategory, descripcion: description, administracion_pct: Number(administration), imprevistos_pct: Number(contingencies), utilidad_pct: Number(utility), iva_pct: Number(iva), iva_base: ivaBase, detalles: details.map(detailPayload) }) }); setApus((current) => [data.apu, ...current]); setName(""); setDescription(""); setDetails([]); setPreview(null); setMessage(`APU guardado: ${data.apu.nombre_partida}.`); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  // El costeo AIU lo calcula el backend (domain/costing.py). El front no lo
  // reimplementa: pide la previsualizacion y muestra lo que devuelve, de modo
  // que el precio mostrado y el guardado no puedan divergir.
  const directCost = preview?.costo_directo ?? 0; const administrationCost = preview?.administracion ?? 0; const contingencyCost = preview?.imprevistos ?? 0; const utilityCost = preview?.utilidad ?? 0; const ivaCost = preview?.iva ?? 0; const salePrice = preview?.precio_venta ?? 0;
  return <div className="panel-view module-view"><div className="module-heading"><span className="eyebrow">03 / COSTOS UNITARIOS</span><h1>Construir un<br /><em>APU.</em></h1><p>Combina insumos normalizados, rendimientos y desperdicios para obtener el costo directo de una partida.</p></div><ModuleHelper title="Costos directos y AIU">Los porcentajes se guardan con el APU. El IVA puede calcularse sobre utilidad, costo directo o subtotal según el contrato.</ModuleHelper><div className="apu-layout"><section className="tool-card apu-builder"><label>Nombre de la partida<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Instalación de piso cerámico" /></label><label>Unidad de la partida<input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="m²" /></label><label>Descripción<textarea rows="2" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Suministro e instalación..." /></label><div className="apu-percent-grid"><label>Administración %<input type="number" min="0" max="100" step="0.1" value={administration} onChange={(event) => setAdministration(event.target.value)} /></label><label>Imprevistos %<input type="number" min="0" max="100" step="0.1" value={contingencies} onChange={(event) => setContingencies(event.target.value)} /></label><label>Utilidad %<input type="number" min="0" max="100" step="0.1" value={utility} onChange={(event) => setUtility(event.target.value)} /></label><label>IVA %<input type="number" min="0" max="100" step="0.1" value={iva} onChange={(event) => setIva(event.target.value)} /></label><label>IVA sobre<select value={ivaBase} onChange={(event) => setIvaBase(event.target.value)}><option value="utilidad">Utilidad</option><option value="directo">Costo directo</option><option value="subtotal">Subtotal</option></select></label></div><div className="apu-detail-head"><span>INSUMOS DE LA PARTIDA</span><button className="button" onClick={addDetail} disabled={!supplies.length}>+ Agregar insumo</button></div>{details.map((detail, index) => { const supply = detailSupply(detail); return <div className="apu-detail-row" key={`${index}-${detail.insumo_id}`}><select value={detail.insumo_id} onChange={(event) => editDetail(index, "insumo_id", event.target.value)} aria-label="Seleccionar insumo">{supplies.map((item) => <option key={item.insumo_id} value={item.insumo_id}>{item.nombre_normalizado} · {item.unidad_estandar || "sin unidad"}</option>)}</select><input type="number" min="0.0001" step="0.01" value={detail.rendimiento} onChange={(event) => editDetail(index, "rendimiento", event.target.value)} aria-label="Rendimiento" /><input type="number" min="0" max="100" step="0.1" value={detail.desperdicio_pct} onChange={(event) => editDetail(index, "desperdicio_pct", event.target.value)} aria-label="Desperdicio porcentual" /><span>{money(supply?.price_average || 0)}</span><strong>{money(detailCost(index))}</strong><button className="apu-remove" onClick={() => setDetails((current) => current.filter((_, currentIndex) => currentIndex !== index))} aria-label="Quitar insumo">×</button></div>; })}<div className="apu-detail-labels"><span>Insumo</span><span>Rend.</span><span>Desperdicio</span><span>Precio</span><span>Costo</span></div><div className="apu-breakdown"><div><span>Costo directo</span><b>{money(directCost)}</b></div><div><span>Administración</span><b>{money(administrationCost)}</b></div><div><span>Imprevistos</span><b>{money(contingencyCost)}</b></div><div><span>Utilidad</span><b>{money(utilityCost)}</b></div><div><span>IVA</span><b>{money(ivaCost)}</b></div></div><div className="apu-total"><span>PRECIO DE VENTA ESTIMADO</span><strong>{money(salePrice)}</strong></div><button className="button button-dark" onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar APU ↗"}</button>{message && <small className="apu-message" role="status">{message}</small>}</section><section className="apu-list"><div className="chart-heading"><div><span className="eyebrow">BIBLIOTECA</span><h3>APUs guardados</h3></div><span className="chart-caption">{apus.length} PARTIDAS</span></div>{apus.map((apu) => <article className="apu-card" key={apu.apu_id}><div><span>{apu.unidad}</span><h4>{apu.nombre_partida}</h4></div><strong>{money(apu.precio_venta)}</strong><small>Directo {money(apu.costo_directo)} · {apu.detalles.length} insumo(s)</small></article>)}{!apus.length && <p className="empty-state">Todavía no hay APUs guardados.</p>}</section></div></div>;
}

function LegacyApuEditor({ token }) {
  const [apus, setApus] = useState([]); const [supplies, setSupplies] = useState([]); const [selectedId, setSelectedId] = useState(""); const [draft, setDraft] = useState(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { try { const headers = { Authorization: `Bearer ${token}` }; const [apuData, supplyData] = await Promise.all([request("/api/admin/apus", { headers }), request("/api/admin/supplies", { headers })]); setApus(apuData.items || []); setSupplies(supplyData.items || []); } catch (error) { setMessage(error.message); } }
  useEffect(() => { load(); }, []);
  function select(id) { const apu = apus.find((item) => item.apu_id === Number(id)); setSelectedId(id); setDraft(apu ? JSON.parse(JSON.stringify(apu)) : null); setMessage(""); }
  function edit(field, value) { setDraft((current) => ({ ...current, [field]: value })); }
  function editDetail(index, field, value) { setDraft((current) => ({ ...current, detalles: current.detalles.map((detail, detailIndex) => detailIndex === index ? { ...detail, [field]: value } : detail) })); }
  async function save() { if (!draft) return; setBusy(true); setMessage(""); try { const data = await request(`/api/admin/apus/${draft.apu_id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ nombre_partida: draft.nombre_partida, unidad: draft.unidad, categoria: draft.categoria || "obra_gris", descripcion: draft.descripcion || "", administracion_pct: Number(draft.administracion_pct || 0), imprevistos_pct: Number(draft.imprevistos_pct || 0), utilidad_pct: Number(draft.utilidad_pct || 0), iva_pct: Number(draft.iva_pct || 0), iva_base: draft.iva_base || "utilidad", detalles: draft.detalles.map((detail) => ({ insumo_id: Number(detail.insumo_id), categoria: supplies.find((item) => item.insumo_id === Number(detail.insumo_id))?.categoria || detail.categoria, rendimiento: Number(detail.rendimiento), desperdicio_pct: Number(detail.desperdicio_pct || 0), precio_unitario: detail.precio_manual == null ? null : Number(detail.precio_manual) })) }) }); setApus((current) => current.map((item) => item.apu_id === data.apu.apu_id ? data.apu : item)); setDraft(data.apu); setMessage("APU actualizado correctamente."); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  if (!apus.length) return <section className="apu-editor"><span className="eyebrow">BIBLIOTECA</span><p>Aun no hay APUs guardados para editar.</p></section>;
  return <section className="apu-editor"><div className="apu-editor-head"><div><span className="eyebrow">EDITAR PARTIDA</span><h2>Biblioteca de APUs</h2></div><select value={selectedId} onChange={(event) => select(event.target.value)}><option value="">Selecciona un APU...</option>{apus.map((apu) => <option key={apu.apu_id} value={apu.apu_id}>{apu.nombre_partida} · {apu.categoria}</option>)}</select></div>{draft && <div className="apu-editor-form"><div className="apu-editor-grid"><label>Nombre<input value={draft.nombre_partida} onChange={(event) => edit("nombre_partida", event.target.value)} /></label><label>Unidad<input value={draft.unidad} onChange={(event) => edit("unidad", event.target.value)} /></label><label>Categoria<select value={draft.categoria || "obra_gris"} onChange={(event) => edit("categoria", event.target.value)}><option value="excavaciones">Excavaciones</option><option value="obra_gris">Obra gris</option><option value="acabados">Acabados</option><option value="instalaciones">Instalaciones</option></select></label></div><label>Descripcion<textarea rows="2" value={draft.descripcion || ""} onChange={(event) => edit("descripcion", event.target.value)} /></label><div className="apu-editor-details"><strong>Consumos por unidad</strong>{draft.detalles.map((detail, index) => <div className="apu-editor-detail" key={detail.detalle_id || index}><span>{detail.nombre_normalizado}</span><input type="number" min="0" step="0.001" value={detail.rendimiento} onChange={(event) => editDetail(index, "rendimiento", event.target.value)} aria-label={`Rendimiento de ${detail.nombre_normalizado}`} /><input type="number" min="0" step="0.01" value={detail.precio_manual ?? ""} placeholder={detail.precio_unitario || "Precio catalogo"} onChange={(event) => editDetail(index, "precio_manual", event.target.value)} aria-label={`Precio manual de ${detail.nombre_normalizado}`} /><small>{detail.unidad_estandar || "unidad"}</small></div>)}</div><button className="button button-dark" onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar cambios"}</button></div>}{message && <small className="apu-message">{message}</small>}</section>;
}

function Apus({ token }) {
  const [category, setCategory] = useState(localStorage.getItem("soma-apu-category") || "obra_gris");
  function changeCategory(event) {
    const value = event.target.value;
    setCategory(value);
    localStorage.setItem("soma-apu-category", value);
  }
  const laborPrice = localStorage.getItem("soma-labor-price") || "269231";
  return <div><section className="apu-category-bar"><div><span className="eyebrow">BIBLIOTECA DE APUs</span><strong>Organiza tus partidas por sistema constructivo</strong></div><label>Categoría activa<select value={category} onChange={changeCategory}><option value="excavaciones">Excavaciones</option><option value="obra_gris">Obra gris</option><option value="acabados">Acabados</option><option value="instalaciones">Instalaciones</option></select></label><label>Jornada mano de obra<input type="number" defaultValue={laborPrice} onChange={(event) => localStorage.setItem("soma-labor-price", event.target.value)} /></label></section><ApuBuilder token={token} /><ApuEditor token={token} /></div>;
}

function PlanCard({ plan }) {
  if (!plan) return null;
  return <article className="plan-card"><div className="plan-card-head"><span className="eyebrow">PLAN ESTRUCTURADO / AG-UI</span><span className="plan-badge">BORRADOR</span></div><h3>{plan.title}</h3><p>{plan.summary}</p><div className="plan-inputs"><span><b>{plan.inputs?.area_m2}</b> m²</span><span><b>{plan.inputs?.units}</b> unidades</span><span><b>{plan.inputs?.budget}</b> presupuesto</span></div><div className="plan-phases">{plan.phases?.map((phase, index) => <div className="plan-phase" key={phase.name}><span>0{index + 1}</span><div><b>{phase.name}</b><small>{phase.duration} · {phase.share}</small><p>{phase.deliverable}</p></div></div>)}</div><div className="plan-columns"><div><b>PRÓXIMOS PASOS</b><ul>{plan.next_steps?.map((step) => <li key={step}>{step}</li>)}</ul></div><div><b>RIESGOS A VALIDAR</b><ul>{plan.risks?.map((risk) => <li key={risk}>{risk}</li>)}</ul></div></div><small className="plan-note">{plan.budget?.note}</small></article>;
}

function AdvisorWidget({ token }) {
  const c = copy.asesor;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: c.bienvenida }]);
  const [plan, setPlan] = useState(null); const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const [chatError, setChatError] = useState("");
  const threadRef = useRef(null);
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [messages, open]);
  async function send(text = input) {
    const message = text.trim(); if (!message || busy) return;
    const history = [...messages, { role: "user", content: message }]; const assistantIndex = history.length;
    setMessages([...history, { role: "assistant", content: "" }]); setInput(""); setBusy(true); setPlan(null); setChatError("");
    try {
      const response = await fetch(`${API}/api/agui/architect`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ threadId: crypto.randomUUID(), runId: crypto.randomUUID(), state: {}, messages: history.map((item, index) => ({ id: `msg-${index}`, role: item.role, content: item.content })), tools: [], context: [], forwardedProps: {} }) });
      if (!response.ok) { const detail = await response.text(); throw new Error(detail || `El asesor respondió ${response.status}.`); }
      if (!response.body) throw new Error("El navegador no pudo abrir el stream del asesor.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      const handleEvent = (rawEvent) => { const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:")); if (!dataLine) return; const event = JSON.parse(dataLine.slice(5).trim()); if (event.type === "TEXT_MESSAGE_CONTENT") setMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, content: `${item.content}${event.delta || ""}` } : item)); if (event.type === "CUSTOM" && event.name === "architecture_plan") setPlan(event.value); if (event.type === "RUN_ERROR") throw new Error(event.message || "El asesor no devolvió una respuesta."); };
      while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done }); const events = buffer.split("\n\n"); buffer = events.pop() || ""; events.filter(Boolean).forEach(handleEvent); if (done) break; }
      if (buffer.trim()) handleEvent(buffer);
    } catch (error) { const detail = error.message || "No se pudo conectar con el backend."; setChatError(detail); setMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, content: `${c.error_prefijo} ${detail}` } : item)); } finally { setBusy(false); }
  }
  function reset() { setMessages([{ role: "assistant", content: c.bienvenida }]); setPlan(null); setChatError(""); setInput(""); }
  if (!open) return <button className="advisor-bubble" onClick={() => setOpen(true)} aria-label={c.burbuja_abrir}><svg className="advisor-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.8-.8L3 21l1.9-5.4a8 8 0 0 1-1-3.9A8.4 8.4 0 0 1 12.4 3 8.4 8.4 0 0 1 21 11.5Z" /></svg>{c.burbuja_abrir}</button>;
  return <aside className="advisor-panel" role="dialog" aria-label={c.titulo}>
    <header className="advisor-head"><div><strong>{c.titulo}</strong><small>{c.subtitulo}</small></div><span className={busy ? "advisor-state busy" : "advisor-state"}>{busy ? c.estado_ocupado : c.estado_activo}</span><button className="advisor-reset" onClick={reset} disabled={busy || messages.length <= 1} title={c.reiniciar} aria-label={c.reiniciar}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg></button><button className="advisor-close" onClick={() => setOpen(false)} aria-label={c.burbuja_cerrar}>×</button></header>
    <div className="advisor-thread" ref={threadRef}>{messages.map((message, index) => <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>{message.content || <span className="typing">···</span>}</div>)}<PlanCard plan={plan} /></div>
    {messages.length <= 1 && <div className="advisor-suggestions">{c.sugerencias.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}
    <form className="advisor-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={c.placeholder} aria-label={c.placeholder} /><button className="button button-dark" disabled={busy}>{c.enviar}</button></form>
    {chatError && <small className="advisor-error" role="status">{chatError}</small>}
  </aside>;
}


function SalesPage() {
  const c = copy.ventas;
  return <main className="sales-page"><div className="sales-background" style={{ backgroundImage: `url("${collectiveHousing}")` }} aria-hidden="true" /><section className="sales-hero"><div><span className="eyebrow">{c.hero.eyebrow}</span><h1>{c.hero.titulo_linea1}<br />{c.hero.titulo_linea2}<br />{c.hero.titulo_linea3} <em>{c.hero.titulo_enfasis}</em></h1><p>{c.hero.descripcion}</p><div className="sales-proof">{c.hero.pasos.map((paso) => <span key={paso.paso}><b>{paso.paso}</b>{paso.nombre}</span>)}</div></div><div className="sales-visual"><div><span>SOMA / CASA 01</span><span>PRIMERA LECTURA</span></div><div className="sales-visual-house"><i /><i /><i /></div><small>Una casa existente también puede tener otra vida.</small></div></section><section className="sales-film"><video autoPlay muted loop playsInline preload="metadata" aria-label="Recorrido aéreo de un proyecto de vivienda"><source src={droneVideo} type="video/mp4" /></video><div className="film-caption"><span className="eyebrow">{c.film.eyebrow}</span><strong>{c.film.titulo_linea1}<br />{c.film.titulo_linea2}</strong></div></section><section className="sales-existing"><div><span className="eyebrow">{c.existente.eyebrow}</span><h2>{c.existente.titulo_linea1}<br /><em>{c.existente.titulo_enfasis}</em></h2><p>{c.existente.descripcion}</p></div><figure><img src={existingHouse} alt="Infografía de una casa unifamiliar existente y sus posibilidades de transformación" /><figcaption>{c.existente.pie}</figcaption></figure></section></main>;
}

function Guide() {
  const c = copy.orientacion;
  return <div className="panel-view module-view guide-view"><div className="module-heading"><span className="eyebrow">{c.eyebrow}</span><h1>{c.titulo_linea1}<br />{c.titulo_linea2} <em>{c.titulo_enfasis}</em></h1><p>{c.intro}</p></div><div className="guide-grid">{c.pasos.map((paso) => <article key={paso.eyebrow}><span>{paso.eyebrow}</span><h2>{paso.titulo}</h2><p>{paso.texto}</p><small>{paso.nota}</small></article>)}</div><div className="story-callout"><div><span className="eyebrow">{c.cierre_eyebrow}</span><h2>{c.cierre_titulo_linea1}<br />{c.cierre_titulo_linea2}</h2></div><p>{c.cierre_texto}</p></div></div>;
}

function ActivityLog({ log }) {
  if (!log) return null;
  if (typeof log === "string") return <div className="activity-log error-state"><span className="eyebrow">ACTIVIDAD</span><p>{log}</p></div>;
  return <div className="activity-log"><span className="eyebrow">ÚLTIMA ACTIVIDAD</span><p>{log.rag_index ? `Índice Chroma actualizado con ${log.rag_index.indexed || 0} documento(s).` : log.mode === "auto" ? `${log.results?.length || 0} documento(s) procesado(s) y auditado(s).` : "Operación completada."}</p><small>Los detalles completos quedan visibles en cada módulo.</small></div>;
}

// Deriva la vista desde la URL. Es la unica fuente de verdad de la navegacion,
// para que el boton Atras del navegador y los botones de la app coincidan.
function viewForPath(pathname, hasSession) {
  if (pathname === "/ventas" || pathname === "/soma") return "sales";
  return hasSession ? "dashboard" : "login";
}

function App() {
  const [token, setToken] = useState(sessionStorage.getItem("atlas_admin_token") || "");
  const [view, setView] = useState(() => viewForPath(window.location.pathname, Boolean(sessionStorage.getItem("atlas_admin_token"))));
  const [finance, setFinance] = useState(null); const [log, setLog] = useState(null);
  async function loadFinance(currentToken = token) { if (!currentToken) return; try { setFinance(await request("/api/admin/summary", { headers: { Authorization: `Bearer ${currentToken}` } })); } catch (error) { if (error.status === 401) { logout(); return; } setLog(`No se pudo cargar el dashboard: ${error.message}`); } }
  function login(newToken) { setToken(newToken); sessionStorage.setItem("atlas_admin_token", newToken); window.history.pushState({}, "", "/"); setView("dashboard"); loadFinance(newToken); }
  function logout() { setToken(""); sessionStorage.removeItem("atlas_admin_token"); setFinance(null); window.history.pushState({}, "", "/"); setView("login"); }
  useEffect(() => { if (token) loadFinance(); }, []);
  // Sin esto, Atras/Adelante cambian la URL pero no la vista: la app parece
  // congelada. El estado del historial manda sobre el estado local.
  useEffect(() => {
    function onPopState() { setView(viewForPath(window.location.pathname, Boolean(sessionStorage.getItem("atlas_admin_token")))); }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  return <div className="app-shell"><Header view={view} onNavigate={setView} onLogout={logout} />{view === "login" ? <AdminLogin onLogin={login} /> : view === "sales" ? <SalesPage /> : <main className="workspace"><DashboardNav view={view} onNavigate={setView} /><section className="workspace-content">{view === "dashboard" && <Dashboard finance={finance} onNavigate={setView} />}{view === "supplies" && <Supplies token={token} />}{view === "apus" && <Apus token={token} />}{view === "simulator" && <ProjectSimulator token={token} />}{view === "guide" && <Guide />}<ActivityLog log={log} /></section></main>}{view !== "login" && <AdvisorWidget token={token} />}</div>;
}

export default App;
