import sqlite3

from soma_api.database import init_db
from soma_api.migrations import MIGRATIONS


def test_migrations_are_idempotent_and_preserve_existing_users(tmp_path):
    database_path = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ("legacy", "hash-that-is-not-a-password"),
        )

    init_db(str(database_path))
    init_db(str(database_path))

    with sqlite3.connect(database_path) as connection:
        assert connection.execute("SELECT username FROM users").fetchone() == ("legacy",)
        assert connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_events'"
        ).fetchone() == ("audit_events",)
        assert connection.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        ).fetchall() == [(version,) for version, _, _ in MIGRATIONS]
