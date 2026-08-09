import { useEffect, useState } from "react";
import mark from "./assets/soma-mark.svg";
import collectiveHousing from "../assets/vivienda colectiva.jpg";
import existingHouse from "../assets/proyecto.webp";
import droneVideo from "../assets/la_idea_no_es_ver_el_dron_sino.mp4";

const API = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) throw new Error(payload?.detail || payload?.error || "La API no pudo completar la solicitud.");
  return payload;
}

const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
const number = (value) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value || 0);

function RemodelSimulator() {
  const [form, setForm] = useState({ area_m2: 120, units: 2, tier: "standard", acquisition_cost: 0, monthly_rent_per_unit: 0, monthly_operating_expenses: 0 });
  const [result, setResult] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  async function calculate(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = await request("/api/sales/simulation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, area_m2: Number(form.area_m2), units: Number(form.units), acquisition_cost: Number(form.acquisition_cost), monthly_rent_per_unit: Number(form.monthly_rent_per_unit), monthly_operating_expenses: Number(form.monthly_operating_expenses) }) });
      setResult(data);
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  const roi = result?.returns?.annual_roi_pct == null ? "—" : `${result.returns.annual_roi_pct}%`;
  const payback = result?.returns?.payback_years == null ? "—" : `${result.returns.payback_years} años`;
  return <section className="sales-simulator"><div className="simulator-copy"><span className="eyebrow">SOMA / PRIMERA CUENTA</span><h2>¿Qué podría sostener<br /><em>la transformación?</em></h2><p>Una simulación rápida para comparar área, unidades, costo de obra y renta. No es un avalúo ni una promesa de rentabilidad: es el punto de partida para hacer mejores preguntas.</p><small>Los costos por m² y porcentajes viven en `api/src/soma_api/data/remodeling.yml`.</small></div><form className="simulator-form" onSubmit={calculate}><label>Área a intervenir (m²)<input name="area_m2" type="number" min="1" max="100000" value={form.area_m2} onChange={change} required /></label><label>Unidades<select name="units" value={form.units} onChange={change}><option value="1">1 unidad</option><option value="2">2 unidades</option><option value="3">3 unidades</option><option value="4">4 unidades</option><option value="6">6 unidades</option></select></label><label>Calidad de obra<select name="tier" value={form.tier} onChange={change}><option value="basic">Base</option><option value="standard">Estándar</option><option value="premium">Alta</option></select></label><label>Compra del inmueble (COP)<input name="acquisition_cost" type="number" min="0" step="1000000" value={form.acquisition_cost} onChange={change} /></label><label>Renta mensual por unidad (COP)<input name="monthly_rent_per_unit" type="number" min="0" step="50000" value={form.monthly_rent_per_unit} onChange={change} /></label><label>Gastos mensuales (COP)<input name="monthly_operating_expenses" type="number" min="0" step="50000" value={form.monthly_operating_expenses} onChange={change} /></label><button className="button button-dark" disabled={busy}>{busy ? "Calculando…" : "Ver escenario ↗"}</button>{error && <small className="simulator-error" role="status">{error}</small>}</form><div className="simulator-result"><span className="eyebrow">ESCENARIO PRELIMINAR</span><div className="simulator-kpis"><div><small>Inversión total</small><strong>{result ? money(result.investment.total) : "—"}</strong></div><div><small>Flujo neto anual</small><strong>{result ? money(result.income.net_annual) : "—"}</strong></div><div><small>ROI anual</small><strong>{roi}</strong></div><div><small>Payback</small><strong>{payback}</strong></div></div>{result && <small className="simulator-note">{result.assumptions.note} Ocupación asumida: {Math.round(result.income.occupancy_rate * 100)}%.</small>}</div></section>;
}

function Brand({ onHome }) {
  return <button className="brand" onClick={onHome}><img src={mark} alt="" /><span>SOMA</span></button>;
}

function goTo(view, onNavigate) {
  if (view === "sales") window.history.pushState({}, "", "/ventas");
  if (view === "login") window.history.pushState({}, "", "/");
  onNavigate(view);
}

function Header({ view, onNavigate, onLogout }) {
  if (view === "login") return <header className="site-header auth-header"><Brand onHome={() => {}} /><span className="nav-context">ACCESO ADMINISTRATIVO / LOCAL</span></header>;
  if (view === "sales") return <><header className="site-header"><Brand onHome={() => goTo("sales", onNavigate)} /><span className="nav-context">SOMA / VENTAS</span><button className="header-action" onClick={() => goTo("login", onNavigate)}>Acceso admin ↗</button></header><RemodelSimulator /></>;
  return <header className="site-header"><Brand onHome={() => goTo("sales", onNavigate)} /><span className="nav-context">SOMA / CONTROL ROOM</span><div className="header-actions"><button className="header-sales" onClick={() => goTo("sales", onNavigate)}>Ver ventas ↗</button><button className="header-action" onClick={onLogout}>Cerrar sesión</button></div></header>;
}

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  async function login(event) {
    event.preventDefault();
    setMessage("Validando acceso...");
    try {
      const data = await request("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      onLogin(data.token);
    } catch (error) { setMessage(error.message); }
  }
  return <main className="login-shell"><div className="login-rail"><span className="eyebrow">SOMA / CONTROL ROOM</span><h1>De la factura<br />al <em>criterio.</em></h1><p>Cada documento trae una señal: un costo, un proveedor, una decisión pendiente. Entra para convertir ese ruido en una lectura operativa.</p><div className="login-sequence"><span><b>01</b>Importar</span><span><b>02</b>Entender</span><span><b>03</b>Decidir</span></div></div><form className="login-card" onSubmit={login}><div className="login-card-mark"><img src={mark} alt="" /></div><span className="eyebrow">ÁREA RESTRINGIDA</span><h2>Iniciar sesión</h2><p>El dashboard, las facturas y el asesor RAG están protegidos.</p><label>Usuario<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="button button-dark wide" type="submit">Entrar al control room ↗</button>{message && <small className="login-message" role="status">{message}</small>}<small className="login-note">La contraseña se valida contra el hash almacenado en SQLite.</small></form></main>;
}

function DashboardNav({ view, onNavigate }) {
  const options = [["dashboard", "Resumen"], ["pipeline", "Facturas"], ["rag", "Inteligencia"], ["guide", "Orientación"]];
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

function Dashboard({ finance, onNavigate, onDownload }) {
  return <div className="panel-view dashboard-view"><div className="dashboard-intro"><div><span className="eyebrow">SOMA / LECTURA OPERATIVA</span><h1>El proyecto empieza<br />cuando aparecen<br /><em>los patrones.</em></h1></div><div className="intro-note"><span className="pulse-dot" /> <b>CONTROL ROOM ACTIVO</b><p>Las facturas dejan de ser archivos sueltos. Aquí se convierten en proveedores, tendencias y preguntas mejores.</p></div></div><ModuleHelper title="Cómo leer este resumen">Este tablero cuenta la historia de tus documentos: cuánto llegó, quién concentra el gasto y qué tan completa fue la extracción. Usa las gráficas para decidir qué revisar después.</ModuleHelper><div className="kpi-grid"><Kpi label="Facturas procesadas" value={number(finance?.facturas)} detail={`${number(finance?.items)} ítems normalizados`} accent="terra" /><Kpi label="Gasto registrado" value={money(finance?.total_pagado)} detail="Total pagado en SQLite" /><Kpi label="Proveedores" value={number(finance?.proveedores)} detail={`${number(finance?.chroma_count)} documentos en Chroma`} /><Kpi label="Alertas de calidad" value={number(finance?.alertas_calidad)} detail="Requieren revisión" accent={finance?.alertas_calidad ? "warning" : ""} /></div><div className="chart-grid"><MonthlyChart data={finance?.monthly} /><ProviderChart data={finance?.providers_chart} /><QualityChart finance={finance} /></div><div className="dashboard-actions"><div><span className="eyebrow">SIGUIENTE MOVIMIENTO</span><h2>Una lectura útil necesita una acción.</h2><p>Importa nuevos documentos, consulta el contexto o revisa cómo funciona el flujo antes de tomar una decisión.</p></div><div className="action-stack"><button className="button button-dark" onClick={() => onNavigate("pipeline")}>Procesar facturas ↗</button><button className="button" onClick={() => onNavigate("rag")}>Abrir asesor RAG</button><button className="button" onClick={onDownload}>Descargar Excel</button></div></div></div>;
}

function ProcessingReport({ report }) {
  if (!report) return null;
  if (typeof report === "string") return <div className="feedback-card error-state">{report}</div>;
  const results = report.results || [];
  const errors = results.filter((item) => item.status === "error").length;
  return <section className="processing-report"><div className="report-head"><div><span className="eyebrow">PRUEBA DE EXTRACCIÓN</span><h3>{report.processed || results.length} documento(s) revisado(s)</h3></div><span className={errors ? "report-status warning" : "report-status"}>{errors ? `${errors} requiere(n) atención` : "lectura completa"}</span></div><div className="document-results">{results.map((item) => <article className={`document-result ${item.status}`} key={`${item.file}-${item.invoice || item.status}`}><div className="document-icon">{item.status === "processed" ? "✓" : item.status === "skipped" ? "↺" : "!"}</div><div className="document-peek"><span>LECTURA</span><b>{item.invoice || "—"}</b><small>{item.total ? money(item.total) : "sin total"}</small></div><div className="document-main"><strong>{item.file}</strong><span>{item.provider || (item.status === "error" ? "Proveedor no identificado" : "Documento omitido")}</span>{item.status === "error" ? <p>{item.error}</p> : <p>{item.invoice || "Sin número"} · {item.items || 0} ítem(s) · {item.total ? money(item.total) : "sin total"}</p>}{item.diagnostics && <small>{item.diagnostics.status === "ok" ? "Campos clave capturados." : item.diagnostics.status === "failed" ? item.diagnostics.next_step : `Revisar: ${(item.diagnostics.missing_fields || []).join(", ") || "sin alertas"}.`}</small>}</div></article>)}</div>{report.rag_index && <div className="index-result"><span className="pulse-dot" /> Chroma actualizado: <b>{report.rag_index.indexed ?? report.rag_index.count ?? 0} documento(s)</b></div>}</section>;
}

function Pipeline({ writeLog, token }) {
  const [files, setFiles] = useState([]); const [mode, setMode] = useState("preview"); const [busy, setBusy] = useState(false); const [report, setReport] = useState(null);
  async function process() { if (!files.length) { setReport("Selecciona uno o varios PDFs."); return; } setBusy(true); setReport(null); const body = new FormData(); body.append("mode", mode); files.forEach((file) => body.append("files", file)); try { const data = await request("/api/pipeline/process", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body }); setReport(data); writeLog(data); } catch (error) { setReport(`Error: ${error.message}`); } finally { setBusy(false); } }
  return <div className="panel-view module-view"><div className="module-heading"><span className="eyebrow">01 / DOCUMENTOS</span><h1>Traer el archivo<br /><em>a la conversación.</em></h1><p>Sube las facturas, observa qué información pudo leer SOMA y decide si el documento está listo para alimentar cifras y consultas.</p></div><ModuleHelper title="Importar una factura">Primero prueba con “Previsualizar”. Cuando los campos estén claros, usa “Procesar, guardar y actualizar RAG”: guarda en SQLite y reconstruye automáticamente la memoria semántica.</ModuleHelper><div className="upload-card"><label className="drop-zone"><span className="upload-mark">＋</span><strong>Arrastra tus PDFs aquí</strong><small>o selecciónalos desde tu equipo · solo PDF</small><input type="file" accept=".pdf,application/pdf" multiple onChange={(event) => setFiles([...event.target.files])} /></label><div className="upload-controls"><label>Modo<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="preview">Previsualizar sin guardar</option><option value="auto">Procesar, guardar y actualizar RAG</option></select></label><button className="button button-dark" disabled={busy} onClick={process}>{busy ? "Leyendo documentos…" : "Ejecutar lectura ↗"}</button></div><div className="file-count">{files.length ? `${files.length} archivo(s) listo(s) para revisar` : "Aún no hay documentos en la mesa"}</div></div><ProcessingReport report={report} /></div>;
}

function PlanCard({ plan }) {
  if (!plan) return null;
  return <article className="plan-card"><div className="plan-card-head"><span className="eyebrow">PLAN ESTRUCTURADO / AG-UI</span><span className="plan-badge">BORRADOR</span></div><h3>{plan.title}</h3><p>{plan.summary}</p><div className="plan-inputs"><span><b>{plan.inputs?.area_m2}</b> m²</span><span><b>{plan.inputs?.units}</b> unidades</span><span><b>{plan.inputs?.budget}</b> presupuesto</span></div><div className="plan-phases">{plan.phases?.map((phase, index) => <div className="plan-phase" key={phase.name}><span>0{index + 1}</span><div><b>{phase.name}</b><small>{phase.duration} · {phase.share}</small><p>{phase.deliverable}</p></div></div>)}</div><div className="plan-columns"><div><b>PRÓXIMOS PASOS</b><ul>{plan.next_steps?.map((step) => <li key={step}>{step}</li>)}</ul></div><div><b>RIESGOS A VALIDAR</b><ul>{plan.risks?.map((risk) => <li key={risk}>{risk}</li>)}</ul></div></div><small className="plan-note">{plan.budget?.note}</small></article>;
}

function SalesChat({ token, publicMode = false }) {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Soy el asesor de SOMA. Cuéntame qué casa tienes o qué tipo de vivienda multifamiliar quieres estudiar." }]);
  const [plan, setPlan] = useState(null); const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const [chatError, setChatError] = useState("");
  const suggestions = publicMode ? ["Quiero convertir una casa de 180 m² en 3 apartamentos", "¿Cómo se arma el presupuesto de una remodelación?", "Tengo una casa y quiero estudiar su potencial"] : ["Quiero convertir una casa de 180 m² en 3 apartamentos", "¿Cómo se arma el presupuesto de una remodelación?", "¿Qué proveedor concentra el gasto de las facturas?"];
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
    } catch (error) { const detail = error.message || "No se pudo conectar con el backend."; setChatError(detail); setMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, content: `No pude completar la asesoría: ${detail}` } : item)); } finally { setBusy(false); }
  }
  return <div className="sales-chat"><div className="chat-head"><div><span className="eyebrow">SOMA / {publicMode ? "IA EN VIVO" : "IA + RAG"}</span><h3>{publicMode ? "Planifica con un asesor" : "Preguntar antes de decidir"}</h3></div><span className={busy ? "chat-live busy" : "chat-live"}>{busy ? "analizando" : "en línea"}</span></div><p className="chat-context-note">{publicMode ? "Una primera orientación para entender si tu inmueble merece un estudio." : "El asesor combina tu pregunta arquitectónica con el contexto de facturas que vive en Chroma."}</p><div className="chat-suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => send(suggestion)}>{suggestion}</button>)}</div><div className="chat-thread">{messages.map((message, index) => { const welcome = index === 0 && message.role === "assistant"; return <div className={`chat-bubble ${message.role}${welcome ? " welcome-message" : ""}`} key={`${message.role}-${index}`}>{welcome && <span className="chat-bubble-label">ASESOR SOMA / IA</span>}{message.content || <span className="typing">···</span>}</div>; })}</div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pregunta por costos, proveedores o arquitectura..." /><button className="button button-dark" disabled={busy}>Enviar ↗</button></form>{chatError && <small className="chat-debug" role="status">DEBUG / {chatError}</small>}<PlanCard plan={plan} /></div>;
}

