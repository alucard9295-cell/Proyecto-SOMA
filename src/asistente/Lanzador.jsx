// Boton flotante que carga el asistente solo cuando se pide: CopilotKit pesa
// ~500 kB gzip y la mayoria de visitas nunca abre el chat.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import copy from "../content/site.yaml";
import PasoPrevio, { yaRegistrado } from "./PasoPrevio.jsx";
import Vitruvio from "./Vitruvio.jsx";

// Aqui y no en Asistente.jsx: el simulador lo escucha sin cargar CopilotKit.
export const SIMULADOR_EVENTO = "soma:llenar-simulador";

const Asistente = lazy(() => import("./Asistente.jsx"));

// El de WhatsApp es su marca (globo con auricular) y va en su verde: es lo que
// el visitante reconoce. Los demas siguen el trazo del sitio.
const ICONOS = {
  whatsapp: <svg viewBox="0 0 24 24" className="asesor-icono-whatsapp"><path className="asesor-wa-globo" d="M12 2.6a9.4 9.4 0 0 0-8.1 14.2L2.6 21.4l4.7-1.2A9.4 9.4 0 1 0 12 2.6z" /><path className="asesor-wa-tel" d="M8.7 7.1c.3-.3.8-.3 1 .1l1 2c.1.3 0 .6-.2.8l-.6.6c.6 1.3 1.6 2.3 2.9 2.9l.6-.6c.2-.2.5-.3.8-.2l2 1c.4.2.4.7.1 1l-.9.9c-.6.6-1.6.7-2.4.3-2.3-1.1-4.1-2.9-5.2-5.2-.4-.8-.3-1.8.3-2.4z" /></svg>,
  correo: <svg viewBox="0 0 16 16"><path d="M2.5 4h11v8h-11zM2.5 4.5 8 9l5.5-4.5" /></svg>,
  chat: <svg viewBox="0 0 16 16"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /></svg>,
};

// Angulos del arco (grados, 180 = a la izquierda de la figura, 90 = encima):
// las opciones se desprenden de la figura en un cuarto de circulo, como una
// cota que se abre. Con dos opciones se usan los extremos.
const ARCO = { 1: [135], 2: [165, 105], 3: [180, 135, 90] };

// El asesor publico es un Vitruvio sin caja, en un circulo de vidrio, con su
// firma "Agente SOMA" al lado. Tocarlo despliega en arco el chat, WhatsApp
// (solo si contacto.whatsapp tiene numero) y correo (deja nombre y correo en
// D1, sin chat). El copiloto del panel conserva el boton de texto.
export default function Lanzador({ tipo }) {
  const [estado, setEstado] = useState("cerrado"); // cerrado | menu | previo | correo | activo
  const asesor = tipo === "asesor";
  const dock = useRef(null);
  const cerrar = useCallback(() => setEstado("cerrado"), []);
  const listo = useCallback(() => setEstado("activo"), []);
  useEffect(() => {
    if (estado !== "menu") return undefined;
    const esc = (e) => { if (e.key === "Escape") setEstado("cerrado"); };
    const fuera = (e) => { if (!dock.current?.contains(e.target)) setEstado("cerrado"); };
    window.addEventListener("keydown", esc);
    document.addEventListener("pointerdown", fuera);
    return () => { window.removeEventListener("keydown", esc); document.removeEventListener("pointerdown", fuera); };
  }, [estado]);
  if (estado === "activo") return <Suspense fallback={<span className={asesor ? "asesor-lanzador asesor-cargando" : "button button-dark asistente-lanzador"}>{asesor ? <span className="asesor-figura"><Vitruvio size={56} className="vitruvio-activo" /></span> : <span>{copy[tipo].titulo}...</span>}</span>}><Asistente tipo={tipo} /></Suspense>;
  if (!asesor) return <button type="button" className="button button-dark asistente-lanzador" onClick={() => setEstado("activo")}>{copy[tipo].titulo}</button>;
  const m = copy.asesor.menu;
  const { firma } = copy.asesor;
  const { whatsapp } = copy.contacto;
  const abierto = estado === "menu";
  const opciones = [
    { id: "chat", texto: m.chat, accion: () => setEstado(yaRegistrado() ? "activo" : "previo") },
    whatsapp && { id: "whatsapp", texto: m.whatsapp, href: `https://wa.me/${whatsapp}` },
    { id: "correo", texto: m.correo, accion: () => setEstado("correo") },
  ].filter(Boolean);
  const angulos = ARCO[opciones.length];
  return <>
    {(estado === "previo" || estado === "correo") && <PasoPrevio modo={estado === "correo" ? "correo" : "chat"} onListo={listo} onCerrar={cerrar} />}
    <div className={`asesor-dock${abierto ? " is-abierto" : ""}`} ref={dock}>
      {abierto && <nav className="asesor-arco" id="asesor-menu" aria-label={m.etiqueta}>
        {opciones.map((o, i) => {
          const rad = (angulos[i] * Math.PI) / 180;
          const estilo = { "--i": i, "--cx": Math.cos(rad).toFixed(3), "--cy": (-Math.sin(rad)).toFixed(3) };
          const contenido = <><span className="asesor-arco-texto">{o.texto}</span><span className="asesor-arco-punto" aria-hidden="true">{ICONOS[o.id]}</span></>;
          const clase = `asesor-arco-item asesor-arco-${o.id}`;
          return o.href
            ? <a key={o.id} className={clase} style={estilo} href={o.href} target="_blank" rel="noopener noreferrer" onClick={cerrar}>{contenido}</a>
            : <button key={o.id} type="button" className={clase} style={estilo} onClick={o.accion}>{contenido}</button>;
        })}
      </nav>}
      <button type="button" className="asesor-lanzador" aria-expanded={abierto} aria-controls="asesor-menu" aria-label={m.contacto} onClick={() => setEstado(abierto ? "cerrado" : "menu")}>
        <span className="asesor-firma" aria-hidden="true"><small>{firma.antes}</small><b>{firma.nombre}</b></span>
        <span className="asesor-cota" aria-hidden="true" />
        <span className="asesor-figura"><Vitruvio size={56} /></span>
      </button>
    </div>
  </>;
}
