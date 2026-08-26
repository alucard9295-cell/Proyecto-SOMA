import sqlite3
import json

from fastapi.testclient import TestClient

from soma_api.database import database_ready, init_db, upsert_user
from soma_api.main import app
from soma_api.repositories import AuditRepository
from soma_api.security import hash_password


def _configured_client(tmp_path, monkeypatch):
    database_path = tmp_path / "soma.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-at-least-32-bytes-long")
    init_db(str(database_path))
    upsert_user(str(database_path), "admon", hash_password("1234"))
    return TestClient(app), database_path


def test_audit_records_login_and_authorization_events_without_secrets(tmp_path, monkeypatch):
    client, database_path = _configured_client(tmp_path, monkeypatch)
    with client:
        success = client.post(
            "/api/admin/login", json={"username": "admon", "password": "1234"}
        )
        assert success.status_code == 200
        assert success.headers["x-request-id"] == success.json().get("request_id", success.headers["x-request-id"])

        failure = client.post(
            "/api/admin/login", json={"username": "admon", "password": "wrong"}
        )
        assert failure.status_code == 401
        denied = client.get("/api/admin/summary")
        assert denied.status_code == 401
        assert denied.json()["request_id"] == denied.headers["x-request-id"]

    with sqlite3.connect(database_path) as connection:
        rows = connection.execute(
            "SELECT event_type, username, details FROM audit_events ORDER BY id"
        ).fetchall()
    assert [row[0] for row in rows] == ["login_success", "login_failure", "authorization_denied"]
    assert "wrong" not in str(rows)
    assert "1234" not in str(rows)


def test_health_is_liveness_and_ready_checks_database(tmp_path, monkeypatch):
    client, _ = _configured_client(tmp_path, monkeypatch)
    with client:
        health = client.get("/health")
        ready = client.get("/ready")
    assert health.status_code == 200
    assert ready.status_code == 200
    assert ready.json() == {"status": "ready"}
    assert health.headers["x-request-id"]
    assert ready.headers["x-request-id"]


def test_database_ready_rejects_missing_file_without_creating_it(tmp_path):
    database_path = tmp_path / "missing.sqlite3"

    assert not database_ready(str(database_path))
    assert not database_path.exists()


def test_database_ready_accepts_migrated_schema(tmp_path):
    database_path = tmp_path / "soma.sqlite3"
    init_db(str(database_path))

    assert database_ready(str(database_path))


def test_audit_repository_redacts_sensitive_detail_keys(tmp_path):
    database_path = tmp_path / "soma.sqlite3"
    init_db(str(database_path))

    AuditRepository(str(database_path)).record(
        "test_event",
        details={
            "reason": "test",
            "password": "do-not-store",
            "nested": {"apiKey": "also-do-not-store"},
            "items": [{"access_token": "not-audit-value"}],
        },
    )

    with sqlite3.connect(database_path) as connection:
        stored = connection.execute(
            "SELECT details FROM audit_events WHERE event_type = 'test_event'"
        ).fetchone()[0]
    details = json.loads(stored)
    assert details == {
        "reason": "test",
        "password": "[REDACTED]",
        "nested": {"apiKey": "[REDACTED]"},
        "items": [{"access_token": "[REDACTED]"}],
    }
    assert "do-not-store" not in stored
    assert "also-do-not-store" not in stored
    assert "not-audit-value" not in stored


def test_cors_allows_only_app_methods_and_headers(tmp_path, monkeypatch):
    client, _ = _configured_client(tmp_path, monkeypatch)
    with client:
        response = client.options(
            "/api/admin/login",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-methods"] == "GET, POST, OPTIONS"
    assert "*" not in response.headers["access-control-allow-headers"]
    assert response.headers["x-request-id"]
