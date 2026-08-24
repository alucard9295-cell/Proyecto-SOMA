from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Iterator

from .migrations import MIGRATIONS

REQUIRED_TABLES = ("schema_migrations", "users", "audit_events")


def init_db(database_path: str) -> None:
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        applied = {
            row[0]
            for row in connection.execute("SELECT version FROM schema_migrations")
        }
        for version, name, migration in MIGRATIONS:
            if version in applied:
                continue
            migration(connection)
            connection.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
                (version, name),
            )


@contextmanager
def connect(database_path: str) -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def find_user(database_path: str, username: str) -> sqlite3.Row | None:
    from .repositories import UserRepository

    return UserRepository(database_path).find_by_username(username)


def upsert_user(database_path: str, username: str, password_hash: str) -> None:
    from .repositories import UserRepository

    UserRepository(database_path).upsert(username, password_hash)


def database_ready(database_path: str) -> bool:
    path = Path(database_path)
    if not path.is_file():
        return False
    try:
        # URI mode=ro prevents a readiness probe from creating a database.
        uri = f"file:{path.resolve().as_posix()}?mode=ro"
        with sqlite3.connect(uri, uri=True) as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    """
                    SELECT name
                    FROM sqlite_master
                    WHERE type = 'table' AND name IN (?, ?, ?)
                    """,
                    REQUIRED_TABLES,
                )
            }
            if tables != set(REQUIRED_TABLES):
                return False
            applied_versions = {
                row[0]
                for row in connection.execute(
                    "SELECT version FROM schema_migrations"
                )
            }
        return {version for version, _, _ in MIGRATIONS}.issubset(applied_versions)
    except (OSError, sqlite3.Error):
        return False
