---
name: soma-data-layer
description: Usar al agregar o modificar tablas, migraciones, repositorios o cualquier acceso a datos en el API de SOMA (api/src/soma_api/). Cubre el patrón migrations + repositories y las reglas de clasificación de tablas (medallón, maestras, transaccionales, log).
---

# Capa de datos de SOMA

Dos reglas absolutas: **el esquema solo cambia por migraciones** y **el SQL solo
vive en repositorios**. Una ruta que abre una conexión es un bug de arquitectura.

## Agregar una tabla

1. Escribe una función en `api/src/soma_api/migrations.py`:

```python
def _create_<nombre>(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS <nombre> (
            <col> ... 
        )
        """
    )
```

2. Regístrala al final de `MIGRATIONS` con la **siguiente versión libre**. Nunca
   renumeres ni edites una migración ya aplicada — agrega una nueva.

```python
MIGRATIONS: tuple[Migration, ...] = (
    ...,
    (7, "create_<nombre>", _create_<nombre>),
)
```

3. `CREATE TABLE IF NOT EXISTS` siempre: preserva bases creadas antes de que
   existieran las migraciones.

4. Si la tabla debe existir para que el servicio se considere sano, agrégala a
   `REQUIRED_TABLES` en `database.py` (esto alimenta `/ready`).

## Agregar acceso a datos

Un repositorio por agregado, en `repositories.py`. **Hereda de `_Repository` y
usa `self._conn()`** — nunca `with connect(...)` directo:

```python
class <X>Repository(_Repository):
    def get(self, id: int) -> sqlite3.Row | None:
        with self._conn() as connection:
            return connection.execute("SELECT ...", (id,)).fetchone()
```

`_Repository._conn()` reutiliza la conexión inyectada si existe, y solo abre una
nueva cuando no la hay. Ojo al editar: la única llamada a `connect()` que debe
quedar es la de `_Repository` misma. Un reemplazo global de `connect(` por
`self._conn(` la reescribe también a ella y provoca recursión infinita.

### Por qué existe `_Repository`: el N+1

La primera versión abría `with connect(...)` en cada método. Medido: **101
conexiones para listar 50 APUs** (1 del listado + 2 por APU). Con la unidad de
trabajo bajó a **2**.

Cuando una ruta hace varias llamadas al repositorio, envuélvelas:

```python
with unit_of_work(database_path) as uow:
    apus = uow.apus.list_all()
    detalles = uow.apus.get_details_many([a["id"] for a in apus])
```

Dos reglas que se derivan de esto:

- **Nunca consultes dentro de un bucle.** Si necesitas datos de N filas, el
  repositorio expone un método `..._many(ids)` con un solo `IN (?)`. Ver
  `ApuRepository.get_many()` / `get_details_many()`.
- **Atomicidad:** si una operación escribe en varias tablas (un APU y sus
  detalles), es **un solo método** con **una sola** conexión. Repartirla en
  varias llamadas rompe la transacción. Ver `ApuRepository.save()`.

**Errores:** los repositorios no lanzan `HTTPException` — eso acopla dominio a
HTTP. Devuelven `None` o un valor vacío y la ruta traduce a status code.

## Clasificación de tablas

Al crear una tabla, decide su clase y respétala:

| Clase | Regla | Ejemplos |
| --- | --- | --- |
| **Maestra** | Mutable, sin historia, clave natural única | `insumos_maestros`, `users` |
| **Transaccional** | Append-only en operación normal; no se edita el pasado | `facturas`, `proyecto_partidas` |
| **Log/auditoría** | Solo INSERT. Nunca UPDATE ni DELETE. Índice por fecha | `audit_events` |
| **Derivada** | Recalculable desde otras tablas; se puede truncar y reconstruir | `proyecto_resultados` |

Capas medallón (**solo** para el flujo de facturas/documentos, ver
`SOMA-DATA-GOVERNANCE`): `bronze` = documento crudo inmutable, `silver` = ítems
parseados y normalizados, `gold` = agregados de consulta.

Las tablas operativas (`users`, `audit_events`, `schema_migrations`) **no**
llevan capa medallón.

## Verificar

```powershell
uv run --directory api pytest
```

`test_database_migrations.py` valida que las migraciones son idempotentes y
preservan datos previos. Deriva la lista esperada de `MIGRATIONS` — no la
hardcodees.
