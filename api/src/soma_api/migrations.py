from collections.abc import Callable
import sqlite3


Migration = tuple[int, str, Callable[[sqlite3.Connection], None]]


def _create_users(connection: sqlite3.Connection) -> None:
    # CREATE IF NOT EXISTS preserves databases created before migrations existed.
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _create_audit_events(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            user_id INTEGER,
            username TEXT,
            request_id TEXT,
            ip_address TEXT,
            details TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_events_created_at "
        "ON audit_events(created_at)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_events_event_type "
        "ON audit_events(event_type)"
    )


MIGRATIONS: tuple[Migration, ...] = (
    (1, "create_users", _create_users),
    (2, "create_audit_events", _create_audit_events),
)