function SalesPage() {
  return <main className="sales-page"><div className="sales-background" style={{ backgroundImage: `url("${collectiveHousing}")` }} aria-hidden="true" /><section className="sales-hero"><div><span className="eyebrow">SOMA / VIVIENDA MULTIFAMILIAR</span><h1>Una casa.<br />Varias formas<br />de <em>vivirla.</em></h1><p>Antes de comprar o transformar, entiende el potencial del inmueble. SOMA ordena arquitectura, números y decisiones en una primera conversación.</p><div className="sales-proof"><span><b>01</b>Leer la casa</span><span><b>02</b>Proyectar escenarios</span><span><b>03</b>Decidir con criterio</span></div></div><div className="sales-visual"><div><span>SOMA / CASA 01</span><span>PRIMERA LECTURA</span></div><div className="sales-visual-house"><i /><i /><i /></div><small>Una casa existente también puede tener otra vida.</small></div></section><section className="sales-film"><video autoPlay muted loop playsInline preload="metadata" aria-label="Recorrido aéreo de un proyecto de vivienda"><source src={droneVideo} type="video/mp4" /></video><div className="film-caption"><span className="eyebrow">SOMA / CONTEXTO</span><strong>La idea no es ver el dron.<br />Es ver lo que puede llegar a ser.</strong></div></section><section className="sales-existing"><div><span className="eyebrow">FASE 1 / CASA EXISTENTE</span><h2>Lo que ya tienes<br /><em>también funciona.</em></h2><p>Antes de imaginar una transformación, leemos la base: estructura, distribución, iluminación, jardín y posibilidades reales de adaptación.</p></div><figure><img src={existingHouse} alt="Infografía de una casa unifamiliar existente y sus posibilidades de transformación" /><figcaption>Vista de lectura inicial · casa unifamiliar en Bogotá</figcaption></figure></section><section className="sales-chat-section"><div><span className="eyebrow">ASESORÍA EN TIEMPO REAL</span><h2>La primera conversación<br />antes de la primera obra.</h2><p>Cuéntale al asesor qué tienes, dónde está y qué quieres conseguir. La respuesta es preliminar, pero ayuda a formular la pregunta correcta.</p></div><SalesChat publicMode /></section><section className="sales-story"><span className="eyebrow">LA IDEA SOMA</span><h2>No vendemos metros.<br /><em>Vendemos posibilidades.</em></h2><p>Una transformación empieza con una lectura: ubicación, estructura, accesos, redes, norma y una pregunta honesta sobre lo que se puede sostener.</p></section></main>;
}

