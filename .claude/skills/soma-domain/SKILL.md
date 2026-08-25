---
name: soma-domain
description: Usar al tocar reglas de negocio de SOMA — cálculo de APU/AIU, duraciones, cronograma, ROI — o al agregar cualquier archivo bajo api/src/soma_api/domain/. Cubre la dirección de dependencias entre capas y la regla de dinero con Decimal.
---

# Dominio de SOMA

`domain/` es la única fuente de verdad de las reglas de negocio. No conoce
FastAPI, ni sqlite3, ni el proveedor de LLM, ni el sistema de archivos.

Dirección de dependencias (SOMA-ADR-003), de adentro hacia afuera:

```
domain/  ←  application  ←  infrastructure (repositories, database) + interface (routes)
```

`test_architecture_layering.py` lo verifica por AST y falla si el dominio importa
`fastapi`, `pydantic`, `sqlite3`, `yaml`, `os`, `langchain*`, `httpx`, o los
módulos internos `database`, `repositories`, `config`, `main`, `mcp`, `agent`.
No es una guía: es un test. Si necesitas romperlo, hace falta un ADR.

## Dinero: Decimal, nunca float

```python
from soma_api.domain.costing import money   # quantize a 2 decimales, ROUND_HALF_UP
```

Con float, un subtotal legítimo salía `26923.100000000002`. Un precio unitario
es un dato contable, no una medición física.

- Toda cifra monetaria pasa por `money()` **en cada paso**, no solo al final —
  redondear únicamente al cierre acumula deriva entre las partes del AIU.
- Los porcentajes entran como número (`12` = 12 %) y `_pct()` los divide entre
  100. No pases `0.12`.
- `float` solo se admite en el borde de serialización JSON, nunca en el cálculo.

## Un cálculo, una implementación

El AIU estuvo duplicado en JavaScript y en Python, y las dos versiones podían
diverger sin que nada avisara. Ahora `domain/costing.py` es la única copia y el
frontend pide el resultado a `POST /api/admin/apus/preview`.

**Regla: si el usuario ve una cifra antes de guardar, esa cifra la calculó el
backend.** El frontend no reimplementa una fórmula para dar respuesta inmediata.
`test_apu_preview_contract.py` comprueba que la vista previa y el precio guardado
coinciden en las tres bases de IVA.

Aplica igual al agente: el LLM puede leer y explicar cifras, nunca producirlas
(invariante 5 de `CLAUDE.md`).

## Casos borde que ya mordieron

- `partida_duration()` redondea **hacia arriba** y devuelve mínimo 1 día: media
  jornada ocupa un día de obra.
- Rendimiento ≤ 0 lanza `ValueError`, no devuelve infinito ni 0.
- La base del IVA es configurable (`directo`, `subtotal`, `utilidad`). Si llega
  un valor desconocido, cae a `utilidad` — el default colombiano.

## Verificar

```powershell
uv run --directory api pytest      # 58 tests
```
