"""Contrato frontend <-> API.

La Fase 0 exige que el frontend no llame rutas que el API no implementa. Esa
regla se rompio una vez en un merge sin que nada lo detectara, asi que aqui se
verifica sola: si alguien agrega un fetch a una ruta inexistente (o borra una
ruta que el frontend usa), la suite falla.
"""

from pathlib import Path
import re

from soma_api.main import app


REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = REPO_ROOT / "src"

# Captura "/api/..." y `/api/...` en el codigo del frontend.
API_LITERAL = re.compile(r"""["'`](/api/[^"'`]*)["'`]""")


def _shape(path: str) -> str:
    """Normaliza una ruta a su forma comparable.

    Descarta el query string y colapsa todo segmento dinamico a '*', de modo que
    `/api/admin/supplies/${id}` y `/api/admin/supplies/{supply_id}` coincidan.
    """
    path = path.split("?", 1)[0].rstrip("/")
    path = re.sub(r"\$\{[^}]*\}", "*", path)  # plantillas JS
    path = re.sub(r"\{[^}]*\}", "*", path)  # parametros FastAPI
    return path


def _frontend_paths() -> dict[str, set[str]]:
    """Rutas del API referenciadas por el frontend, agrupadas por archivo."""
    found: dict[str, set[str]] = {}
    for source in sorted(FRONTEND_DIR.rglob("*.jsx")):
        text = source.read_text(encoding="utf-8")
        paths = {_shape(match) for match in API_LITERAL.findall(text)}
        if paths:
            found[source.relative_to(REPO_ROOT).as_posix()] = paths
    return found


def _registered_paths() -> set[str]:
    """Rutas declaradas por la app, leidas del esquema OpenAPI.

    Se usa el esquema y no `app.routes` porque FastAPI anida los routers
    incluidos en objetos internos cuya forma cambia entre versiones.
    """
    return {
        _shape(path)
        for path in app.openapi()["paths"]
        if path.startswith("/api/")
    }


def test_frontend_only_calls_implemented_routes():
    registered = _registered_paths()
    assert registered, "No se detecto ninguna ruta /api/ registrada en la app"

    missing: list[str] = []
    for source, paths in _frontend_paths().items():
        for path in sorted(paths):
            if path not in registered:
                missing.append(f"{source} llama {path}")

    assert not missing, (
        "El frontend referencia rutas que el API no implementa.\n  "
        + "\n  ".join(missing)
        + "\n\nImplementa la ruta u oculta la interfaz que la llama "
        "(ver invariante 3 en CLAUDE.md)."
    )


def test_frontend_reads_at_least_the_known_routes():
    """Evita que el extractor se rompa en silencio y deje de verificar nada."""
    all_paths = {path for paths in _frontend_paths().values() for path in paths}
    assert "/api/admin/login" in all_paths
    assert "/api/sales/simulation" in all_paths