function RagResult({ answer }) {
  if (!answer) return null;
  return <section className="rag-result"><div className="result-heading"><div><span className="eyebrow">LECTURA DEL MODELO</span><h3>Una respuesta con trazabilidad</h3></div><span className="result-mode">{answer.mode}</span></div><p className="answer-copy">{answer.answer || "Sin respuesta."}</p><div className="source-strip"><b>{answer.results?.length || 0}</b><span>documentos recuperados desde Chroma</span>{answer.results?.slice(0, 3).map((item) => <small key={item.metadata?.numero_factura}>{item.metadata?.proveedor || "Proveedor"} · {item.metadata?.numero_factura || "sin número"}</small>)}</div></section>;
}

function Rag({ writeLog, token }) {
  const [provider, setProvider] = useState("local"); const [generation, setGeneration] = useState("opencode-go"); const [query, setQuery] = useState(""); const [answer, setAnswer] = useState(null); const [busy, setBusy] = useState(false);
  const headers = { Authorization: `Bearer ${token}` };
  async function index() { setBusy(true); try { writeLog(await request("/api/rag/index", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ provider, model: "gemini-embedding-2-preview", dimension: 768, reset: true }) })); } catch (error) { writeLog(`Error: ${error.message}`); } finally { setBusy(false); } }
  async function ask() { if (!query.trim()) return; setBusy(true); try { const path = generation === "local" ? "/api/rag/query" : "/api/chat"; const body = generation === "local" ? { query, provider, model: "gemini-embedding-2-preview", dimension: 768, n_results: 5, answer: false } : { message: query, provider, model: "gemini-embedding-2-preview", n_results: 5, generation_provider: generation, history: [] }; setAnswer(await request(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })); } catch (error) { writeLog(`Error: ${error.message}`); } finally { setBusy(false); } }
  return <div className="panel-view module-view"><div className="module-heading compact"><span className="eyebrow">02 / INTELIGENCIA</span><h1>Preguntar con<br /><em>memoria.</em></h1><p>Chroma recupera documentos similares y DeepSeek redacta una respuesta trazable. El índice no reemplaza SQLite: lo ayuda a encontrar el contexto.</p></div><ModuleHelper title="Qué hace el RAG">Chroma encuentra las facturas más parecidas a tu pregunta. DeepSeek redacta la respuesta, pero las cifras definitivas siguen viviendo en SQLite y en el Excel financiero.</ModuleHelper><div className="rag-layout"><div className="tool-card rag-controls"><label>Embeddings<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="local">Local Chroma / MiniLM</option><option value="google">Google Gemini Embedding 2</option></select></label><label>Respuesta<select value={generation} onChange={(event) => setGeneration(event.target.value)}><option value="opencode-go">OpenCode Go / DeepSeek V4 Pro</option><option value="gemini">Google Gemini</option><option value="local">Solo recuperación local</option></select></label><button className="button" disabled={busy} onClick={index}>Reconstruir índice</button><textarea rows="4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="¿Qué proveedor concentra el gasto?" /><button className="button button-dark" disabled={busy} onClick={ask}>{busy ? "Consultando…" : "Consultar contexto ↗"}</button></div><RagResult answer={answer} /></div><SalesChat token={token} /></div>;
}

