"""Trabajos por lote: procesos que corren fuera de una peticion HTTP.

Un cron ejecuta estos comandos; no hay `Request`, asi que el `request_id` que
correlaciona los logs se genera aca. Ver `run_id()` en `context.py`.
"""
