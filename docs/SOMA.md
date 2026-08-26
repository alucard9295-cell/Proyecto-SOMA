---
type: Architecture Guide
title: SOMA arquitectura y despliegue
description: Estado operativo, limites de despliegue y decisiones base de SOMA.
tags: [soma, architecture, deployment]
status: stable
generated: { by: human:product-soma, at: 2026-08-11T00:00:00Z }
---

# SOMA: arquitectura y despliegue

**Estado:** inicial, autenticacion y control plane implementados

**Repositorio:** `C:\proyectos_ia\arquitectura\Proyecto-SOMA`

**Ultima revision:** 2026-08-08

## Resumen ejecutivo

SOMA se mantiene como un monorepo con dos unidades de despliegue:

| Unidad | Ubicacion | Responsabilidad | Destino recomendado |
| --- | --- | --- | --- |
| Web | raiz del repositorio | React/Vite, landing publica y control room | Vercel |
| API | `api/` | FastAPI, autenticacion, SQLite y futuros modulos | Docker en un host con volumen persistente |

Esta separacion evita colocar secretos o estado mutable en el frontend. No es
necesario crear dos repositorios para tener dos despliegues: Vercel puede usar la
raiz como proyecto web y el API puede construirse desde `api/`. Se creara un
repositorio separado solo si el ciclo de vida, el equipo o los permisos del API
dejan de coincidir con los del producto web.

## Contexto observado

- El frontend ya tiene `src/` y su entrada es `src/main.jsx`.
- `src/App.jsx` esperaba un FastAPI en el puerto `8767`, pero ese backend no
  estaba presente en este repositorio ni en el workspace revisado.
- `C:\proyectos_ia\personales\flask` es otro proyecto Flask de productos y no
  implementa el contrato de SOMA.
- El API nuevo vive en `api/src/soma_api` y usa `uv` como gestor de proyecto.
- La carpeta `dist/` es salida generada y no debe versionarse.

## Flujo de autenticacion

1. El usuario envia `username` y `password` a `POST /api/admin/login`.
2. El API busca el usuario en SQLite usando una consulta parametrizada.
3. La contrasena se verifica contra un hash `scrypt`; nunca se compara ni se
   persiste en texto plano.
4. El API devuelve un token firmado con expiracion de ocho horas.
5. El frontend guarda el token en `sessionStorage` y lo envia como `Bearer`.
6. Los endpoints administrativos validan la firma, la expiracion y que el
   usuario siga activo en SQLite.

### Cuenta de desarrollo

La cuenta solicitada se crea con:

```powershell
uv run --directory api python -m soma_api.bootstrap_admin --username admon --password 1234
```

Esto es solo una credencial local de arranque. Debe rotarse antes de cualquier
entorno compartido o productivo. La base local queda en `api/data/` y esta
excluida de Git.

## Contrato actual del API

| Metodo | Ruta | Estado | Proteccion |
| --- | --- | --- | --- |
| `GET` | `/health` | implementado | publica |
| `POST` | `/api/admin/login` | implementado | publica |
| `GET` | `/api/admin/me` | implementado | Bearer |
| `GET` | `/api/admin/summary` | implementado, datos vacios | Bearer |
| `POST` | `/api/pipeline/process` | pendiente | Bearer |
| `POST` | `/api/rag/index` | pendiente | Bearer |
| `POST` | `/api/rag/query` | pendiente | Bearer |
| `POST` | `/api/chat` | pendiente | Bearer o publica segun producto |
| `GET` | `/api/report/excel` | pendiente | Bearer |

El frontend puede iniciar sesion y cargar un resumen vacio. Las pantallas de
facturas, RAG y Excel requieren una segunda fase de implementacion, con sus
modulos de dominio y migraciones de datos, antes de considerarse productivas.

## Persistencia

SQLite es adecuado para el comienzo y para una instancia pequena del API:

- `users` contiene identidad, rol, estado y hash de contrasena.
- La ruta se controla con `DATABASE_PATH`.
- Docker monta un volumen llamado `soma_data` en `/app/data`.
- El archivo SQLite no se commitea ni se copia a Vercel.

Cuando existan multiples replicas, escrituras concurrentes frecuentes o
necesidad de backups administrados, migrar la fuente de verdad a Postgres. El
modelo de modulos y los endpoints deben aislar el acceso a datos para que esa
migracion no afecte a React.

## Desarrollo local

### API

```powershell
cd C:\proyectos_ia\arquitectura\Proyecto-SOMA
Copy-Item api\.env.example api\.env
uv sync --directory api
uv run --directory api python -m soma_api.bootstrap_admin --username admon --password 1234
uv run --directory api uvicorn soma_api.main:app --app-dir src --reload --port 8000
```

