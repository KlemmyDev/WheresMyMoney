"""
Maintenance commands, run inside the container:

    docker compose exec wheresmymoney python -m app reset-account

reset-account  remove every sign-in and session; the next visit asks for a new first account, with the set-up code
               it prints (the household's money is left as it is)
"""

from __future__ import annotations

import os
import sys

from app.core.config import Config
from app.core.database import Database
from app.features.auth.service import AuthService


def main(argv: list[str]) -> int:
    os.umask(0o077)  # like the app: what it creates is for its own user only
    config = Config.from_env()
    db = Database(config.db_path)
    if argv == ["reset-account"]:
        db.migrate()
        auth = AuthService(db, enabled=True)
        auth.reset()
        print("Sign-ins and sessions removed.")
        auth.prepare_setup_code()  # and shows the set-up code the new account needs
        return 0
    print(__doc__.strip())
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