function Guide() {
  return <div className="panel-view module-view guide-view"><div className="module-heading"><span className="eyebrow">03 / ORIENTACIÓN</span><h1>Una guía para<br /><em>leer mejor.</em></h1><p>SOMA conecta tres momentos: importar el documento, construir memoria semántica y convertirla en una decisión que alguien pueda discutir.</p></div><div className="guide-grid"><article><span>01 / IMPORTAR</span><h2>Del PDF al registro</h2><p>En <b>Facturas</b> sube uno o varios documentos. Previsualiza primero para ver qué leyó el extractor. Usa “Procesar, guardar y actualizar RAG” cuando quieras llevar las cifras a SQLite.</p><small>Si un archivo falla, no se descarta en silencio: verás el nombre, el error, la información ausente y el siguiente paso.</small></article><article><span>02 / RECORDAR</span><h2>De registro a contexto</h2><p>Chroma guarda una representación semántica de las facturas. Sirve para encontrar documentos parecidos y responder preguntas como “¿qué proveedor concentra el gasto?”</p><small>SQLite conserva la fuente de verdad numérica; Chroma es la memoria para recuperar contexto.</small></article><article><span>03 / PREGUNTAR</span><h2>Del contexto al criterio</h2><p>En <b>Inteligencia</b> puedes consultar el índice local o pedir a DeepSeek que redacte una respuesta. El asesor arquitectónico usa el contexto disponible, pero declara supuestos y no inventa permisos ni rentabilidad.</p><small>Una buena pregunta incluye ciudad, área, unidades, objetivo y presupuesto aproximado.</small></article></div><div className="story-callout"><div><span className="eyebrow">LA SECUENCIA SOMA</span><h2>Un archivo no es una decisión.<br />La lectura es el puente.</h2></div><p>Primero vemos qué llegó. Después entendemos qué significa. Solo entonces tiene sentido decidir si conviene comprar, transformar, presupuestar o detenerse.</p></div></div>;
}

