"""Verifica la direccion de las dependencias entre capas (SOMA-ADR-003).

La regla se rompe con facilidad y en code review pasa desapercibida, asi que se
comprueba sola: `domain/` no puede conocer frameworks ni otras capas.
"""

import ast
from pathlib import Path

import pytest


SRC = Path(__file__).resolve().parents[1] / "src" / "soma_api"
DOMAIN = SRC / "domain"

# Frameworks e infraestructura que el dominio no puede tocar.
FORBIDDEN_IN_DOMAIN = {
    "fastapi",
    "starlette",
    "pydantic",
    "sqlite3",
    "langchain",
    "langchain_openai",
    "langgraph",
    "langchain_mcp_adapters",
    "httpx",
    "yaml",
    "os",
}

# Modulos internos que el dominio no puede importar (son capas externas).
FORBIDDEN_INTERNAL = {
    "database",
    "repositories",
    "migrations",
    "config",
    "dependencies",
    "main",
    "mcp",
    "agent",
    "security",
    "rate_limit",
    "routes",
}


def _domain_modules() -> list[Path]:
    return sorted(path for path in DOMAIN.glob("*.py"))


def _imports(path: Path) -> set[str]:
    """Nombres de modulo importados, tanto absolutos como relativos."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.module:
                # Import relativo: `from .costing import x` -> 'costing'
                names.add(node.module.split(".")[0])
            elif node.module:
                names.add(node.module.split(".")[0])
    return names


def test_el_paquete_de_dominio_existe():
    assert DOMAIN.is_dir(), "Falta api/src/soma_api/domain/"
    assert _domain_modules(), "El dominio no tiene modulos"


@pytest.mark.parametrize(
    "module", _domain_modules(), ids=lambda path: path.name
)
def test_dominio_no_importa_frameworks(module: Path):
    prohibidos = _imports(module) & FORBIDDEN_IN_DOMAIN
    assert not prohibidos, (
        f"{module.name} importa {sorted(prohibidos)}. El dominio debe ser puro: "
        "recibe datos y devuelve resultados. Mueve ese detalle a infrastructure/ "
        "o pasalo como argumento."
    )


@pytest.mark.parametrize(
    "module", _domain_modules(), ids=lambda path: path.name
)
def test_dominio_no_importa_capas_externas(module: Path):
    prohibidos = _imports(module) & FORBIDDEN_INTERNAL
    assert not prohibidos, (
        f"{module.name} importa {sorted(prohibidos)}, que pertenecen a capas "
        "externas. Las dependencias apuntan hacia adentro, nunca al reves."
    )


def test_las_rutas_no_calculan_costos_a_mano():
    """El costeo vive en domain/costing.py, no en la capa HTTP.

    Detecta la reaparicion de la formula AIU dentro de un handler.
    """
    routes = SRC / "routes"
    sospechosos = []
    for path in routes.glob("*.py"):
        texto = path.read_text(encoding="utf-8")
        # Aplicar un porcentaje dividiendo entre 100 es la firma del calculo AIU.
        if "/ 100" in texto or "/100" in texto:
            sospechosos.append(path.name)
    assert not sospechosos, (
        f"{sospechosos} parecen calcular porcentajes en la capa HTTP. "
        "Usa domain/costing.py."
    )
