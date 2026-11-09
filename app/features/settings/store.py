"""The household's settings, kept in the kv table as JSON: one row per setting.

Everything here blocks on SQLite, so call it through asyncio.to_thread from async code.
"""

from __future__ import annotations

import json
import threading
from typing import Any

from app.core.database import Database

DEFAULTS: dict[str, Any] = {
    "household": "Our household",
    # Check-in reminders: payday (after the payday rules run), weekly (Sunday) or monthly.
    "reminder": "payday",
    # Spending detail: import statements now and then ("statements"), or balances only ("balances").
    "detail": "statements",
    # Whether the set-up guide has been finished (or put off), and whether its reminders step has been done.
    "setup_done": False,
    "reminders_set": False,
    # Ask GitHub every few hours whether there's a newer version (Settings → Updates).
    "update_check": True,
    # A check-in's figure is taken as matching what the rules expected when it's within this many dollars.
    "tolerance": 50,
}


class SettingsStore:
    def __init__(self, db: Database):
        self.db = db
        self._lock = threading.Lock()

    def all(self) -> dict[str, Any]:
        with self.db.reading() as conn:
            rows = conn.execute("SELECT key, value FROM kv WHERE key LIKE 'setting:%'").fetchall()
        saved = {k.removeprefix("setting:"): json.loads(v) for k, v in rows}
        return {**DEFAULTS, **{k: v for k, v in saved.items() if k in DEFAULTS}}

    def get(self, key: str) -> Any:
        return self.all().get(key, DEFAULTS.get(key))

    def update(self, values: dict[str, Any]) -> dict[str, Any]:
        """Save some settings. ValueError (in words) for one that isn't known or doesn't fit."""
        clean: dict[str, Any] = {}
        for key, value in values.items():
            if key not in DEFAULTS:
                raise ValueError(f"There's no setting called {key!r}.")
            default = DEFAULTS[key]
            if isinstance(default, bool):
                value = bool(value)
            elif isinstance(default, int):
                try:
                    value = int(value)
                except (TypeError, ValueError):
                    raise ValueError(f"{key} should be a whole number.") from None
            else:
                value = " ".join(str(value or "").split())[:80]
            if key == "reminder" and value not in ("payday", "weekly", "monthly"):
                raise ValueError("Remind every payday, every week or every month.")
            if key == "detail" and value not in ("statements", "balances"):
                raise ValueError("Choose statements or balances only.")
            if key == "household" and not value:
                raise ValueError("Give the household a name.")
            clean[key] = value
        with self._lock, self.db.writing() as conn:
            for key, value in clean.items():
                conn.execute(
                    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (f"setting:{key}", json.dumps(value))
                )
        return self.all()
