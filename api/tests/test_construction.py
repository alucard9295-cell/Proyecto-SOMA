from fastapi.testclient import TestClient
import pytest

from soma_api.database import init_db, upsert_user
from soma_api.main import app
from soma_api.security import hash_password


def _headers(tmp_path, monkeypatch):
    database_path = tmp_path / "soma.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-at-least-32-bytes-long")
    init_db(str(database_path))
    upsert_user(str(database_path), "admon", hash_password("1234"))
    client = TestClient(app)
    response = client.post("/api/admin/login", json={"username": "admon", "password": "1234"})
    return client, {"Authorization": f"Bearer {response.json()['token']}"}


def test_apu_and_project_simulator_flow(tmp_path, monkeypatch):
    client, headers = _headers(tmp_path, monkeypatch)
    supplies = client.get("/api/admin/supplies", headers=headers).json()["items"]
    labor = next(item for item in supplies if item["categoria"] == "mano_obra")
    apu = client.post(
        "/api/admin/apus",
        headers=headers,
        json={
            "nombre_partida": "Muro de prueba",
            "unidad": "m2",
            "categoria": "obra_gris",
            "detalles": [{"insumo_id": labor["insumo_id"], "categoria": "mano_obra", "rendimiento": 0.1, "precio_unitario": 269231}],
        },
    )
    assert apu.status_code == 200
    apu_id = apu.json()["apu"]["apu_id"]
    project = client.post("/api/admin/proyectos", headers=headers, json={"nombre": "Casa prueba", "fecha_inicio": "2026-01-05"})
    assert project.status_code == 200
    project_id = project.json()["proyecto"]["proyecto_id"]
    result = client.post(f"/api/admin/proyectos/{project_id}/partidas", headers=headers, json={"fase": "Mamposteria", "apu_id": apu_id, "cantidad": 120, "rendimiento_diario": 10, "orden": 1})
    assert result.status_code == 200
    payload = result.json()["proyecto"]
    assert payload["costo_total"] == pytest.approx(120 * 269231 * 0.1)
    assert payload["duracion_dias"] == 12
    assert payload["fecha_fin"] == "2026-01-16"
