from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Iterator


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def init_db(database_path: str) -> None:
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.executescript(SCHEMA)


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
    with connect(database_path) as connection:
        return connection.execute(
            "SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?",
            (username.strip(),),
        ).fetchone()


def upsert_user(database_path: str, username: str, password_hash: str) -> None:
    with connect(database_path) as connection:
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
