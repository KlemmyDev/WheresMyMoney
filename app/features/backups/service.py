"""
Backups of the database in data/backups/: one each night (03:00), one whenever asked (Settings → Updates and backups),
and the ones install.sh makes before every update. Named <name>-<YYYYMMDD-HHMMSS>-<version>.db like install.sh's, with
"nightly" or "manual" after the version for the app's own. The newest 14 nightly ones are kept; install.sh tidies its own.

SQLite's online backup, so it's safe while the app is in use. Backups sit on the same disk as the app: copying data/
somewhere else now and then is still the household's to do.
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import logging
import os
import re
import sqlite3
from pathlib import Path
from typing import Any

from app.core import dates
from app.core.version import VERSION

log = logging.getLogger(__name__)

KEEP_NIGHTLY = 14
AT_HOUR = 3
NAME = re.compile(r"wheresmymoney-(\d{8}-\d{6})(?:-(.+))?\.db")


class BackupService:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.folder = Path(db_path).parent / "backups"
        self._task: asyncio.Task[None] | None = None

    def make(self, kind: str = "manual") -> dict[str, Any]:
        self.folder.mkdir(parents=True, exist_ok=True)
        stamp = dt.datetime.now(dates.zone()).strftime("%Y%m%d-%H%M%S")
        dest = self.folder / f"wheresmymoney-{stamp}-{VERSION}-{kind}.db"
        src, dst = sqlite3.connect(self.db_path), sqlite3.connect(dest)
        try:
            src.backup(dst)
        except BaseException:
            dst.close()
            dest.unlink(missing_ok=True)
            raise
        finally:
            src.close()
        dst.close()
        if kind == "nightly":
            self._tidy()
        return self._view(dest)

    def _tidy(self) -> None:
        nightly = sorted((f for f in self.folder.glob("wheresmymoney-*-nightly.db")), reverse=True)
        for old in nightly[KEEP_NIGHTLY:]:
            with contextlib.suppress(OSError):
                old.unlink()

    def _view(self, f: Path) -> dict[str, Any]:
        m = NAME.fullmatch(f.name)
        label = (m[2] or "") if m else ""
        kind = "nightly" if label.endswith("-nightly") else "manual" if label.endswith("-manual") else "before update"
        return {
            "name": f.name,
            "kind": kind,
            "size": f.stat().st_size,
            "at": int(dt.datetime.strptime(m[1], "%Y%m%d-%H%M%S").replace(tzinfo=dates.zone()).timestamp())
            if m
            else None,
        }

    def all(self) -> list[dict[str, Any]]:
        if not self.folder.is_dir():
            return []
        found = [f for f in self.folder.iterdir() if NAME.fullmatch(f.name)]
        return [self._view(f) for f in sorted(found, key=lambda f: f.name, reverse=True)]

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _run(self) -> None:
        while True:
            now = dt.datetime.now(dates.zone())
            nxt = now.replace(hour=AT_HOUR, minute=0, second=0, microsecond=0)
            if nxt <= now:
                nxt += dt.timedelta(days=1)
            await asyncio.sleep((nxt - now).total_seconds())
            try:
                if os.path.exists(self.db_path):
                    await asyncio.to_thread(self.make, "nightly")
            except Exception:
                log.exception("The nightly backup failed")
