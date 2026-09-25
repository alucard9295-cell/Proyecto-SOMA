---
name: soma-verificar
description: Usar al levantar SOMA en local, probar el asesor o el copiloto, desplegar a Cloudflare o comprobar producción. Dice qué servidor usar para cada prueba, qué preparar antes y qué acciones necesitan permiso del usuario, para no gastar llamadas descubriéndolo otra vez.
---

# Verificar SOMA (Worker en Cloudflare)

Cada paso de esta lista ya costó al menos una llamada fallida. Seguir el orden.

## Qué servidor para qué prueba

| Prueba | Servidor | Por qué |
| --- | --- | --- |
| UI, simulador, rutas sin IA | `npx vite preview --port 4173` | Rápido, sirve `dist/` |
| Asesor o copiloto (Workers AI) | `npx wrangler dev --port 8787 --ip 127.0.0.1` | `vite preview` **no** corre el binding `AI` remoto: responde `Binding AI needs to be run remotely` y la UI muestra "El asistente no está disponible" |
| Lógica del Worker | `npx vitest run` | 122+ tests, proyectos node y workers |

Ambos servidores sirven el build: **`npm run build` antes de arrancarlos**; si no, se prueba el código viejo.
**Reconstruir con `wrangler dev` vivo lo rompe en Windows:** el build borra `dist/`, el watcher muere
con `EPERM ... watch dist\client\assets\...` y el servidor responde 404 en `/`. Tras cada
`npm run build`, parar el servidor por puerto y relanzarlo (no basta el recargado automático).
**`vite preview` también:** tras reconstruir sigue sirviendo el `index.html` viejo, que pide CSS con
el hash anterior (500) y la página no monta. Mismo remedio: relanzar tras cada build.
**Las cabeceras de `public/_headers` (CSP) solo las aplica `wrangler dev`/producción**, no `vite
preview`: un iframe o script bloqueado por CSP no se ve en preview.

## Antes de arrancar

1. **Migraciones locales.** La D1 local no se migra sola. Tras añadir un archivo en `migrations/`:
   `npx wrangler d1 migrations apply soma --local`. Síntoma si falta: 500 con `no such table` en el log.
2. **Puertos.** Lanzar el servidor con `run_in_background` y salida a `.tmp/<nombre>.log`. Para
   pararlo, `TaskStop` **no basta en Windows** (mata `npx`, no el `node` hijo): liberar por PID con
   `Get-NetTCPConnection -LocalPort <p> -State Listen` + `Stop-Process` (ver `windows-dev`).
   Hacerlo *antes* de relanzar; `--strictPort` falla con "Port already in use" si no.
   **Con `wrangler dev` el dueño del puerto es `workerd`, y el `node` de wrangler lo relanza** con otro
   PID al matarlo: parar el padre (`(Get-CimInstance Win32_Process -Filter "ProcessId=$id").ParentProcessId`)
   y después el `workerd`.
3. **Esperar a que responda** con un bucle `curl` sobre `/`, no con `sleep` fijo.

## Probar el asesor sin navegador

El endpoint habla AG-UI; con `curl` se ve qué decide el modelo:

```bash
curl -s -N -X POST $U/api/sales/asesor -H 'content-type: application/json' \
  -d '{"threadId":"t","runId":"r","messages":[{"id":"1","role":"user","content":"..."}],"tools":[{"name":"llenar_simulador"}],"context":[]}' \
  | grep -E 'TOOL_CALL_ARGS|TEXT_MESSAGE_CONTENT'
```

`"tools":[{"name":...}]` es obligatorio: el Worker solo ofrece las tools que el cliente anuncia.
Casos que ya fallaron y conviene repetir: unidades fuera de 1-4/6, "acabados buenos", mensaje
sin área, "¿qué es un APU?" (una de las sugerencias del propio asesor).

## Chequeos rápidos

- Tipos: `npm run typecheck` (dos tsconfig: `.` y `tsconfig.node.json`); `tsc -p worker` no existe.
- Buscar en el repo con la herramienta Grep y un `glob` (`{worker/**,src/**}`), nunca `grep -r .`
  desde la raíz: recorre `node_modules` y `.wrangler` y se cuelga más de 2 minutos.

## Probar en navegador (flujo completo)

`node tools/e2e/seccion.mjs <url> "<selector>" <salida.png> [ancho]` captura una sección (390 para
móvil) e imprime los errores de consola, incluidas violaciones de CSP.

`node tools/e2e/asesor.mjs <url> "<pregunta>" <salida.png>` con Chrome headless en el 9222
(`--remote-debugging-port=9222 --user-data-dir=<scratchpad>`). Ver la captura con Read. El
render de Streamdown es solo cliente: el SSR sale vacío, no sirve para verificar markdown.

## Producción

- URL: `https://soma.mireya-compromisos.workers.dev`.
- Orden: `npm run build` → `npx wrangler d1 migrations apply soma --remote` (si hay migración
  nueva) → `npx wrangler deploy`.
- Humo: `/` 200; `/admin` y `/api/admin/*` 302 al login de Access (ver abajo);
  `POST /api/sales/simulation` devuelve el escenario. `/api/health` no
  existe en el Worker: 404 es esperado.
- **Permisos.** El modo auto bloquea `--remote`, `deploy`, `secret put` y crear recursos de
  cuenta. Con la regla `Bash(npx wrangler:*)` en `/permissions` pasan. Crear la organización de
  Zero Trust (Access) la bloquea aunque vaya por el MCP de Cloudflare: la activa el usuario en
  el dashboard. No reintentar por otra vía.
- **Access por el MCP: solo lectura.** El token del MCP lee `access/organizations|apps|
  identity_providers`, pero todo POST ahí devuelve `1010: undefined` (le falta el permiso de
  escritura de Access). Wrangler no tiene comandos de Access. La app y la política se crean en el
  dashboard: con permiso del usuario, Claude lo hace por la extensión de Chrome. El dashboard de
  Zero Trust vive en `dash.cloudflare.com/<cuenta>/one/...` (`access-controls/apps`,
  `integrations/identity-providers`); los enlaces `one.dash.cloudflare.com/.../settings/...` dan
  404. Luego se lee el `aud` por el MCP (GET sí funciona). Renombrar el team (`PUT organizations`)
  lo bloquea el clasificador. El team real es `divine-bread-e664.cloudflareaccess.com`.
- **App de Access "SOMA control room"** (autoalojada, destinos por ruta
  `soma.mireya-compromisos.workers.dev/admin` y `/api/admin`): protege solo esas rutas y deja la
  portada pública. **No** usar "Enable Cloudflare Access" en el Worker: protege todo el Worker.
  Tarda unos minutos en aplicarse; recién creada, `/admin` sigue dando 200.
  Humo con Access: `/` 200; `/admin` y `/api/admin/me` 302 a `divine-bread-e664.cloudflareaccess.com`.
- R2 no está habilitado en la cuenta (error 10042 al crear bucket): se activa en el dashboard.

## Ruido conocido (no investigar)

- CSP `script-src eval` desde `content-schema-*.js`: es un zod v3 que CopilotKit trae por dentro;
  prueba `Function("")`, cae a modo sin eval y sigue. El `z.config({ jitless: true })` de
  `Asistente.jsx` solo cubre nuestro zod.
- "Default inspector port 9229 not available": otro proceso de node, inofensivo.
