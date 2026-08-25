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

## El asesor

Vive en un globo flotante abajo a la derecha, no en una sección de la página, y
tiene botón de reiniciar conversación.

Si responde siempre lo mismo, no está roto: sin `AGENT_API_KEY` el agente usa el
fallback determinista a propósito. Verifica el entorno antes de depurar el
grafo.

## Verificar

```powershell
npm run build     # obligatorio antes de dar por hecho un cambio de frontend
```

Un cambio de frontend no está terminado hasta verlo renderizado. Para llenar
inputs de React con el navegador, `form_input` — `type` no dispara los eventos
que React escucha en inputs controlados.
