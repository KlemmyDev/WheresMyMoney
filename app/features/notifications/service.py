"""
Telling the household what needs them: every few minutes the rules (rules.py) look at the facts, and what they find
goes to the browsers and phones that turned notifications on, as web push through the service worker (webpush.py).
Each occasion is said once. Quiet hours hold notifications back until they end, and a daily
limit stops a flood. Everything sent, and how each channel took it, is kept (the history).
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import logging
import threading
import time
from collections.abc import Callable
from typing import Any

from app.core import dates
from app.core.database import Database
from app.core.http import post
from app.features.notifications.message import DeliveryError, Message, Send
from app.features.notifications.repository import NotificationsRepository, RuleSettings
from app.features.notifications.rules import BY_ID, RULES, Facts, RuleState, Say
from app.features.notifications.webpush import PushService

log = logging.getLogger(__name__)

EVERY = 300  # seconds between looks
MAX_CAP = 100


def minutes_of(hhmm: str) -> int | None:
    try:
        hour, minute = (int(x) for x in hhmm.split(":"))
    except (ValueError, AttributeError):
        return None
    return hour * 60 + minute if 0 <= hour < 24 and 0 <= minute < 60 else None


def in_quiet(quiet: dict[str, Any], when: dt.datetime) -> bool:
    if not quiet.get("enabled"):
        return False
    a, b = minutes_of(str(quiet.get("start"))), minutes_of(str(quiet.get("end")))
    if a is None or b is None or a == b:
        return False
    now = when.hour * 60 + when.minute
    return a <= now < b if a < b else now >= a or now < b


class Notifier:
    def __init__(
        self,
        db: Database,
        facts: Callable[[], Facts],
        send: Send = post,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.db = db
        self.facts = facts
        self.send = send
        self.clock = clock
        self.repo = NotificationsRepository(db)
        self.push = PushService(db, send)
        self._lock = threading.Lock()
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _run(self) -> None:
        await asyncio.sleep(30)
        while True:
            try:
                await asyncio.to_thread(self.evaluate)
            except Exception:
                log.exception("Looking for notifications failed")
            await asyncio.sleep(EVERY)

    def evaluate(self) -> list[str]:
        """One look at every rule; returns the keys of what was said."""
        now = self.clock()
        local = dt.datetime.fromtimestamp(now, dates.zone())
        options = self.repo.options()
        if in_quiet(options["quiet"], local):
            return []
        said: list[str] = []
        with self._lock:
            facts = self.facts()
            settings = self.repo.rules()
            states = self.repo.states()
            day_start = int(local.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
            for rule in RULES:
                cfg = settings.get(rule.id)
                if not (cfg.enabled if cfg else rule.enabled):
                    continue
                try:
                    say = rule.check(facts, rule.values(cfg.values if cfg else None))
                except Exception:
                    log.exception("Notification rule %s failed", rule.id)
                    continue
                state = states.get(rule.id) or RuleState(rule.id)
                if say is None or say.key in state.data.get("said", []):
                    continue
                if self.repo.sent_since(day_start) >= int(options.get("daily_cap") or 20):
                    break
                self._say(rule.id, say, int(now))
                state.data["said"] = ([*state.data.get("said", []), say.key])[-20:]
                state.last_fired = now
                self.repo.save_state(state)
                said.append(say.key)
        return said

    def _say(self, rule: str | None, say: Say, ts: int, event: str = "alert") -> dict[str, str]:
        msg = Message(event, rule, say.title, say.body, ts)
        results: dict[str, str] = {}
        if self.push.any():
            try:
                self.push.send_all(msg, say.url)
                results["push"] = "ok"
            except DeliveryError as e:
                results["push"] = str(e)
        self.repo.add_history(ts, rule, event, say.title, say.body, results)
        return results

    # -- Settings → Notifications -----------------------------------------------------

    def view(self) -> dict[str, Any]:
        settings = self.repo.rules()
        return {
            "rules": [
                {
                    "id": r.id,
                    "name": r.name,
                    "about": r.about,
                    "enabled": settings[r.id].enabled if r.id in settings else r.enabled,
                    "values": r.values(settings[r.id].values if r.id in settings else None),
                    "units": r.units,
                }
                for r in RULES
            ],
            "devices": [s.view() for s in self.push.subscriptions()],
            "options": self.repo.options(),
            "history": self.repo.history(30),
        }

    def save_rule(self, rule: str, body: dict[str, Any]) -> None:
        r = BY_ID.get(rule)
        if r is None:
            raise ValueError("There's no such notification.")
        current = self.repo.rules().get(rule)
        values = r.values({**(current.values if current else {}), **(body.get("values") or {})})
        enabled = bool(body.get("enabled", current.enabled if current else r.enabled))
        self.repo.save_rule(rule, RuleSettings(enabled, values))

    def save_options(self, body: dict[str, Any]) -> None:
        options = self.repo.options()
        if "quiet" in body:
            q = body["quiet"] or {}
            for key in ("start", "end"):
                if key in q and minutes_of(str(q[key])) is None:
                    raise ValueError("Quiet hours are times like 22:00.")
            options["quiet"] = {**options["quiet"], **{k: q[k] for k in ("enabled", "start", "end") if k in q}}
        if "daily_cap" in body:
            try:
                cap = int(body["daily_cap"])
            except (TypeError, ValueError):
                raise ValueError("The daily limit is a number.") from None
            options["daily_cap"] = max(1, min(cap, MAX_CAP))
        self.repo.save_options(options)

    def test(self, target: str) -> dict[str, Any]:
        """Send a test to every device ("push") or one (its id)."""
        say = Say("test", "WheresMyMoney test", "Notifications are working.", "/")
        msg = Message("test", None, say.title, say.body, int(self.clock()))
        if not self.push.any():
            raise ValueError("No device has turned notifications on yet.")
        self.push.send_all(msg, "/", None if target == "push" else target)
        self.repo.add_history(msg.ts, None, "test", say.title, say.body, {"push": "ok"})
        return {"ok": True}
