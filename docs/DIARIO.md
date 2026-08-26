---
type: Runbook
title: Diario de trabajo (lenguaje llano)
description: Registro tarea a tarea, en español simple, de lo que se hace en SOMA para que el dueño del producto pueda seguirlo sin leer ADRs.
tags: [soma, diario, seguimiento]
status: draft
generated: { by: claude-code/sonnet-5, at: 2026-08-24T00:00:00Z }
---

# Qué es esto

Complemento de [log.md](log.md). `log.md` registra decisiones técnicas por
día; este archivo registra **tareas**, en español simple, para que el dueño
del producto pueda calibrar sin necesitar contexto de ingeniería. Se
actualiza al cerrar cada tarea, no al final de la sesión.

# 2026-08-24

- **Pregunta:** si existe una forma estándar de mantener actualizado el
  contexto del proyecto (CLAUDE.md) y un registro tipo "rastro" cuando se
  trabaja en varias ventanas de Claude Code a la vez.
  **Qué se hizo:** se buscó en internet qué hacen otras herramientas
  (memoria automática de Claude Code, patrón "Memory Bank" de Cline/Cursor,
  mensajería entre sesiones). Se descubrió que `Proyecto-SOMA` ya tiene su
  propio autodiagnóstico de harness (`SOMA-HARNESS.md`), escrito hoy por la
  otra ventana que está trabajando en el proyecto.

- **Pregunta:** si el "DeepSeek Harness" que se anunció recientemente sirve
  para este proyecto.
  **Qué se hizo:** se confirmó que es real (liberado el 17 de agosto de
  2026, MIT, en preview de desarrollador). Recomendación: no integrarlo en
  SOMA todavía — el proyecto ya arrastra dos harnesses duplicados (Claude
  Code y OpenCode, ver brecha G3 en `SOMA-HARNESS.md`) y añadir un tercero
  agrava ese problema. Se probó en una carpeta aparte
  (`_sandbox/deepseek-harness`), fuera de SOMA, solo para conocerlo.

- **Pregunta:** qué le falta a la app y cuáles son los próximos pasos.
  **Qué se hizo:** se leyó `SOMA-EVALUATION-2026-08-24.md` y
  `SOMA-HARNESS.md`, y luego la otra ventana corrigió dos datos que ya
  estaban desactualizados en esta primera lectura (ver nota abajo).
  Lo que de verdad sigue pendiente, confirmado por esa sesión:
  - El token de sesión se guarda de forma que un ataque XSS podría leerlo.
    Falta moverlo a una cookie protegida (planificado en un ADR, aún sin
    implementar a propósito).
  - La app corre bien en la computadora local (incluido Docker, ya
    verificado de punta a punta), pero **nunca se ha desplegado de verdad**
    a un servidor real.
  - Ya **no** es cierto que la fórmula de costo estuviera duplicada entre
    pantalla y backend, ni que listar 50 presupuestos abriera 101
    conexiones a la base de datos — la otra ventana ya lo corrigió hoy
    mismo (commit `7f293ed`).

- **Nota:** los últimos 3 commits de la otra ventana (no 2 como se pensó al
  principio) todavía no estaban reflejados en `log.md`/`index.md`. Se avisó
  a esa sesión antes de tocar esos archivos; confirmó que no los estaba
  editando y aportó los detalles exactos de cada commit. Ya quedaron
  agregados a `log.md`. Lección para el diario: cuando dos ventanas tocan
  el mismo proyecto, preguntar antes de escribir evita pisar trabajo y trae
  correcciones que uno solo no tenía.
