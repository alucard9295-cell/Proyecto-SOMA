import copy from "../../content/site.yaml";
import mark from "../../assets/soma-mark.svg";
import { useEffect, useRef, useState } from "react";
import { crearRecorrido, keyDeEscena, paradas } from "./escena.js";
import "./recorrido.css";

const textos = copy.ventas.recorrido;
const ESCENAS = textos.escenas;

// Recorrido 3D por scroll. La página es un riel alto: el scroll no desliza
// contenido, mueve la cámara. El texto de cada escena existe en el HTML aunque
// el 3D no arranque.
export default function Recorrido() {
  const canvasRef = useRef(null);
  const apiRef = useRef(null);
  const [carga, setCarga] = useState({ pct: 0, msg: "Preparando la casa" });
  const [listo, setListo] = useState(false);
  const [falla, setFalla] = useState(false);
  const [escena, setEscena] = useState(0);
  const [visible, setVisible] = useState(0);
  const [estado, setEstado] = useState({});
  const [bajo, setBajo] = useState(false);

  useEffect(() => {
    const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const movil = matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;
    let api = null, cancelado = false;
    const progreso = () => window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    crearRecorrido(canvasRef.current, {
      reducido, movil,
      alProgreso: (pct, msg) => setCarga({ pct: Math.round(pct), msg }),
      alEscena: (s) => { if (s !== null) setEscena(s); },
      alEstado: (e) => setEstado((prev) => ({ ...prev, ...e })),
    }).then((a) => {
      if (cancelado) { a.destruir(); return; }
      api = apiRef.current = a;
      a.saltar(progreso());
      setListo(true);
    }).catch((e) => { console.error(e); setFalla(true); });

    const onScroll = () => { api?.objetivo(progreso()); setBajo(window.scrollY > 20); };
    const onResize = () => { api?.redimensionar(); onScroll(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelado = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      api?.destruir();
    };
  }, []);

  // el texto sale, cambia y vuelve a entrar: nunca se ven dos escenas a la vez
  useEffect(() => {
    const t = setTimeout(() => setVisible(escena), 320);
    return () => clearTimeout(t);
  }, [escena]);

  function irA(s) {
    const k = keyDeEscena(s), max = document.documentElement.scrollHeight - window.innerHeight;
    const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: (k / (paradas - 1)) * max, behavior: reducido ? "auto" : "smooth" });
  }

  useEffect(() => {
    const onKey = (e) => {
      const paso = e.key === "ArrowDown" || e.key === "PageDown" ? 1 : e.key === "ArrowUp" || e.key === "PageUp" ? -1 : 0;
      if (!paso) return;
      e.preventDefault();
      irA(Math.min(ESCENAS.length - 1, Math.max(0, escena + paso)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [escena]);

  if (falla) {
    return (
      <main className="recorrido recorrido-texto">
        <Barra />
        {ESCENAS.map((e) => <section key={e.tick}><p className="rc-eyebrow">{e.eyebrow}</p><h2>{e.titulo}</h2><p>{e.texto}</p></section>)}
        <p className="rc-nota">{textos.sin_3d}</p>
      </main>
    );
  }

  const e = ESCENAS[visible];
  return (
    <main className="recorrido">
      <div className="rc-escenario" aria-hidden="true"><canvas ref={canvasRef} /></div>
      <Barra />
      <section className={`rc-copy${visible !== escena ? " fuera" : ""}`} aria-live="polite">
        <p className="rc-eyebrow">{e.eyebrow}</p>
        <h1>{e.titulo}</h1>
        <p className="rc-lede">{e.texto}</p>
        {e.cta && <a className="rc-pill rc-cta" href="/">{textos.cta}</a>}
      </section>
      <ol className="rc-ticks" aria-label="Escenas">
        {ESCENAS.map((x, i) => (
          <li key={x.tick}>
            <button type="button" onClick={() => irA(i)} aria-current={i === escena ? "step" : undefined} aria-label={`Ir a ${x.tick}`}>
              <span>{x.tick}</span><i />
            </button>
          </li>
        ))}
      </ol>
      <div className={`rc-pista${bajo ? " fuera" : ""}`}>{textos.pista}</div>
      <div className="rc-chip">
        {estado.trazando ? `Trazado de luz · ${estado.muestras ?? 0} muestras` : estado.fps ? `Tiempo real · ${estado.fps} fps` : ""}
      </div>
      <div className={`rc-loader${listo ? " listo" : ""}`} role="status">
        <span>{carga.msg}</span>
        <b>{carga.pct}</b>
        <div className="rc-linea"><i style={{ width: `${carga.pct}%` }} /></div>
      </div>
      <div className="rc-riel" style={{ height: `${(paradas - 1) * 95 + 100}vh` }} />
    </main>
  );
}

function Barra() {
  return (
    <header className="rc-barra">
      <a className="rc-marca" href="/"><img src={mark} alt="" /><span>SOMA<small>{textos.marca}</small></span></a>
      <a className="rc-pill" href="/#contacto">{textos.visita}</a>
    </header>
  );
}
