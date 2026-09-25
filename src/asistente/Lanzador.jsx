// Boton flotante que carga el asistente solo cuando se pide: CopilotKit pesa
// ~500 kB gzip y la mayoria de visitas nunca abre el chat.
import { lazy, Suspense, useState } from "react";
import copy from "../content/site.yaml";

// Aqui y no en Asistente.jsx: el simulador lo escucha sin cargar CopilotKit.
export const SIMULADOR_EVENTO = "soma:llenar-simulador";

const Asistente = lazy(() => import("./Asistente.jsx"));

export default function Lanzador({ tipo }) {
  const [activo, setActivo] = useState(false);
  if (activo) return <Suspense fallback={<span className="button button-dark asistente-lanzador">{copy[tipo].titulo}...</span>}><Asistente tipo={tipo} /></Suspense>;
  return <button type="button" className="button button-dark asistente-lanzador" onClick={() => setActivo(true)}>{copy[tipo].titulo}</button>;
}
