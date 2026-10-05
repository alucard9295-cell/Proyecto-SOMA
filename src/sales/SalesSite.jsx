import copy from "../content/site.yaml";
import Lanzador, { SIMULADOR_EVENTO } from "../asistente/Lanzador.jsx";
import { request } from "../lib/api.js";
import { money } from "../lib/format.js";
import { useEffect, useRef, useState } from "react";
import "@fontsource-variable/jost/wght.css";
import "@fontsource-variable/jost/wght-italic.css";
import "@fontsource-variable/dm-sans/wght.css";
import "./portada.css";

// Renders propios (Blender) recortados de docs/design/arquitectura1.pdf. El id
// de cada imagen es el que usa site.yaml (img: sala, cocina...).
const RENDERS = import.meta.glob("../../assets/renders/*.webp", { eager: true, import: "default" });
const render = (id) => RENDERS[`../../assets/renders/${id}.webp`];
const dosDigitos = (n) => String(n).padStart(2, "0");
const sinMovimiento = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

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
      document.getElementById("simulador")?.scrollIntoView({ behavior: "smooth" });
      simular(valores).then((e) => listo(JSON.stringify({ entradas: entrada(valores), resumen: `${c.asesor_listo} ${c.kpis.inversion}: ${money(e.investment.total)} · ${c.kpis.roi}: ${e.returns.annual_roi_pct == null ? "—" : `${e.returns.annual_roi_pct}%`}` })), (e) => listo(JSON.stringify({ resumen: `${c.asesor_error} ${e.message}` })));
    };
    window.addEventListener(SIMULADOR_EVENTO, llenar);
    return () => window.removeEventListener(SIMULADOR_EVENTO, llenar);
  }, []);
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function calculate(event) { event.preventDefault(); simular(form).catch(() => {}); }
  // Los importes grandes se leen mal en un input numerico: la cifra con puntos va debajo.
  const importe = (name) => (Number(form[name]) > 0 ? <small className="ed-sim-hint">{money(form[name])}</small> : null);
  // Sin renta el dominio devuelve flujo y ROI en cero: se muestra vacío, no un 0 que parece medido.
  const sinRenta = !result?.income?.gross_annual;
  const roi = sinRenta || result.returns.annual_roi_pct == null ? c.kpis.sin_renta : `${result.returns.annual_roi_pct}%`;
  const payback = result?.returns?.payback_years == null ? c.kpis.sin_renta : `${result.returns.payback_years} ${c.kpis.anios}`;
  return <section className="ed-sim ed-dark" id="simulador"><div className="ed-wrap">
    <div className="ed-sim-head"><div><span className="ed-label">{c.eyebrow}</span><h2 className="ed-title">{c.titulo_linea1}<em>{c.titulo_enfasis}</em></h2></div><p>{c.descripcion}</p></div>
    <div className="ed-sim-grid">
      <form className="ed-sim-form" onSubmit={calculate}>
        <fieldset><legend><span className="ed-index">01</span>{c.grupo_inmueble}</legend>
          <label>{c.campos.area}<input name="area_m2" type="number" min="1" max="100000" value={form.area_m2} onChange={change} required /></label>
          <label>{c.campos.unidades}<input name="units" type="number" min="1" max="50" step="1" value={form.units} onChange={change} required /></label>
          <div className="ed-sim-tier" role="radiogroup" aria-label={c.campos.calidad}><span>{c.campos.calidad}</span><div>{c.calidades.map((q) => <label key={q.id} className={form.tier === q.id ? "is-on" : ""}><input type="radio" name="tier" value={q.id} checked={form.tier === q.id} onChange={change} /><i aria-hidden="true" />{q.etiqueta}</label>)}</div></div>
        </fieldset>
        <fieldset><legend><span className="ed-index">02</span>{c.grupo_renta}<small>{c.grupo_renta_nota}</small></legend>
          <label>{c.campos.compra}<input name="acquisition_cost" type="number" min="0" step="1000000" value={form.acquisition_cost} onChange={change} />{importe("acquisition_cost")}</label>
          <label>{c.campos.renta}<input name="monthly_rent_per_unit" type="number" min="0" step="50000" value={form.monthly_rent_per_unit} onChange={change} />{importe("monthly_rent_per_unit")}</label>
          <label>{c.campos.gastos}<input name="monthly_operating_expenses" type="number" min="0" step="50000" value={form.monthly_operating_expenses} onChange={change} />{importe("monthly_operating_expenses")}</label>
        </fieldset>
        <button className="ed-btn ed-btn-accent" disabled={busy}>{busy ? c.calculando : c.boton}</button>{error && <small className="ed-sim-error" role="status">{error}</small>}
      </form>
      <div className={`ed-sim-result${busy ? " is-busy" : ""}`} aria-live="polite">
        <header><span className="ed-label">{c.resultado_eyebrow}</span><span className="ed-sim-sheet">{c.hoja}</span></header>
        {result ? <>
          <div className="ed-kpis"><div className="ed-kpi-total"><small>{c.kpis.inversion}</small><strong>{money(result.investment.total)}</strong></div><div><small>{c.kpis.flujo}</small><strong>{sinRenta ? c.kpis.sin_renta : money(result.income.net_annual)}</strong></div><div><small>{c.kpis.roi}</small><strong>{roi}</strong></div><div><small>{c.kpis.payback}</small><strong>{payback}</strong></div></div>
          <Composicion result={result} c={c} />
          <p className="ed-sim-m2"><span>{c.costo_m2}</span><b>{money(result.construction.cost_per_m2)}</b></p>
          {result.assumptions?.note && <small className="ed-sim-note">{result.assumptions.note}</small>}
        </> : <div className="ed-sim-empty"><Plano /><p>{c.vacio}</p></div>}
      </div>
    </div>
  </div></section>;
}

