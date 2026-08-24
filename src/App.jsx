import { useEffect, useState } from "react";
import mark from "./assets/soma-mark.svg";
import collectiveHousing from "../assets/vivienda colectiva.jpg";
import existingHouse from "../assets/proyecto.webp";
import droneVideo from "../assets/la_idea_no_es_ver_el_dron_sino.mp4";

const API = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.detail || "La API no pudo completar la solicitud.");
  }
  return payload;
}

const money = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);
const number = (value) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value || 0);

function RemodelSimulator() {
  const [form, setForm] = useState({ area_m2: 120, units: 2, tier: "standard", acquisition_cost: 0, monthly_rent_per_unit: 0, monthly_operating_expenses: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  async function calculate(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      setResult(await request("/api/sales/simulation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, area_m2: Number(form.area_m2), units: Number(form.units), acquisition_cost: Number(form.acquisition_cost), monthly_rent_per_unit: Number(form.monthly_rent_per_unit), monthly_operating_expenses: Number(form.monthly_operating_expenses) }) }));
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  const roi = result?.returns?.annual_roi_pct == null ? "-" : `${result.returns.annual_roi_pct}%`;
  const payback = result?.returns?.payback_years == null ? "-" : `${result.returns.payback_years} anos`;
  return <section className="sales-simulator"><div className="simulator-copy"><span className="eyebrow">SOMA / PRIMERA CUENTA</span><h2>Que podria sostener<br /><em>la transformacion?</em></h2><p>Una simulacion para comparar area, unidades, costo de obra y renta. No es un avaluo ni una promesa de rentabilidad.</p><small>Los supuestos de obra viven en la configuracion del API.</small></div><form className="simulator-form" onSubmit={calculate}><label>Area a intervenir (m2)<input name="area_m2" type="number" min="1" max="100000" value={form.area_m2} onChange={change} required /></label><label>Unidades<select name="units" value={form.units} onChange={change}><option value="1">1 unidad</option><option value="2">2 unidades</option><option value="3">3 unidades</option><option value="4">4 unidades</option><option value="6">6 unidades</option></select></label><label>Calidad de obra<select name="tier" value={form.tier} onChange={change}><option value="basic">Base</option><option value="standard">Estandar</option><option value="premium">Alta</option></select></label><label>Compra del inmueble (COP)<input name="acquisition_cost" type="number" min="0" step="1000000" value={form.acquisition_cost} onChange={change} /></label><label>Renta mensual por unidad (COP)<input name="monthly_rent_per_unit" type="number" min="0" step="50000" value={form.monthly_rent_per_unit} onChange={change} /></label><label>Gastos mensuales (COP)<input name="monthly_operating_expenses" type="number" min="0" step="50000" value={form.monthly_operating_expenses} onChange={change} /></label><button className="button button-dark" disabled={busy}>{busy ? "Calculando..." : "Ver escenario"}</button>{error && <small className="simulator-error" role="status">{error}</small>}</form><div className="simulator-result"><span className="eyebrow">ESCENARIO PRELIMINAR</span><div className="simulator-kpis"><div><small>Inversion total</small><strong>{result ? money(result.investment.total) : "-"}</strong></div><div><small>Costo de obra</small><strong>{result ? money(result.construction.total) : "-"}</strong></div><div><small>Retorno anual</small><strong>{roi}</strong></div><div><small>Recuperacion</small><strong>{payback}</strong></div></div>{result?.assumptions?.length > 0 && <p className="simulator-note">{result.assumptions.join(" ")}</p>}</div></section>;
}

function Brand({ onHome }) { return <button className="brand" onClick={onHome}><img src={mark} alt="" /><span>SOMA</span></button>; }
function goTo(view, onNavigate) { if (view === "sales") window.history.pushState({}, "", "/ventas"); if (view === "login") window.history.pushState({}, "", "/"); onNavigate(view); }

function Header({ view, onNavigate, onLogout }) {
  if (view === "login") return <header className="site-header auth-header"><Brand onHome={() => {}} /><span className="nav-context">ACCESO ADMINISTRATIVO / LOCAL</span></header>;
  if (view === "sales") return <><header className="site-header"><Brand onHome={() => goTo("sales", onNavigate)} /><span className="nav-context">SOMA / VENTAS</span><button className="header-action" onClick={() => goTo("login", onNavigate)}>Acceso admin</button></header><RemodelSimulator /></>;
  return <header className="site-header"><Brand onHome={() => goTo("sales", onNavigate)} /><span className="nav-context">SOMA / CONTROL ROOM</span><div className="header-actions"><button className="header-sales" onClick={() => goTo("sales", onNavigate)}>Ver ventas</button><button className="header-action" onClick={onLogout}>Cerrar sesion</button></div></header>;
}

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState("");
  async function login(event) {
    event.preventDefault(); setMessage("Validando acceso...");
    try { const data = await request("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }); onLogin(data.token); } catch (error) { setMessage(error.message); }
  }
  return <main className="login-shell"><div className="login-rail"><span className="eyebrow">SOMA / CONTROL ROOM</span><h1>De la senal<br />al <em>criterio.</em></h1><p>Un espacio restringido para consultar el resumen operativo y mantener las decisiones de SOMA en contexto.</p><div className="login-sequence"><span><b>01</b>Consultar</span><span><b>02</b>Simular</span><span><b>03</b>Decidir</span></div></div><form className="login-card" onSubmit={login}><div className="login-card-mark"><img src={mark} alt="" /></div><span className="eyebrow">AREA RESTRINGIDA</span><h2>Iniciar sesion</h2><p>El resumen operativo requiere autenticacion.</p><label>Usuario<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Contrasena<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="button button-dark wide" type="submit">Entrar al control room</button>{message && <small className="login-message" role="status">{message}</small>}<small className="login-note">La contrasena se valida contra el hash almacenado en SQLite.</small></form></main>;
}

function DashboardNav({ view, onNavigate }) {
  return <nav className="dashboard-nav" aria-label="Secciones administrativas"><button className={view === "dashboard" ? "active" : ""} onClick={() => onNavigate("dashboard")}>Resumen</button><button className={view === "guide" ? "active" : ""} onClick={() => onNavigate("guide")}>Alcance actual</button></nav>;
}
function Kpi({ label, value, detail, accent = "" }) { return <article className={`kpi-card ${accent}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }

function MonthlyChart({ data }) {
  const rows = data?.length ? data : [{ mes: "Sin datos", total: 0, facturas: 0 }]; const max = Math.max(...rows.map((row) => row.total || 0), 1);
  return <article className="chart-card chart-monthly"><div className="chart-heading"><div><span className="eyebrow">ACTIVIDAD REGISTRADA</span><h3>Lo que se mueve en el tiempo</h3></div><span className="chart-caption">COP / MES</span></div><div className="bar-chart">{rows.slice(-8).map((row) => <div className="bar-column" key={row.mes}><span className="bar-value">{row.total ? money(row.total) : "-"}</span><div className="bar-track"><i style={{ height: `${Math.max((row.total / max) * 100, row.total ? 8 : 2)}%` }} /></div><b>{row.mes}</b><small>{row.facturas} registro(s)</small></div>)}</div></article>;
}
function ProviderChart({ data }) {
  const rows = data?.length ? data.slice(0, 5) : [{ proveedor: "Sin proveedores", total: 0, facturas: 0 }]; const max = Math.max(...rows.map((row) => row.total || 0), 1);
  return <article className="chart-card"><div className="chart-heading"><div><span className="eyebrow">CONCENTRACION</span><h3>Quien esta pesando</h3></div><span className="chart-caption">TOP 5</span></div><div className="provider-chart">{rows.map((row, index) => <div className="provider-row" key={row.proveedor}><div className="provider-label"><b>0{index + 1}</b><span title={row.proveedor}>{row.proveedor}</span><strong>{money(row.total)}</strong></div><div className="provider-track"><i style={{ width: `${Math.max((row.total / max) * 100, row.total ? 7 : 2)}%` }} /></div><small>{row.facturas} registro(s)</small></div>)}</div></article>;
}
function Dashboard({ finance }) {
  return <div className="panel-view dashboard-view"><div className="dashboard-intro"><div><span className="eyebrow">SOMA / LECTURA OPERATIVA</span><h1>El proyecto empieza<br />cuando aparecen<br /><em>los patrones.</em></h1></div><div className="intro-note"><span className="pulse-dot" /> <b>CONTROL ROOM ACTIVO</b><p>Este resumen muestra los datos disponibles en SQLite. Las capacidades de documentos y reportes no forman parte del alcance actual.</p></div></div><div className="kpi-grid"><Kpi label="Registros" value={number(finance?.facturas)} detail={`${number(finance?.items)} items normalizados`} accent="terra" /><Kpi label="Valor registrado" value={money(finance?.total_pagado)} detail="Fuente operativa: SQLite" /><Kpi label="Proveedores" value={number(finance?.proveedores)} detail="Datos incluidos en el resumen" /><Kpi label="Alertas" value={number(finance?.alertas_calidad)} detail="Requieren revision" accent={finance?.alertas_calidad ? "warning" : ""} /></div><div className="chart-grid"><MonthlyChart data={finance?.monthly} /><ProviderChart data={finance?.providers_chart} /></div><aside className="module-helper"><div><span className="eyebrow">ALCANCE EXPLICITO</span><strong>Solo capacidades verificadas</strong><p>El panel mantiene resumen, autenticacion y orientacion. El simulador y el agente arquitectonico estan disponibles en ventas.</p></div></aside></div>;
}

function Guide() {
  return <div className="panel-view module-view guide-view"><div className="module-heading"><span className="eyebrow">02 / ORIENTACION</span><h1>Una guia para<br /><em>leer mejor.</em></h1><p>El alcance actual prioriza una base segura y honesta: acceso administrativo, resumen operativo, simulacion de escenarios y agente arquitectonico en tiempo real.</p></div><div className="guide-grid"><article><span>01 / RESUMEN</span><h2>Ver la senal disponible</h2><p>El control room consulta los datos que ya existen en SQLite y presenta sus indicadores sin inventar procesamiento adicional.</p><small>La base usa migraciones versionadas y conserva los usuarios existentes.</small></article><article><span>02 / SIMULAR</span><h2>Comparar escenarios</h2><p>En ventas puedes cambiar area, unidades, costo, renta y gastos para obtener una referencia preliminar de inversion y retorno.</p><small>La simulacion no sustituye una cotizacion, un avaluo ni una validacion normativa.</small></article><article><span>03 / CONVERSAR</span><h2>Preguntar al agente</h2><p>El agente arquitectonico responde por SSE y declara supuestos, riesgos y siguientes pasos para una primera lectura.</p><small>Las capacidades futuras se mantienen fuera de la interfaz hasta tener una API implementada.</small></article></div><div className="story-callout"><div><span className="eyebrow">LA SECUENCIA SOMA</span><h2>Una lectura clara<br />antes de decidir.</h2></div><p>Lo que no esta implementado no aparece como una accion disponible. Esta frontera protege los datos y evita prometer flujos que aun no existen.</p></div></div>;
}

function PlanCard({ plan }) { if (!plan) return null; return <article className="plan-card"><div className="plan-card-head"><span className="eyebrow">PLAN ESTRUCTURADO / AG-UI</span><span className="plan-badge">BORRADOR</span></div><h3>{plan.title}</h3><p>{plan.summary}</p><div className="plan-inputs"><span><b>{plan.inputs?.area_m2}</b> m2</span><span><b>{plan.inputs?.units}</b> unidades</span><span><b>{money(plan.inputs?.budget)}</b> presupuesto</span></div>{plan.phases?.map((phase, index) => <div className="plan-phase" key={phase.name}><span>0{index + 1}</span><div><b>{phase.name}</b><small>{phase.duration} - {phase.share}</small><p>{phase.deliverable}</p></div></div>)}<small className="plan-note">{plan.budget?.note}</small></article>; }

function SalesChat() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Soy el asesor de SOMA. Cuentame que casa tienes o que tipo de vivienda quieres estudiar." }]); const [plan, setPlan] = useState(null); const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const [chatError, setChatError] = useState("");
  const suggestions = ["Quiero convertir una casa de 180 m2 en 3 apartamentos", "Como se arma el presupuesto de una remodelacion?", "Tengo una casa y quiero estudiar su potencial"];
  async function send(text = input) {
    const message = text.trim(); if (!message || busy) return; const history = [...messages, { role: "user", content: message }]; const assistantIndex = history.length;
    setMessages([...history, { role: "assistant", content: "" }]); setInput(""); setBusy(true); setPlan(null); setChatError("");
    try {
      const response = await fetch(`${API}/api/agui/architect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: crypto.randomUUID(), runId: crypto.randomUUID(), messages: history.map((item) => ({ role: item.role, content: item.content })) }) });
      if (!response.ok) throw new Error(`El asesor respondio ${response.status}.`); if (!response.body) throw new Error("El navegador no pudo abrir el stream del asesor.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      const handleEvent = (rawEvent) => { const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:")); if (!dataLine) return; const event = JSON.parse(dataLine.slice(5).trim()); if (event.type === "TEXT_MESSAGE_CONTENT") setMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, content: `${item.content}${event.delta || ""}` } : item)); if (event.type === "CUSTOM" && event.name === "architecture_plan") setPlan(event.value); if (event.type === "RUN_ERROR") throw new Error(event.message || "El asesor no devolvio una respuesta."); };
      while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done }); const events = buffer.split("\n\n"); buffer = events.pop() || ""; events.filter(Boolean).forEach(handleEvent); if (done) break; } if (buffer.trim()) handleEvent(buffer);
    } catch (error) { setChatError(error.message || "No se pudo conectar con el backend."); setMessages((current) => current.map((item, index) => index === assistantIndex ? { ...item, content: "No pude completar la asesoria." } : item)); } finally { setBusy(false); }
  }
  return <div className="sales-chat"><div className="chat-head"><div><span className="eyebrow">SOMA / IA EN VIVO</span><h3>Planifica con un asesor</h3></div><span className={busy ? "chat-live busy" : "chat-live"}>{busy ? "analizando" : "en linea"}</span></div><p className="chat-context-note">Una primera orientacion para entender si tu inmueble merece un estudio.</p><div className="chat-suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => send(suggestion)}>{suggestion}</button>)}</div><div className="chat-thread">{messages.map((message, index) => <div className={`chat-bubble ${message.role}${index === 0 ? " welcome-message" : ""}`} key={`${message.role}-${index}`}>{message.content || <span className="typing">...</span>}</div>)}</div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pregunta por costos o arquitectura..." /><button className="button button-dark" disabled={busy}>Enviar</button></form>{chatError && <small className="chat-debug" role="status">{chatError}</small>}<PlanCard plan={plan} /></div>;
}

 function SalesPage() { return <main className="sales-page"><div className="sales-background" style={{ backgroundImage: `url("${collectiveHousing}")` }} aria-hidden="true" /><section className="sales-hero"><div><span className="eyebrow">SOMA / VIVIENDA MULTIFAMILIAR</span><h1>Una casa.<br />Varias formas<br />de <em>vivirla.</em></h1><p>Antes de comprar o transformar, entiende el potencial del inmueble. SOMA ordena arquitectura, numeros y decisiones en una primera conversacion.</p><div className="sales-proof"><span><b>01</b>Leer la casa</span><span><b>02</b>Proyectar escenarios</span><span><b>03</b>Decidir con criterio</span></div></div><div className="sales-visual"><div><span>SOMA / CASA 01</span><span>PRIMERA LECTURA</span></div><div className="sales-visual-house"><i /><i /><i /></div><small>Una casa existente tambien puede tener otra vida.</small></div></section><section className="sales-film"><video autoPlay muted loop playsInline preload="metadata" aria-label="Recorrido aereo de un proyecto de vivienda"><source src={droneVideo} type="video/mp4" /></video><div className="film-caption"><span className="eyebrow">SOMA / CONTEXTO</span><strong>La idea no es ver el dron.<br />Es ver lo que puede llegar a ser.</strong></div></section><section className="sales-existing"><div><span className="eyebrow">FASE 1 / CASA EXISTENTE</span><h2>Lo que ya tienes<br /><em>tambien funciona.</em></h2><p>Antes de imaginar una transformacion, leemos la base: estructura, distribucion, iluminacion, jardin y posibilidades reales de adaptacion.</p></div><figure><img src={existingHouse} alt="Infografia de una casa unifamiliar existente y sus posibilidades de transformacion" /><figcaption>Vista de lectura inicial</figcaption></figure></section><section className="sales-chat-section"><div><span className="eyebrow">ASESORIA EN TIEMPO REAL</span><h2>La primera conversacion<br />antes de la primera obra.</h2><p>Cuenta al asesor que tienes, donde esta y que quieres conseguir. La respuesta ayuda a ordenar el siguiente paso.</p></div><SalesChat /></section></main>; }

