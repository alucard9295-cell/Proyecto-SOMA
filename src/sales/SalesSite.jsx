import copy from "../content/site.yaml";
import Lanzador, { SIMULADOR_EVENTO } from "../asistente/Lanzador.jsx";
import Brand from "../Brand.jsx";
import { request } from "../lib/api.js";
import { money } from "../lib/format.js";
import collectiveHousing from "../../assets/vivienda colectiva.jpg";
import existingHouse from "../../assets/proyecto.webp";
import droneVideo from "../../assets/la_idea_no_es_ver_el_dron_sino.mp4";
import { useEffect, useRef, useState } from "react";


function RemodelSimulator() {
  const c = copy.ventas.simulador;
  const [form, setForm] = useState({ area_m2: 120, units: 2, tier: "standard", acquisition_cost: 0, monthly_rent_per_unit: 0, monthly_operating_expenses: 0 });
  const [result, setResult] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const actual = useRef(form); actual.current = form;
  const entrada = (valores) => ({ ...valores, area_m2: Number(valores.area_m2), units: Number(valores.units), acquisition_cost: Number(valores.acquisition_cost), monthly_rent_per_unit: Number(valores.monthly_rent_per_unit), monthly_operating_expenses: Number(valores.monthly_operating_expenses) });
  // Devuelve el escenario o lanza: lo usan el boton y el asesor.
  async function simular(valores) {
    setBusy(true); setError("");
    try {
      const escenario = await request("/api/sales/simulation", { method: "POST", json: entrada(valores) });
      setResult(escenario); return escenario;
    } catch (requestError) { setResult(null); setError(requestError.message); throw requestError; } finally { setBusy(false); }
  }
  // El asesor llena el formulario y el backend calcula en el acto (invariante 7).
  // Al chat vuelven las entradas usadas (el Worker recalcula con ellas lo que
  // comenta el modelo) y un resumen con las cifras del backend para la nota.
  useEffect(() => {
    const llenar = ({ detail: { datos, listo } }) => {
      const valores = { ...actual.current, ...datos }; setForm(valores);
      document.querySelector(".sales-simulator")?.scrollIntoView({ behavior: "smooth" });
      simular(valores).then((e) => listo(JSON.stringify({ entradas: entrada(valores), resumen: `${c.asesor_listo} ${c.kpis.inversion}: ${money(e.investment.total)} · ${c.kpis.roi}: ${e.returns.annual_roi_pct == null ? "—" : `${e.returns.annual_roi_pct}%`}` })), (e) => listo(JSON.stringify({ resumen: `${c.asesor_error} ${e.message}` })));
    };
    window.addEventListener(SIMULADOR_EVENTO, llenar);
    return () => window.removeEventListener(SIMULADOR_EVENTO, llenar);
  }, []);
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function calculate(event) { event.preventDefault(); simular(form).catch(() => {}); }
  // Los importes grandes se leen mal en un input numerico: la cifra con puntos va debajo.
  const importe = (name) => (Number(form[name]) > 0 ? <small className="simulator-hint">{money(form[name])}</small> : null);
  const roi = result?.returns?.annual_roi_pct == null ? "—" : `${result.returns.annual_roi_pct}%`;
  const payback = result?.returns?.payback_years == null ? "—" : `${result.returns.payback_years} años`;
  return <section className="sales-simulator"><div className="simulator-copy"><span className="eyebrow">{c.eyebrow}</span><h2>{c.titulo_linea1}<br /><em>{c.titulo_enfasis}</em></h2><p>{c.descripcion}</p></div><form className="simulator-form" onSubmit={calculate}><label>{c.campos.area}<input name="area_m2" type="number" min="1" max="100000" value={form.area_m2} onChange={change} required /></label><label>{c.campos.unidades}<input name="units" type="number" min="1" max="50" step="1" value={form.units} onChange={change} required /></label><label>{c.campos.calidad}<select name="tier" value={form.tier} onChange={change}><option value="basic">Base</option><option value="standard">Estándar</option><option value="premium">Alta</option></select></label><label>{c.campos.compra}<input name="acquisition_cost" type="number" min="0" step="1000000" value={form.acquisition_cost} onChange={change} />{importe("acquisition_cost")}</label><label>{c.campos.renta}<input name="monthly_rent_per_unit" type="number" min="0" step="50000" value={form.monthly_rent_per_unit} onChange={change} />{importe("monthly_rent_per_unit")}</label><label>{c.campos.gastos}<input name="monthly_operating_expenses" type="number" min="0" step="50000" value={form.monthly_operating_expenses} onChange={change} />{importe("monthly_operating_expenses")}</label><button className="button button-dark" disabled={busy}>{busy ? c.calculando : c.boton}</button>{error && <small className="simulator-error" role="status">{error}</small>}</form><div className="sales-result"><span className="eyebrow">{c.resultado_eyebrow}</span><div className="sales-kpis"><div><small>{c.kpis.inversion}</small><strong>{result ? money(result.investment.total) : "—"}</strong></div><div><small>{c.kpis.flujo}</small><strong>{result ? money(result.income.net_annual) : "—"}</strong></div><div><small>{c.kpis.roi}</small><strong>{roi}</strong></div><div><small>{c.kpis.payback}</small><strong>{payback}</strong></div></div>{result?.assumptions?.note && <small className="simulator-note">{result.assumptions.note}</small>}</div></section>;
}

function SalesPage() {
  const c = copy.ventas;
  return <main className="sales-page"><div className="sales-background" style={{ backgroundImage: `url("${collectiveHousing}")` }} aria-hidden="true" /><section className="sales-hero"><div><span className="eyebrow">{c.hero.eyebrow}</span><h1>{c.hero.titulo_linea1}<br />{c.hero.titulo_linea2}<br />{c.hero.titulo_linea3} <em>{c.hero.titulo_enfasis}</em></h1><p>{c.hero.descripcion}</p><div className="sales-proof">{c.hero.pasos.map((paso) => <span key={paso.paso}><b>{paso.paso}</b>{paso.nombre}</span>)}</div></div><div className="sales-visual"><div><span>SOMA / CASA 01</span><span>PRIMERA LECTURA</span></div><div className="sales-visual-house"><i /><i /><i /></div><small>Una casa existente también puede tener otra vida.</small></div></section><section className="sales-film"><video autoPlay muted loop playsInline preload="metadata" aria-label="Recorrido aéreo de un proyecto de vivienda"><source src={droneVideo} type="video/mp4" /></video><div className="film-caption"><span className="eyebrow">{c.film.eyebrow}</span><strong>{c.film.titulo_linea1}<br />{c.film.titulo_linea2}</strong></div></section><section className="sales-existing"><div><span className="eyebrow">{c.existente.eyebrow}</span><h2>{c.existente.titulo_linea1}<br /><em>{c.existente.titulo_enfasis}</em></h2><p>{c.existente.descripcion}</p></div><figure><img src={existingHouse} alt="Infografía de una casa unifamiliar existente y sus posibilidades de transformación" /><figcaption>{c.existente.pie}</figcaption></figure></section></main>;
}

// "Acceso admin" es un enlace real, no un cambio de vista: la navegacion
// completa a /admin es la que Cloudflare Access intercepta para pedir sesion.
export default function SalesSite() {
  return <div className="app-shell"><header className="site-header"><Brand /><span className="nav-context">{copy.nav.contexto_ventas}</span><a className="header-action" href="/admin">{copy.nav.acceso_admin}</a></header><RemodelSimulator /><SalesPage /><Lanzador tipo="asesor" /></div>;
}