function ActivityLog({ log }) {
  if (!log) return null;
  if (typeof log === "string") return <div className="activity-log error-state"><span className="eyebrow">ACTIVIDAD</span><p>{log}</p></div>;
  return <div className="activity-log"><span className="eyebrow">ÚLTIMA ACTIVIDAD</span><p>{log.rag_index ? `Índice Chroma actualizado con ${log.rag_index.indexed || 0} documento(s).` : log.mode === "auto" ? `${log.results?.length || 0} documento(s) procesado(s) y auditado(s).` : "Operación completada."}</p><small>Los detalles completos quedan visibles en cada módulo.</small></div>;
}

function App() {
  const [token, setToken] = useState(sessionStorage.getItem("atlas_admin_token") || "");
  const publicSales = window.location.pathname === "/ventas" || window.location.pathname === "/soma";
  const [view, setView] = useState(publicSales ? "sales" : token ? "dashboard" : "login");
  const [finance, setFinance] = useState(null); const [log, setLog] = useState(null);
  async function loadFinance(currentToken = token) { if (!currentToken) return; try { setFinance(await request("/api/admin/summary", { headers: { Authorization: `Bearer ${currentToken}` } })); } catch (error) { setLog(`No se pudo cargar el dashboard: ${error.message}`); } }
  function login(newToken) { setToken(newToken); sessionStorage.setItem("atlas_admin_token", newToken); setView("dashboard"); loadFinance(newToken); }
  function logout() { setToken(""); sessionStorage.removeItem("atlas_admin_token"); setFinance(null); setView("login"); }
  async function download() { try { const blob = await request("/api/report/excel", { headers: { Authorization: `Bearer ${token}` } }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "dashboard_financiero.xlsx"; link.click(); URL.revokeObjectURL(url); } catch (error) { setLog(`Error al descargar: ${error.message}`); } }
  useEffect(() => { if (token) loadFinance(); }, []);
  return <div className="app-shell"><Header view={view} onNavigate={setView} onLogout={logout} />{view === "login" ? <AdminLogin onLogin={login} /> : view === "sales" ? <SalesPage /> : <main className="workspace"><DashboardNav view={view} onNavigate={setView} /><section className="workspace-content">{view === "dashboard" && <Dashboard finance={finance} onNavigate={setView} onDownload={download} />}{view === "pipeline" && <Pipeline writeLog={setLog} token={token} />}{view === "rag" && <Rag writeLog={setLog} token={token} />}{view === "guide" && <Guide />}<ActivityLog log={log} /></section></main>}</div>;
}

export default App;
