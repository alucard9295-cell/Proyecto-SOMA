// Paso previo del asesor publico: nombre, correo y autorizacion de datos antes
// de cargar el chat (ADR-012). En modo "correo" es el mismo formulario sin chat:
// el visitante deja sus datos para que SOMA le escriba, y se le confirma aqui. El navegador recuerda que ya se hizo; el correo
// en si vive solo en D1.
import { useEffect, useRef, useState } from "react";
import copy from "../content/site.yaml";
import { request } from "../lib/api.js";
import Vitruvio from "./Vitruvio.jsx";

const CLAVE = "soma:asesor-contacto";

export function yaRegistrado() {
  try { return localStorage.getItem(CLAVE) === "1"; } catch { return false; }
}

export default function PasoPrevio({ modo = "chat", onListo, onCerrar }) {
  const c = modo === "correo" ? { ...copy.asesor.previo, ...copy.asesor.correo } : copy.asesor.previo;
  const [hecho, setHecho] = useState(false);
  const [form, setForm] = useState({ nombre: "", correo: "", autoriza: false });
  const [error, setError] = useState(""); const [enviando, setEnviando] = useState(false);
  const primero = useRef(null);
  useEffect(() => {
    primero.current?.focus();
    const esc = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCerrar]);
  const cambiar = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  async function enviar(e) {
    e.preventDefault(); setEnviando(true); setError("");
    try {
      await request("/api/sales/contacto", { method: "POST", json: form });
      try { localStorage.setItem(CLAVE, "1"); } catch { /* sin almacenamiento: se pedira de nuevo */ }
      if (modo === "correo") setHecho(true); else onListo();
    } catch (err) { setError(err.message); } finally { setEnviando(false); }
  }
  return <div className="asesor-previo" role="dialog" aria-modal="false" aria-labelledby="asesor-previo-titulo">
    <header><Vitruvio size={56} className="vitruvio-activo" /><span className="ed-label">{c.eyebrow}</span><button type="button" className="asesor-previo-cerrar" aria-label={c.cerrar} onClick={onCerrar}>×</button></header>
    <h2 id="asesor-previo-titulo" className="ed-title">{c.titulo}<em>{c.titulo_enfasis}</em></h2>
    <p role={hecho ? "status" : undefined}>{hecho ? c.gracias : c.texto}</p>
    {!hecho && <form onSubmit={enviar}>
      <label>{c.nombre}<input ref={primero} name="nombre" autoComplete="name" minLength={2} maxLength={80} required value={form.nombre} onChange={cambiar} /></label>
      <label>{c.correo}<input name="correo" type="email" autoComplete="email" maxLength={120} required value={form.correo} onChange={cambiar} /></label>
      <label className="asesor-previo-check"><input name="autoriza" type="checkbox" required checked={form.autoriza} onChange={cambiar} /><span>{c.autoriza}</span></label>
      {error && <small className="asesor-previo-error" role="status">{error}</small>}
      <button className="ed-btn ed-btn-accent" disabled={enviando}>{enviando ? c.enviando : c.boton}</button>
    </form>}
  </div>;
}
