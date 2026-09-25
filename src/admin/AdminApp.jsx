import { useEffect, useState } from "react";
import copy from "../content/site.yaml";
import Lanzador from "../asistente/Lanzador.jsx";
import Brand from "../Brand.jsx";
import { request } from "../lib/api.js";
import { navigate } from "../lib/route.js";
import ApuBuilder from "./ApuBuilder.jsx";
import ApuEditor from "./ApuEditor.jsx";
import Dashboard from "./Dashboard.jsx";
import Guide from "./Guide.jsx";
import ProjectSimulator from "./ProjectSimulator.jsx";
import RevisionFacturas from "./RevisionFacturas.jsx";
import Supplies from "./Supplies.jsx";


const SECCIONES = {
  "/admin": Dashboard,
  "/admin/insumos": Supplies,
  "/admin/apus": () => <><ApuBuilder /><ApuEditor /></>,
  "/admin/simulador": ProjectSimulator,
  "/admin/revision": RevisionFacturas,
  "/admin/orientacion": Guide,
};

// El login lo hace Cloudflare Access antes de que cargue esta pagina. En local
// el Worker responde con este actor fijo; ahi no hay sesion que cerrar.
const ACTOR_LOCAL = "dev@local";
const CLAVE_MENU = "soma-menu-contraido";

function Aviso({ titulo, texto, children }) {
  return <main className="access-state"><Brand href="/" /><h1>{titulo}</h1>{texto && <p>{texto}</p>}{children}</main>;
}

function Sidebar({ path, contraido, onToggle }) {
  const n = copy.nav;
  return <nav className={`admin-sidebar${contraido ? " is-collapsed" : ""}`} aria-label="Herramientas"><button className="sidebar-toggle" onClick={onToggle} aria-expanded={!contraido} aria-label={contraido ? n.expandir : n.contraer} title={contraido ? n.expandir : n.contraer}>{contraido ? "›" : "‹"}</button><ul>{n.secciones.map((s) => <li key={s.ruta}><a href={s.ruta} className={path === s.ruta ? "active" : ""} aria-current={path === s.ruta ? "page" : undefined} title={s.etiqueta} onClick={(event) => { event.preventDefault(); navigate(s.ruta); }}><b>{s.numero}</b><span>{s.etiqueta}</span></a></li>)}</ul></nav>;
}

export default function AdminApp({ path }) {
  const a = copy.acceso;
  const [sesion, setSesion] = useState({ estado: "cargando" });
  const [contraido, setContraido] = useState(() => localStorage.getItem(CLAVE_MENU) === "1");
  useEffect(() => {
    request("/api/admin/me").then((me) => setSesion({ estado: "lista", email: me.email })).catch((error) => setSesion({ estado: error.status === 503 ? "sin_configurar" : error.status === 401 ? "vencida" : "error", mensaje: error.message }));
  }, []);
  function toggle() { setContraido((actual) => { localStorage.setItem(CLAVE_MENU, actual ? "0" : "1"); return !actual; }); }

  if (sesion.estado === "cargando") return <Aviso titulo={a.cargando} />;
  // Recargar /admin hace que Access vuelva a pedir la sesion.
  if (sesion.estado === "vencida") return <Aviso titulo={a.vencida_titulo} texto={a.vencida_texto}><a className="button button-dark" href="/admin">{a.vencida_boton}</a></Aviso>;
  if (sesion.estado === "sin_configurar") return <Aviso titulo={a.sin_configurar_titulo} texto={a.sin_configurar_texto} />;
  if (sesion.estado === "error") return <Aviso titulo={a.error_titulo} texto={sesion.mensaje} />;

  const Seccion = SECCIONES[path.replace(/\/+$/, "") || "/admin"] ?? Dashboard;
  const local = sesion.email === ACTOR_LOCAL;
  return <div className="app-shell admin-shell">
    <header className="site-header"><Brand href="/admin" /><span className="nav-context">{copy.nav.contexto_admin}</span><div className="header-actions">{local ? <span className="session-chip">{a.modo_local}</span> : <span className="session-chip">{sesion.email}</span>}<a className="header-action" href="/">{copy.nav.ver_ventas}</a>{!local && <a className="header-action" href="/cdn-cgi/access/logout">{copy.nav.cerrar_sesion}</a>}</div></header>
    <main className={`workspace admin-workspace${contraido ? " menu-collapsed" : ""}`}><Sidebar path={path} contraido={contraido} onToggle={toggle} /><section className="workspace-content"><Seccion /></section></main>
    <Lanzador tipo="copiloto" />
  </div>;
}
