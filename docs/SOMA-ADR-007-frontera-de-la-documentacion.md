---
type: Architecture Decision Record
title: Frontera de la documentación — qué se versiona y qué se queda en la máquina
description: Decide que el bundle OKF de SOMA vive en el repositorio y por qué la doctrina transversal y la infraestructura de memoria del agente se quedan deliberadamente fuera.
tags: [soma, adr, documentacion, okf, harness, versionado]
status: draft
generated: { by: claude-code/opus-5, at: 2026-08-26T00:00:00Z }
sources:
  - id: index
    resource: /index.md
    title: SOMA knowledge bundle
  - id: harness
    resource: /SOMA-HARNESS.md
    title: Harness de ingeniería
---

# ADR-007: Frontera de la documentación

**Estado:** aceptada

**Fecha:** 2026-08-26

# Contexto

Hasta hoy el bundle OKF de SOMA vivía en `C:\proyectos_ia\docs`, una carpeta del
disco fuera de todo control de versiones. Veinticuatro archivos —ADRs, PRD,
auditorías, diagramas— sin historia, sin respaldo, sin forma de revisarlos en un
PR y sin manera de saber qué versión del código describían.

El problema no era solo la falta de respaldo. Era que la documentación y el
código podían divergir sin que nada lo delatara: un ADR podía describir una
arquitectura que el repositorio ya había abandonado tres commits atrás, y nadie
lo notaba porque no había un diff que lo mostrara.

Al mover el bundle apareció la pregunta de fondo: **no todo lo que estaba en esa
carpeta es de SOMA.** Mezclados con los ADRs había documentos que aplican a
cualquier proyecto de la máquina. Mover el bloque entero al repositorio habría
resuelto el versionado creando un problema peor.

# Decisión

Se parte el bundle en dos, según **a qué le pertenece cada documento**:

| Contenido | Dónde vive | Por qué |
| --- | --- | --- |
| ADRs, PRD, auditorías, planes, diagramas de SOMA | `docs/` de este repositorio | Describen este código; deben viajar con él |
| Doctrina de harness (presupuesto de contexto, routing por capas, protocolos de agentes) | `C:\proyectos_ia\docs` y `~/.claude/` | Aplica a todos los proyectos, no a SOMA |
| Stack de sincronización de memoria del agente (engram) | `C:\proyectos_ia\infra\engram` | Infraestructura de la máquina, y contiene secretos |

El criterio es uno solo: **la documentación viaja con lo que documenta.** Un
documento pertenece al repositorio si describe el código del repositorio, y no
pertenece si describe la máquina, el entorno o la forma de trabajar.

Se movió, no se copió. Una copia en cada sitio habría reintroducido exactamente
la divergencia silenciosa que este ADR busca eliminar.

# Por qué la parte transversal se queda fuera

Tres razones, en orden de peso:

1. **Alcance.** `HARNESS-DOCTRINE.md` describe cómo se reparte el trabajo entre
   herramientas, subagentes y flujos deterministas en *cualquier* proyecto.
   Guardarlo en el repositorio de SOMA implicaría que quien trabaje en otro
   proyecto tiene que clonar SOMA para leer una regla que no es de SOMA.

2. **Ciclo de vida distinto.** La doctrina cambia cuando cambia la forma de
   trabajar; los ADRs de SOMA cambian cuando cambia SOMA. Atarlos al mismo
   historial mezcla dos ritmos que no tienen relación, y ensucia el log del
   repositorio con commits que no tocan el producto.

3. **Superficie de secretos.** El stack de engram (`docker-compose.yml`, token
   de sincronización, credenciales de Postgres) es infraestructura personal.
   Colgarlo del repositorio de un producto compartido pone secretos de la
   máquina a un `git add -A` distraído de distancia. La separación física es
   más barata que confiar en un `.gitignore`.

La contrapartida está asumida: la parte transversal sigue sin versionar. Es
deuda conocida, y se salda con su propio repositorio, no metiéndola aquí.

# Consecuencias

- `docs/index.md` es el punto de entrada del bundle y se lee directo en GitHub.
- La sección «Doctrina transversal» del índice ya no enlaza al documento: explica
  dónde está y por qué no está aquí. Un enlace roto habría sido peor que una nota.
- Las referencias a la ruta vieja quedaron actualizadas en `CLAUDE.md`, en la
  skill `soma-docs-okf` y en el `CLAUDE.md` global de la máquina.
- Cambiar documentación ahora pasa por PR, igual que el código. Es más fricción
  por documento y es intencional: un ADR que nadie revisó es una opinión.
- Los diagramas incrustados son Mermaid y renderizan en GitHub sin herramientas.

# Rechazado

- **Un repositorio de documentación aparte para SOMA.** Separa el ADR del commit
  que lo implementa, que es justo el vínculo que se quería recuperar. Dos
  repositorios para un producto de un solo equipo es coordinación sin beneficio.
- **Dejar el bundle en el disco y solo respaldarlo.** Resuelve la pérdida de
  datos, no la divergencia: seguiría sin haber diff, sin revisión y sin forma de
  atar un documento a una versión del código.
- **Subir el bloque entero, doctrina incluida.** Es la opción cómoda y la que
  crea el acoplamiento descrito arriba.
- **Un submódulo de git para la parte transversal.** Resolvería el versionado a
  cambio de un mecanismo que hay que recordar mantener. No paga a un solo usuario.

# Verificación

Esta decisión se considera aplicada cuando:

1. `docs/index.md` se abre en GitHub y todos sus enlaces internos resuelven.
2. Ningún documento del repositorio remite al lector a la carpeta vieja para
   encontrar algo que ahora está aquí. Nombrarla al explicar la decisión, como
   hace este ADR, no cuenta.
3. `C:\proyectos_ia\docs` contiene únicamente lo transversal.
4. Un `git status` en la raíz del repositorio no muestra ningún archivo con
   secretos de la máquina.