// Barra de composicion: cada tramo es una cifra que ya dio el backend; aqui solo
// se calcula el ancho en pantalla.
function Composicion({ result, c }) {
  const partes = [
    ["base", result.construction.base], ["design", result.construction.design], ["permits", result.construction.permits],
    ["contingency", result.construction.contingency], ["acquisition_cost", result.investment.acquisition_cost], ["closing_costs", result.investment.closing_costs],
  ].filter(([, valor]) => valor > 0);
  const total = result.investment.total || 1;
  return <div className="ed-sim-mix"><span className="ed-label">{c.composicion}</span>
    <div className="ed-sim-bar" aria-hidden="true">{partes.map(([id, valor]) => <i key={id} className={`ed-mix-${id}`} style={{ flexGrow: valor / total }} />)}</div>
    <ul>{partes.map(([id, valor]) => <li key={id}><i className={`ed-mix-${id}`} aria-hidden="true" /><span>{c.partes[id]}</span><b>{money(valor)}</b><small>{Math.round((valor / total) * 100)}%</small></li>)}</ul>
  </div>;
}

// Estado vacio: una planta en linea, en el lenguaje de plano del resto de la seccion.
const Plano = () => <svg className="ed-sim-plano" viewBox="0 0 160 110" aria-hidden="true"><path d="M10 10h140v90H10zM10 55h60M70 10v30M70 55v45M100 55h50M100 55v20M100 85v15M40 55v-10M40 30v-20" /><path className="ed-sim-plano-acc" d="M70 40a15 15 0 0 1 15 15M100 75a10 10 0 0 1 10 10" /><circle className="ed-sim-plano-acc" cx="125" cy="30" r="3" /></svg>;

// Iconos en linea (sin fuentes ni CDN): trazo de 1.6 en currentColor.
const ICONOS = {
  whatsapp: <><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z" /><path d="M9.2 8.3c0 3.6 2.9 6.5 6.5 6.5l.9-1.5-2.1-1.1-.9.9a4.9 4.9 0 0 1-2.7-2.7l.9-.9-1.1-2.1z" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" /></>,
  facebook: <path d="M14.5 21v-7h2.6l.4-3h-3V9.2c0-.9.3-1.5 1.6-1.5h1.5V5a19 19 0 0 0-2.2-.1c-2.2 0-3.7 1.3-3.7 3.8V11H9.2v3h2.5v7" />,
  direccion: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
};
const Icono = ({ nombre }) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONOS[nombre]}</svg>;

// Un canal vacio en site.yaml no se pinta: nada en la UI que no exista.
function canales() {
  const { whatsapp, instagram, facebook } = copy.contacto;
  return [
    whatsapp && { id: "whatsapp", nombre: "WhatsApp", url: `https://wa.me/${whatsapp}`, texto: `+${whatsapp}` },
    instagram && { id: "instagram", nombre: "Instagram", url: instagram, texto: "@" + instagram.replace(/\/+$/, "").split("/").pop() },
    facebook && { id: "facebook", nombre: "Facebook", url: facebook, texto: "Facebook" },
  ].filter(Boolean);
}

function Redes({ conTexto }) {
  return canales().map((canal) => <a key={canal.id} className="ed-channel" href={canal.url} target="_blank" rel="noopener noreferrer" aria-label={canal.nombre}><Icono nombre={canal.id} />{conTexto && <span><small>{canal.nombre}</small>{canal.texto}</span>}</a>);
}

