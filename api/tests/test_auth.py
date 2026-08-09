from fastapi.testclient import TestClient

from soma_api.config import load_settings
from soma_api.database import init_db, upsert_user
from soma_api.main import app
from soma_api.security import hash_password


def test_admin_login_and_protected_summary(tmp_path, monkeypatch):
    database_path = tmp_path / "soma.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-at-least-32-bytes-long")
    init_db(str(database_path))
    upsert_user(str(database_path), "admon", hash_password("1234"))

    with TestClient(app) as client:
        response = client.post(
            "/api/admin/login", json={"username": "admon", "password": "1234"}
        )
        assert response.status_code == 200
        token = response.json()["token"]

        summary = client.get(
            "/api/admin/summary", headers={"Authorization": f"Bearer {token}"}
        )
        assert summary.status_code == 200
        assert summary.json()["facturas"] == 0


def test_admin_login_rejects_invalid_password(tmp_path, monkeypatch):
    database_path = tmp_path / "soma.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-at-least-32-bytes-long")
    init_db(str(database_path))
    upsert_user(str(database_path), "admon", hash_password("1234"))

    with TestClient(app) as client:
        response = client.post(
            "/api/admin/login", json={"username": "admon", "password": "wrong"}
        )
        assert response.status_code == 401


def test_api_emits_security_headers_and_rejects_unknown_host():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert client.get("/health", headers={"host": "attacker.example"}).status_code == 400
