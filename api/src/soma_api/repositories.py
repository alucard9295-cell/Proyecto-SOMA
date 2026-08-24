import json
import re
import sqlite3
from typing import Any

from .database import connect


class UserRepository:
    """Small persistence boundary for authentication users."""

    def __init__(self, database_path: str):
        self.database_path = database_path

    def find_by_username(self, username: str) -> sqlite3.Row | None:
        with connect(self.database_path) as connection:
            return connection.execute(
                """
                SELECT id, username, password_hash, role, is_active
                FROM users
                WHERE username = ?
                """,
                (username.strip(),),
            ).fetchone()

    def upsert(self, username: str, password_hash: str) -> None:
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO users (username, password_hash)
                VALUES (?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    password_hash = excluded.password_hash,
                    is_active = 1
                """,
                (username.strip(), password_hash),
            )


class AuditRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path

    def record(
        self,
        event_type: str,
        *,
        user_id: int | None = None,
        username: str | None = None,
        request_id: str | None = None,
        ip_address: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        safe_details = _redact_sensitive_details(details or {})
        with connect(self.database_path) as connection:
            connection.execute(
                """
                INSERT INTO audit_events
                    (event_type, user_id, username, request_id, ip_address, details)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    event_type,
                    user_id,
                    username,
                    request_id,
                    ip_address,
                    json.dumps(safe_details, ensure_ascii=True, sort_keys=True),
                ),
            )


SENSITIVE_DETAIL_KEY_PARTS = {
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "credential",
    "password",
    "passphrase",
    "private_key",
    "secret",
    "token",
}
REDACTED_DETAIL = "[REDACTED]"


def _is_sensitive_detail_key(key: object) -> bool:
    normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(key))
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized.lower()).strip("_")
    parts = set(normalized.split("_"))
    sensitive_words = SENSITIVE_DETAIL_KEY_PARTS - {
        "api_key",
        "apikey",
        "private_key",
    }
    return normalized in SENSITIVE_DETAIL_KEY_PARTS or bool(
        parts.intersection(sensitive_words)
    )


def _redact_sensitive_details(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: REDACTED_DETAIL
            if _is_sensitive_detail_key(key)
            else _redact_sensitive_details(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_sensitive_details(item) for item in value]
    if isinstance(value, tuple):
        return [_redact_sensitive_details(item) for item in value]
    return value
