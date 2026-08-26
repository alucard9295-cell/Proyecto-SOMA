---
type: Audit Report
title: SOMA evaluacion externa 2026-08-08
description: Resultados de rendimiento, seguridad y pruebas dinamicas de SOMA.
tags: [soma, audit, security, performance]
status: stable
generated: { by: process:soma-audit-2026-08-08, at: 2026-08-08T00:00:00Z }
---

# SOMA: evaluacion externa

**Fecha:** 2026-08-08

**Workspace de herramientas:** `C:\Users\Asus\AppData\Local\Temp\opencode\soma-audit`

Las herramientas y reportes de esta evaluacion se mantuvieron fuera de
`Proyecto-SOMA`, como se solicito.

## Alcance

Se probaron localmente:

- frontend en `http://127.0.0.1:4173/ventas` usando el build de produccion;
- API en `http://127.0.0.1:8000`;
- agente en `/api/agui/architect`;
- simulador en `/api/sales/simulation`;
- headers, host allowlist y login mediante pytest/TestClient.

## Lighthouse / Chrome

Lighthouse 13.4.1 se ejecuto con Microsoft Edge en modo Chromium porque Chrome
no estaba instalado. El reporte JSON esta fuera del repo.

| Categoria | Resultado |
| --- | ---: |
| Performance | 86 |
| Accessibility | 95 |
| Best Practices | 77 |
| SEO | 100 |

El resultado de Best Practices en local queda afectado por HTTP; la medicion de
produccion debe hacerse con el dominio HTTPS de Caddy/Vercel. La auditoria
tambien detecto inyeccion de Kaspersky en el navegador local, por lo que sus
requests no representan el bundle publicado.

Mejoras aplicadas durante la auditoria:

- meta description;
- `robots.txt` para no indexar el login/control room;
- favicon SVG;
- conversion de `proyecto.png` de 2.56 MB a `proyecto.webp` de aproximadamente
  358 KB y eliminacion del PNG muerto.
- headers defensivos de Vercel para la web estatica.

## sitespeed.io

sitespeed.io 42.6.0 produjo reporte HTML externo con tres recorridos:

- TTFB promedio: 68 ms;
- First Paint promedio: 212 ms;
- DOMContentLoaded promedio: 192 ms;
- LCP promedio: 828 ms;
- CLS: 0;
- TBT: 0 ms.

El reporte indico un 404 de `favicon.ico` en la primera corrida; se agrego
`/favicon.svg` y el documento HTML ahora lo declara de forma explicita.

## Seguridad API

Pruebas automatizadas completadas:

- login correcto y resumen protegido;
- contraseña incorrecta devuelve 401;
- host no permitido devuelve 400;
- headers `nosniff`, `DENY`, `no-store` y CSP de frame ancestors;
- SSE devuelve `text/event-stream` y eventos de ejecucion;
- simulador rechaza valores negativos;
- rate limit de login y agente implementado.

ZAP, Nuclei y el proxy Docker no pudieron ejecutarse en esta maquina:

- Docker no esta instalado;
- Java no esta instalado para OWASP ZAP;
- Go/Nuclei no esta instalado.

No se instalaron esas herramientas dentro del repositorio. Para ejecutar la
fase dinamica en un entorno con Docker:

```powershell
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://api.example.com -r zap.html
docker run --rm projectdiscovery/nuclei:latest -u https://api.example.com -jsonl -o nuclei.json
```

Estos comandos requieren autorizacion explicita sobre el dominio y deben
ejecutarse contra una instancia de staging, nunca contra datos productivos sin
ventana de prueba.

## OWASP WSTG aplicado

| Area WSTG | Estado |
| --- | --- |
| Authentication testing | login, hash, 401 y rate limit cubiertos |
| Authorization testing | summary y `/me` exigen Bearer; ampliar al resto de modulos |
| Session management | JWT con `iss`, `aud`, `iat`, `nbf`, `exp`, `jti`; falta revocacion persistente |
| Input validation | Pydantic, limites numericos, body limit y mensajes acotados |
| Error handling | respuestas genericas para auth/agente; revisar logging productivo |
| API testing | CORS, host allowlist, SSE y endpoints publicos cubiertos |
| Client-side testing | Lighthouse y revisión de navegación completadas |
| Configuration/deployment | Caddy definido; falta validacion ZAP/Nuclei en staging HTTPS |

## Riesgos abiertos

1. El rate limiter actual es por proceso; en multiples replicas debe moverse a
   Redis, WAF o el proveedor edge.
2. JWT no tiene revocacion persistente; implementar denylist por `jti` o sesiones
   rotatorias antes de tener multiples administradores.
3. El agente real depende de `AGENT_API_KEY`; sin ella funciona el fallback, no
   el modelo externo.
4. `MCP_ENABLED` debe permanecer apagado hasta revisar el servidor y limitar sus
   herramientas a lectura.
5. El video de ventas sigue siendo el mayor recurso estatico, con unos 2.86 MB;
   debe comprimirse o cargarse bajo interacción si el rendimiento móvil cae.