function App() {
  const [token, setToken] = useState(sessionStorage.getItem("atlas_admin_token") || ""); const publicSales = window.location.pathname === "/ventas" || window.location.pathname === "/soma"; const [view, setView] = useState(publicSales ? "sales" : token ? "dashboard" : "login"); const [finance, setFinance] = useState(null); const [error, setError] = useState("");
  async function loadFinance(currentToken = token) { if (!currentToken) return; try { setFinance(await request("/api/admin/summary", { headers: { Authorization: `Bearer ${currentToken}` } })); setError(""); } catch (requestError) { setError(`No se pudo cargar el resumen: ${requestError.message}`); } }
  function login(newToken) { setToken(newToken); sessionStorage.setItem("atlas_admin_token", newToken); setView("dashboard"); loadFinance(newToken); }
  function logout() { setToken(""); sessionStorage.removeItem("atlas_admin_token"); setFinance(null); setView("login"); }
  useEffect(() => { if (token) loadFinance(); }, []);
  return <div className="app-shell"><Header view={view} onNavigate={setView} onLogout={logout} />{view === "login" ? <AdminLogin onLogin={login} /> : view === "sales" ? <SalesPage /> : <main className="workspace"><DashboardNav view={view} onNavigate={setView} /><section className="workspace-content">{view === "dashboard" ? <Dashboard finance={finance} /> : <Guide />}{error && <div className="activity-log error-state"><span className="eyebrow">ACTIVIDAD</span><p>{error}</p></div>}</section></main>}</div>;
}

export default App;
