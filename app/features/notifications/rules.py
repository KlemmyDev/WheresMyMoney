"""
What's worth telling the household, each as a rule that looks at the facts and says whether there's something to
say now. Each says it once per occasion (`key`): a check-in reminder once per due day, a low bills buffer once until
it's back over its target.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RuleState:
    """A rule's progress, kept in the database so a restart neither forgets nor repeats a notification."""

    rule: str
    pending_since: float | None = None
    active_since: float | None = None
    last_fired: float | None = None
    quiet: bool = False
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Say:
    """Something to say: `key` tells one occasion from the next (it's only said once per key)."""

    key: str
    title: str
    body: str
    url: str = "/"


@dataclass(frozen=True)
class Facts:
    today: str
    hour: int
    checkin_due: str | None  # the next check-in's date
    last_checkin: str | None
    flags: list[dict[str, Any]]
    bills: dict[str, Any] | None  # {"balance", "target": {...}, "alert": bool}
    spending: dict[str, Any] | None  # the spending month
    by_hand_tomorrow: list[dict[str, Any]]


@dataclass(frozen=True)
class Rule:
    id: str
    name: str
    about: str
    check: Callable[[Facts, dict[str, float]], Say | None]
    defaults: dict[str, float] = field(default_factory=dict)
    enabled: bool = True

    def values(self, saved: dict[str, Any] | None) -> dict[str, float]:
        out = dict(self.defaults)
        for k, v in (saved or {}).items():
            if k in out:
                try:
                    out[k] = float(v)
                except (TypeError, ValueError):
                    continue
        return out


def _money(cents: float) -> str:
    return f"${cents / 100:,.0f}"


def _checkin(f: Facts, v: dict[str, float]) -> Say | None:
    if not f.checkin_due or f.today < f.checkin_due or f.last_checkin == f.today or f.hour < v["hour"]:
        return None
    return Say(
        f"checkin:{f.checkin_due}",
        "Time for a check-in",
        "Open your banking app and copy the balances in. It takes about 30 seconds.",
        "/?checkin=1",
    )


def _flag(f: Facts, _: dict[str, float]) -> Say | None:
    open_flags = [x for x in f.flags if x["status"] == "open"]
    if not open_flags:
        return None
    x = open_flags[0]
    rule = x.get("rule")
    what = f"The {_money(rule['amount'])} {rule['label'] or 'transfer'} didn't add up." if rule else ""
    word = "short" if x["difference"] < 0 else "over"
    return Say(
        f"flag:{x['id']}",
        f"{x['account']} is {_money(abs(x['difference']))} {word}",
        (what + " Check it in the app.").strip(),
        "/",
    )


def _bills_low(f: Facts, _: dict[str, float]) -> Say | None:
    b = f.bills
    if not b or not b.get("alert") or not b.get("target") or not b["target"].get("amount"):
        return None
    if b["balance"] >= b["target"]["amount"]:
        return None
    held = b["target"].get("held") or 0
    return Say(
        f"bills-low:{f.today[:7]}",
        "The bills buffer is under target",
        f"It holds {held:.1f} months of bills, under its {b['target']['months']:g}-month target "
        f"({_money(b['target']['amount'])}).",
        "/bills",
    )


def _safe_low(f: Facts, v: dict[str, float]) -> Say | None:
    s = f.spending
    if not s or not s.get("remaining"):
        return None
    if s["safe_per_day"] >= v["dollars"] * 100:
        return None
    return Say(
        f"safe-low:{s['start']}",
        "Spending is running low",
        f"Safe to spend is {_money(s['safe_per_day'])} a day for the next {s['remaining']} days.",
        "/spending",
    )


def _by_hand(f: Facts, _: dict[str, float]) -> Say | None:
    if not f.by_hand_tomorrow:
        return None
    names = ", ".join(f"{b['name']} ({_money(b['amount'])})" for b in f.by_hand_tomorrow)
    return Say(f"by-hand:{f.today}", "A bill to pay by hand tomorrow", names, "/bills")


RULES: list[Rule] = [
    Rule("checkin", "Check-in reminders", "On the day a check-in is due, from this hour.", _checkin, {"hour": 17}),
    Rule("flag", "A transfer that didn't add up", "When a check-in finds a rule's transfer missing.", _flag),
    Rule(
        "bills_low",
        "Bills buffer under target",
        "Once a month while the bills account is under its target.",
        _bills_low,
    ),
    Rule(
        "safe_low",
        "Safe to spend running low",
        "When safe to spend falls under this many dollars a day.",
        _safe_low,
        {"dollars": 60},
    ),
    Rule("by_hand", "Bills paid by hand", "The day before a bill you pay by hand is due.", _by_hand),
]
BY_ID = {r.id: r for r in RULES}