// Marca de texto: el isotipo terracota de Brand.jsx no entra en la paleta
// editorial. Brand.jsx sigue sirviendo al panel admin.
function Marca() {
  return <a className="ed-brand" href="/"><svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true"><path d="M1 23V9l10-8 10 8v14M15 23V14h10v9M25 23V5h14v18" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg><span><b>SOMA</b><small>{copy.ventas.portada.marca_sub}</small></span></a>;
}

// Transparente sobre el hero; al bajar se vuelve solida. El menu movil es un
// panel navy que cubre la pantalla (DESIGN.md, "Overlay Panels").
function Cabecera() {
  const p = copy.ventas.portada;
  const [solida, setSolida] = useState(false); const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    const medir = () => setSolida(window.scrollY > 40);
    medir(); window.addEventListener("scroll", medir, { passive: true });
    return () => window.removeEventListener("scroll", medir);
  }, []);
  const enlaces = p.nav.map((item) => <a key={item.href} href={item.href} onClick={() => setAbierto(false)}>{item.etiqueta}</a>);
  return <header className={`ed-header${solida || abierto ? " is-solid" : ""}${abierto ? " is-open" : ""}`}><Marca /><nav className="ed-nav" aria-label="Secciones">{enlaces}</nav><a className="ed-admin" href="/admin">{copy.nav.acceso_admin}</a><button className="ed-burger" type="button" aria-expanded={abierto} aria-label={abierto ? p.menu_cerrar : p.menu_abrir} onClick={() => setAbierto(!abierto)}><i /><i /></button>{abierto && <nav className="ed-drawer" aria-label="Menú">{enlaces}<a href="/admin">{copy.nav.acceso_admin}</a></nav>}</header>;
}

// Galeria a pantalla completa (como el hero de Stitch): abajo a la izquierda el
// nombre del espacio en negrita, el lugar en cursiva y la etiqueta celeste;
// a la derecha la promesa de SOMA y las acciones. Avanza sola cada 6,5 s salvo
// con prefers-reduced-motion o si el visitante la pausa.
function Hero() {
  const h = copy.ventas.hero; const p = copy.ventas.portada; const slides = p.diapositivas;
  const [actual, setActual] = useState(0); const [pausa, setPausa] = useState(sinMovimiento);
  useEffect(() => {
    if (pausa) return undefined;
    const t = setTimeout(() => setActual((n) => (n + 1) % slides.length), 6500);
    return () => clearTimeout(t);
  }, [actual, pausa, slides.length]);
  const ir = (n) => setActual((n + slides.length) % slides.length);
  const s = slides[actual];
  return <section className="ed-hero" id="inicio" aria-roledescription={p.galeria_rol} aria-label={h.eyebrow}>
    {slides.map((d, n) => <img key={d.img} className={`ed-hero-img${n === actual ? " is-on" : ""}`} src={render(d.img)} alt={d.alt} aria-hidden={n !== actual} fetchPriority={n ? "low" : "high"} />)}
    <div className="ed-wrap ed-hero-copy">
      <div className="ed-hero-slide" key={s.img} aria-live={pausa ? "polite" : "off"}><span className="ed-label ed-accent">{s.etiqueta}</span><p className="ed-title ed-title-xl">{s.nombre}<em>{s.lugar}</em></p></div>
      <div className="ed-hero-lead"><span className="ed-label">{h.eyebrow}</span><h1 className="ed-title">{h.titulo}<em>{h.titulo_enfasis}</em></h1><p>{h.descripcion}</p><div className="ed-actions"><a className="ed-btn ed-btn-accent" href="#simulador">{p.hero_cta}</a><a className="ed-btn ed-btn-ghost" href="#propuestas">{p.hero_cta_secundario}</a></div></div>
    </div>
    <div className="ed-hero-nav">
      <span className="ed-hero-count">{dosDigitos(actual + 1)} / {dosDigitos(slides.length)}</span>
      <button type="button" className="ed-hero-arrow" aria-label={p.galeria_anterior} onClick={() => ir(actual - 1)}>←</button>
      <div className="ed-hero-dots">{slides.map((d, n) => <button key={d.img} type="button" aria-label={`${p.galeria_ir} ${n + 1}: ${d.nombre}`} aria-current={n === actual} onClick={() => ir(n)} />)}</div>
      <button type="button" className="ed-hero-arrow" aria-label={p.galeria_siguiente} onClick={() => ir(actual + 1)}>→</button>
      <button type="button" className="ed-hero-pause" aria-label={pausa ? p.galeria_reanudar : p.galeria_pausar} aria-pressed={pausa} onClick={() => setPausa(!pausa)}>{pausa ? "▶" : "❚❚"}</button>
    </div>
  </section>;
}

