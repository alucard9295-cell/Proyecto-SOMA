import argparse
import getpass

from .config import load_settings
from .database import init_db, upsert_user
from .security import hash_password


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or rotate a SOMA admin account")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password")
    args = parser.parse_args()
    password = args.password or getpass.getpass("Admin password: ")
    if len(password) < 4:
        raise SystemExit("The admin password must contain at least 4 characters")
    settings = load_settings()
    init_db(settings.database_path)
    upsert_user(settings.database_path, args.username, hash_password(password))
    print(f"Admin account '{args.username}' is ready in {settings.database_path}")


if __name__ == "__main__":
    main()
