import copy from "../content/site.yaml";

export default function Guide() {
  const c = copy.orientacion;
  return <div className="panel-view module-view guide-view"><div className="module-heading"><span className="eyebrow">{c.eyebrow}</span><h1>{c.titulo_linea1}<br />{c.titulo_linea2} <em>{c.titulo_enfasis}</em></h1><p>{c.intro}</p></div><div className="guide-grid">{c.pasos.map((paso) => <article key={paso.eyebrow}><span>{paso.eyebrow}</span><h2>{paso.titulo}</h2><p>{paso.texto}</p><small>{paso.nota}</small></article>)}</div><div className="story-callout"><div><span className="eyebrow">{c.cierre_eyebrow}</span><h2>{c.cierre_titulo_linea1}<br />{c.cierre_titulo_linea2}</h2></div><p>{c.cierre_texto}</p></div></div>;
}
