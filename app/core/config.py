"""Runtime configuration, read once from environment variables (see .env.example)."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    db_path: str = "/data/wheresmymoney.db"

    # Fill a new install with a made-up household (four accounts, a loan, bills, two years of transactions), for
    # local development and demos. Only ever into an empty database.
    demo: bool = False

    # Require signing in (the first visit creates the household's first account, with the set-up code in the log).
    # Only an explicit AUTH=false (0, no, off) turns it off: an empty or mistyped value keeps it on.
    auth: bool = True

    # Serve the API's own documentation at /api/docs (and /api/redoc, /api/openapi.json), behind sign-in.
    api_docs: bool = False

    # Run the background jobs (update checks, reminders and alerts). Off in tests.
    background: bool = True

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Config:
        e = os.environ if env is None else env

        def flag(name: str, default: bool) -> bool:
            return e.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")

        def unless_off(name: str) -> bool:
            """On unless explicitly turned off: for settings where a typo mustn't quietly turn protection off."""
            return e.get(name, "").strip().lower() not in ("0", "false", "no", "off")

        d = cls()
        return cls(
            db_path=e.get("DB_PATH", d.db_path),
            demo=flag("DEMO", d.demo),
            auth=unless_off("AUTH"),
            api_docs=flag("API_DOCS", d.api_docs),
        )


class ConfigError(ValueError):
    """Settings in the environment that can't be read, each named with what it should look like."""

    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__(
            "Can't read the settings in the environment (.env next to docker-compose.yml):\n"
            + "\n".join(f"  - {p}" for p in problems)
        )