// Portafolio en mosaico asimetrico con filtros (seccion "Nuestros proyectos" de
// Stitch), pero con renders reales de SOMA y sin proyectos inventados.
function Propuestas() {
  const p = copy.ventas.portada.propuestas;
  const [filtro, setFiltro] = useState("todos");
  const piezas = p.piezas.filter((x) => filtro === "todos" || x.tipo === filtro);
  return <section className="ed-section" id="propuestas"><div className="ed-wrap">
    <div className="ed-props-head"><div><span className="ed-label">{p.eyebrow}</span><h2 className="ed-title">{p.titulo}<em>{p.titulo_enfasis}</em></h2></div><p>{p.texto}</p></div>
    <div className="ed-tabs" role="tablist">{p.filtros.map((f) => <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.etiqueta}</button>)}</div>
    <div className={`ed-mosaic ed-mosaic-${piezas.length}`}>{piezas.map((x, n) => <figure key={x.img} className={`ed-tile ed-tile-${n}`}><img src={render(x.img)} alt={x.alt} loading="lazy" /><figcaption><span className="ed-index">{p.ref} {dosDigitos(p.piezas.indexOf(x) + 1)}</span><b>{x.nombre} <em>{x.lugar}</em></b><span className="ed-label ed-accent">{x.etiqueta}</span></figcaption></figure>)}</div>
  </div></section>;
}

function Enfoque() {
  const e = copy.ventas.portada.enfoque;
  return <section className="ed-section" id="enfoque"><div className="ed-wrap"><span className="ed-label">{e.eyebrow}</span><h2 className="ed-title">{e.titulo}<em>{e.titulo_enfasis}</em></h2><ol className="ed-steps">{copy.ventas.hero.pasos.map((paso) => <li key={paso.paso}><span className="ed-index">{paso.paso}</span><h3>{paso.nombre}</h3><p>{paso.texto}</p></li>)}</ol></div></section>;
}

function Contacto() {
  const c = copy.ventas.contacto;
  const { direccion, mapa } = copy.contacto;
  return <section className="ed-section ed-contact" id="contacto"><div className="ed-wrap ed-contact-grid"><div><span className="ed-label">{c.eyebrow}</span><h2 className="ed-title">{c.titulo_linea1}<em>{c.titulo_enfasis}</em></h2><p>{c.descripcion}</p><div className="ed-channels"><div className="ed-channel"><Icono nombre="direccion" /><span><small>{c.direccion_etiqueta}</small>{direccion}</span></div><Redes conTexto /></div></div><iframe className="ed-map" src={mapa} title={c.mapa_titulo} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div></section>;
}

function Footer() {
  return <footer className="ed-footer ed-dark"><div className="ed-wrap ed-footer-grid"><Marca /><p className="ed-footer-tag">{copy.marca.tagline}</p>{canales().length > 0 && <nav aria-label="Redes" className="ed-footer-social"><Redes /></nav>}<small>{copy.contacto.direccion}</small><small>{copy.ventas.footer.legal}</small></div></footer>;
}

// "Acceso admin" es un enlace real, no un cambio de vista: la navegacion
// completa a /admin es la que Cloudflare Access intercepta para pedir sesion.
// Mapa de la portada: cada seccion se nombra por su id (ancla en la URL, la
// misma clave en site.yaml y en docs/design/portada.md). Para cambiar una,
// buscar su nombre: "S2 propuestas" lleva a Propuestas() y a ventas.portada.propuestas.
//   S0 cabecera   Cabecera()          ventas.portada (marca_sub, nav)
//   S1 inicio     Hero()              ventas.portada.diapositivas
//   S2 propuestas Propuestas()        ventas.portada.propuestas
//   S3 enfoque    Enfoque()           ventas.portada.enfoque
//   S4 simulador  RemodelSimulator()  ventas.simulador
//   S5 contacto   Contacto()          ventas.contacto + contacto
//   S6 pie        Footer()            ventas.footer
//   asesor        <Lanzador />        asesor (menu, previo, correo)
export default function SalesSite() {
  return <div className="ed"><Cabecera /><main><Hero /><Propuestas /><Enfoque /><RemodelSimulator /><Contacto /></main><Footer /><Lanzador tipo="asesor" /></div>;
}