### Web

```powershell
npm install
npm run dev
```

La web usa `http://127.0.0.1:8000` por defecto. Para otro origen, definir
`VITE_API_BASE` en el `.env` de la raiz. Las variables `VITE_*` son publicas y
no pueden contener claves de proveedores ni secretos del API.

### Docker

Docker no estaba instalado en la maquina revisada. En una maquina con Docker:

```powershell
Copy-Item api\.env.example api\.env
docker compose up --build
```

El servicio queda en `http://127.0.0.1:8000` y el volumen preserva SQLite entre
reinicios. Para produccion, usar un volumen administrado y backups probados.

## Despliegue

### Vercel: web

1. Importar el repositorio `alucard9295-cell/Proyecto-SOMA`.
2. Usar la raiz del repositorio como Root Directory.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Definir `VITE_API_BASE` en Preview y Production apuntando al dominio HTTPS
   del API.
6. Configurar rewrite de SPA si se necesitan rutas directas como `/ventas`.

Vercel puede ejecutar Python, pero su filesystem no debe tratarse como disco
persistente para SQLite. Ademas, cargas PDF, embeddings y procesos largos deben
evaluarse contra los limites de funciones antes de moverlos a serverless.

### API: Docker

El API debe desplegarse como contenedor en un proveedor que ofrezca:

- volumen persistente para `/app/data`,
- HTTPS y dominio estable,
- variables secretas,
- logs y health checks,
- rollback de imagen,
- backups del volumen o de la base.

El `Dockerfile` usa la imagen de `uv` de Astral para resolver dependencias de
forma reproducible. `JWT_SECRET`, `DATABASE_PATH`, `CORS_ORIGINS` y las claves
de IA viven solo en el entorno del API.

## CI/CD minimo

Cada Pull Request debe ejecutar:

```powershell
npm run build
uv run --directory api pytest
```

El despliegue web puede ser automatico desde GitHub hacia Vercel. El despliegue
del API debe construir una imagen desde `api/`, ejecutar smoke tests contra
`/health`, y solo despues cambiar el servicio de produccion. La base de datos no
se versiona como archivo: el esquema debe evolucionar mediante migraciones
repetibles.

## Seguridad y operacion

- No commitear `.env`, `api/data/`, tokens ni dumps de SQLite.
- Cambiar la cuenta `admon` y `JWT_SECRET` antes de compartir el API.
- Restringir `CORS_ORIGINS` al dominio real de Vercel en produccion.
- Anadir rate limiting y auditoria de login antes de exponer el panel.
- No devolver si un usuario existe; el login usa un error generico.
- Configurar alertas para errores 5xx, latencia, disco del volumen y fallos de
  backups.
- Documentar un procedimiento de restauracion y probarlo periodicamente.

La referencia operativa sigue el enfoque de Google SRE: automatizar cambios,
definir objetivos observables, preparar playbooks y registrar incidentes. La
fuente consultada es el [SRE Book de Google](https://sre.google/sre-book/), en
particular sus capitulos sobre objetivos de servicio, monitoring, release
engineering y data integrity.

## Estado del backlog

1. **Hecho:** auth SQLite, JWT, headers, host allowlist, rate limits y proxy SSE.
2. **Hecho:** agente LangGraph con proveedor por `.env`, fallback sin clave y
   contrato SSE para ventas.
3. **Hecho:** simulador YAML con presupuesto, ROI anual y payback; faltan datos
   locales verificados y cotizaciones reales.
4. **Pendiente:** implementar `pipeline`, `rag`, `reports` y chat administrativo.
5. **Pendiente:** elegir proveedor Docker con volumen, backups, alertas y WAF.
6. **Parcial:** GitHub Actions ya valida web, API y build Docker; falta conectar
   un registry/deploy de imagen y secrets del entorno.
7. **Pendiente:** definir checkpointer y retencion si se requiere memoria
   conversacional persistente.
8. **Pendiente:** ejecutar Lighthouse, ZAP, Nuclei y sitespeed.io contra una
   instancia accesible; sus herramientas no se descargan dentro del repo.

## Referencias externas

- [Gentle-AI](https://github.com/Gentleman-Programming/gentle-ai): memoria,
  skills y workflows para agentes de desarrollo.
- [uv: proyectos](https://docs.astral.sh/uv/guides/projects/): estructura,
  lockfile y ejecucion reproducible.
- [Vercel: backends](https://vercel.com/docs/frameworks/backend): opciones de
  FastAPI y limites del modelo serverless.
- [Vercel: Python runtime](https://vercel.com/docs/functions/runtimes/python):
  entrypoints y dependencias.
- [GitHub: duplicar repositorios](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository):
  referencia para separar repositorios si la organizacion lo requiere.
