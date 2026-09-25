---
name: soma-frontend
description: Usar al tocar el frontend de SOMA (src/) — App.jsx, componentes, styles.css, textos de interfaz o navegación. Cubre la frontera front/backend, los textos en site.yaml y los bugs de navegación y CSS que ya ocurrieron.
---

# Frontend de SOMA

El front es **solo UX/UI y orquestación agéntica** (AG-UI de CopilotKit sobre
SSE). No calcula precios, no decide reglas, no duplica fórmulas. Si hace falta
una cifra, se le pide al API.

## Textos: `src/content/site.yaml`

Toda la copy vive ahí y entra por `@rollup/plugin-yaml`. Un literal en español
dentro de un `.jsx` es una regresión. Reglas del archivo:

- No describir funciones que no existan en el backend. La sección "Orientación"
  llegó a documentar Facturas, Chroma y DeepSeek, ninguno implementado.
- Tildes correctas. Las mayúsculas también llevan tilde (`SIMULACIÓN`).
- Etiquetas de formulario cortas: en dos columnas estrechas un texto largo se
  parte en tres líneas y el formulario deja de leerse.

## Superficie muerta: se oculta, no se deja fallar

Invariante 3 de `CLAUDE.md`. Una pantalla que llama una ruta inexistente se
oculta. `test_frontend_route_contract.py` lo vigila desde el backend.

Detalle de implementación: ese test lee `app.openapi()["paths"]`, **no**
`app.routes` — esta versión de FastAPI anida los routers incluidos en objetos
`_IncludedRouter` que no tienen `.path`.

Este test existe porque en un merge se resolvió un conflicto tomando el
"superset" de ambas ramas, sin notar que la *eliminación* en la otra rama era una
decisión deliberada. **Al resolver un conflicto, un borrado también es un
cambio**; si no sabes por qué se borró algo, averígualo antes de restaurarlo.

## Navegación

- `viewForPath()` deriva la vista de `window.location.pathname`, y hay un
  listener de `popstate`. Sin él, atrás/adelante del navegador y los botones
  laterales del ratón no hacen nada.
- `goTo("login")` consulta la sesión viva. Si mira una copia capturada al
  montar, volver de un módulo obliga a iniciar sesión otra vez.
- `const API = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000"` —
  `??`, no `||`. Con `||`, una cadena vacía (build de mismo origen detrás de
  Caddy) cae al default y rompe producción.

## CSS

`styles.css` es un solo archivo global sin módulos: **los nombres de clase
colisionan de verdad**. `.simulator-result` estaba definida dos veces, para el
simulador de ventas y para el de admin; la segunda ganaba en silencio.

Antes de crear una clase, `grep` el nombre. Prefija por sección
(`.sales-result`, `.sales-kpis`).

## Asistentes (asesor y copiloto)

CopilotKit v2 en un popup que carga `Lanzador.jsx` al primer clic. El contrato de
cada tool (descripción y esquema que ve el modelo) vive en
`worker/services/asistentes.ts`; el esquema de `Asistente.jsx` solo tipa el
handler y **debe coincidir** con el del Worker.

- **El asesor no dice "pulsa el botón".** `llenar_simulador` despacha
  `SIMULADOR_EVENTO` con `{ datos, listo }`; el simulador llena, llama al backend
  y resuelve `listo` con un resumen de cifras del backend, que es lo que muestra
  el chat. El popup tapa el panel de resultados en pantallas medianas: el
  resumen tiene que estar en el chat.
- **Los esquemas no restringen de más.** El selector de unidades aceptaba
  1/2/3/4/6 y el asesor no llenaba nada con "5 apartamentos"; el backend acepta
  1-1000. Antes de poner un enum en una tool, mirar qué valida la ruta.
- **Campos obligatorios en la tool** cuando el valor por defecto daría un cálculo
  engañoso (el área). Una llamada inválida se descarta en el Worker; si el turno
  queda vacío sale `perfil.respaldo`, que pide el dato.
- **Montos en pesos completos** y calidad mapeada desde lenguaje natural: van en
  el prompt del asesor; llama-3.3 no lo infiere solo.
- **Temas del asesor**: si el prompt dice "solo hablas de X", rechaza sus
  propias sugerencias (le pasó con "¿qué es un APU?").
- Los enlaces del markdown pasan por `rehype-harden` (mismo origen y `wa.me`).
- **El asesor comenta el escenario** (`followUp` por defecto en `llenar_simulador`). El
  navegador devuelve `{ entradas, resumen }`; el Worker (`perfil.resultados` →
  `escenarioParaModelo`) valida las entradas y **recalcula**: el modelo nunca lee texto del
  cliente. Cada escenario comentado gasta dos respuestas del tope diario.

### Estilo de la ventana (spec: `docs/design/chat.md`)

- Personalizar por slots de `CopilotPopup`: `header={{ children: (partes) => ... }}` (recibe
  `titleContent`, `closeButton`) y `messageView.cursor` (se ve mientras corre, antes del texto).
  `useAgent().agent.isRunning` da el estado para la cabecera.
- CSS por `[data-testid="copilot-*"]`, nunca por clases `cpk:*`. El CSS de CopilotKit carga
  después (lazy), así que las reglas llevan `html` delante para ganar especificidad; los
  colores se cambian redefiniendo sus variables (`--primary`, `--border`…) en
  `html [data-copilotkit]`.
- La bienvenida del popup es un `h1` dentro de `copilot-chat`: `copilot-welcome-screen` no
  existe en el popup. Ante la duda, inspeccionar el ancestro por CDP antes de escribir el selector.

## Formularios

Un `input type="number"` con 900000000 no se lee: debajo va la cifra con
`money()` (`.simulator-hint`).

## Verificar

Ver la skill `soma-verificar`: qué servidor usar (el asesor necesita
`wrangler dev`, no `vite preview`), migraciones locales y puertos.

```powershell
npm run build     # obligatorio antes de dar por hecho un cambio de frontend
```

Un cambio de frontend no está terminado hasta verlo renderizado. Para llenar
inputs de React con el navegador, `form_input` — `type` no dispara los eventos
que React escucha en inputs controlados.
