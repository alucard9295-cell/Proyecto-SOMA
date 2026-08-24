"""El precio previsualizado debe ser identico al guardado.

El frontend mostraba un precio calculado en JavaScript y el backend guardaba
otro calculado en Python: dos implementaciones de la misma formula AIU. Ahora el
front pide `/api/admin/apus/preview` y no calcula nada, pero nada impedia que
las respuestas divergieran, asi que se verifica aqui.
"""

from fastapi.testclient import TestClient
import pytest

from soma_api.database import init_db, upsert_user
from soma_api.main import app
from soma_api.security import hash_password


CAMPOS = (
    "costo_directo",
    "administracion",
    "imprevistos",
    "utilidad",
    "subtotal",
    "base_iva",
    "iva",
    "precio_venta",
)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    database_path = tmp_path / "soma.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-at-least-32-bytes-long")
    init_db(str(database_path))
    upsert_user(str(database_path), "admon", hash_password("1234"))
    test_client = TestClient(app)
    token = test_client.post(
        "/api/admin/login", json={"username": "admon", "password": "1234"}
    ).json()["token"]
    test_client.headers.update({"Authorization": f"Bearer {token}"})
    return test_client


def _payload(**overrides) -> dict:
    base = {
        "nombre_partida": "Muro de prueba",
        "unidad": "m2",
        "categoria": "obra_gris",
        "administracion_pct": 5,
        "imprevistos_pct": 5,
        "utilidad_pct": 10,
        "iva_pct": 19,
        "iva_base": "utilidad",
        "detalles": [
            {
                "insumo_id": 1,
                "categoria": "mano_obra",
                "rendimiento": 0.1,
                "desperdicio_pct": 0,
                "precio_unitario": 269231,
            }
        ],
    }
    base.update(overrides)
    return base


@pytest.mark.parametrize("iva_base", ["utilidad", "directo", "subtotal"])
def test_preview_coincide_con_lo_guardado(client, iva_base):
    payload = _payload(iva_base=iva_base)

    preview = client.post("/api/admin/apus/preview", json=payload).json()
    guardado = client.post("/api/admin/apus", json=payload).json()["apu"]

    for campo in CAMPOS:
        assert preview[campo] == guardado[campo], (
            f"'{campo}' difiere entre la previsualizacion y lo guardado "
            f"({preview[campo]} != {guardado[campo]}) con iva_base={iva_base}."
        )


def test_el_precio_no_arrastra_error_de_punto_flotante(client):
    """0.1 * 269231 en float da 26923.100000000002."""
    preview = client.post("/api/admin/apus/preview", json=_payload()).json()
    assert preview["costo_directo"] == 26923.10
    assert preview["precio_venta"] == 32819.27


def test_preview_no_persiste_nada(client):
    antes = client.get("/api/admin/apus").json()["count"]
    client.post("/api/admin/apus/preview", json=_payload())
    assert client.get("/api/admin/apus").json()["count"] == antes


def test_preview_exige_autenticacion(client):
    sin_auth = TestClient(app)
    assert sin_auth.post("/api/admin/apus/preview", json=_payload()).status_code == 401
