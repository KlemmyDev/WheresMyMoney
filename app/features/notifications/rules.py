"""
What's worth telling the household, each as a rule that looks at the facts and says whether there's something to
say now. Each says it once per occasion (`key`): a check-in reminder once per due day, a low bills buffer once a
month, a budget once per spending month as it gets close (and again if it goes over).

Spending is told the way the household thinks about it: each category against its budget, and the month against
the plan; never as dollars a day.
"""

from __future__ import annotations

import datetime as dt
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
    bills_ahead: list[dict[str, Any]]  # bills due in the next fortnight (BillsService.due)
    last_statement: str | None  # the latest date an imported statement covers
    # Regular payments whose price changed (app.features.spending.directory.price_changes), newest first.
    price_changes: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class Rule:
    id: str
    name: str
    about: str
    check: Callable[[Facts, dict[str, float]], Say | None]
    defaults: dict[str, float] = field(default_factory=dict)
    enabled: bool = True
    # What each number is, shown beside it: {"days": "days before"}.
    units: dict[str, str] = field(default_factory=dict)

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


def _plan(f: Facts, v: dict[str, float]) -> Say | None:
    s = f.spending
    if not s or not s.get("remaining") or s["vs_pace"] <= v["dollars"] * 100:
        return None
    return Say(
        f"ahead:{s['start']}",
        "Spending is ahead of the plan",
        f"{_money(s['vs_pace'])} more has gone than the plan has by now, with {s['remaining']} days until the top-up. "
        f"{_money(max(s['left'], 0))} is left of {_money(s['allowance'])}.",
        "/spending",
    )


def _budgets(f: Facts, v: dict[str, float]) -> Say | None:
    s = f.spending
    if not s:
        return None
    share = v["percent"] / 100
    over, close, marks = [], [], []
    for c in s.get("categories") or []:
        budget = c.get("budget")
        if not budget:
            continue
        if c["spent"] > budget:
            over.append(f"{c['name']} is {_money(c['spent'] - budget)} over its {_money(budget)}")
            marks.append(f"{c['id']}:over")
        elif c["spent"] >= budget * share:
            close.append(f"{c['name']} has {_money(budget - c['spent'])} left of {_money(budget)}")
            marks.append(f"{c['id']}:close")
    if not over and not close:
        return None
    lines = over + close
    title = (
        ("A budget has gone over" if len(over) == 1 else f"{len(over)} budgets have gone over")
        if over
        else ("A budget is nearly used up" if len(close) == 1 else f"{len(close)} budgets are nearly used up")
    )
    days = s.get("remaining")
    tail = f" {days} days until the top-up." if days else ""
    # Said again only when a category newly gets close or goes over, not as the amounts move.
    return Say(f"budgets:{s['start']}:{','.join(sorted(marks))}", title, "; ".join(lines) + "." + tail, "/spending")


def _by_hand(f: Facts, v: dict[str, float]) -> Say | None:
    day = (dt.date.fromisoformat(f.today) + dt.timedelta(days=int(v["days"]))).isoformat()
    due = [b for b in f.bills_ahead if b["how"] == "manual" and b["date"] == day]
    if not due:
        return None
    names = ", ".join(f"{b['name']} ({_money(b['amount'])})" for b in due)
    when = "tomorrow" if int(v["days"]) == 1 else "today" if int(v["days"]) == 0 else f"in {int(v['days'])} days"
    return Say(
        f"by-hand:{day}",
        "A bill to pay by hand " + when if len(due) == 1 else f"{len(due)} bills to pay by hand {when}",
        names,
        "/bills",
    )


def _import(f: Facts, v: dict[str, float]) -> Say | None:
    if not f.last_statement:
        return None
    gap = (dt.date.fromisoformat(f.today) - dt.date.fromisoformat(f.last_statement)).days
    if gap < v["days"] or f.hour < 9:
        return None
    # Again each week it's left, not every day.
    week = int((gap - v["days"]) // 7)
    return Say(
        f"import:{f.last_statement}:{week}",
        "Time to import the statements",
        f"The latest statement goes up to {gap} days ago. Download the CSVs from uBank and add them on the Import page.",
        "/import",
    )


def _prices(f: Facts, v: dict[str, float]) -> Say | None:
    today = dt.date.fromisoformat(f.today)
    fresh = [
        c
        for c in f.price_changes
        if c["up"] and (today - dt.date.fromisoformat(c["date"])).days <= v["days"] and (c["pct"] or 0) >= v["percent"]
    ]
    if not fresh:
        return None
    lines = [f"{c['name']}: ${c['was'] / 100:,.2f} to ${c['now'] / 100:,.2f}" for c in fresh[:3]]
    title = f"{fresh[0]['name']} went up" if len(fresh) == 1 else f"{len(fresh)} regular payments went up"
    # Once per change.
    key = "prices:" + ",".join(sorted(f"{c['key']}@{c['date']}" for c in fresh))
    return Say(key, title, "; ".join(lines) + ".", "/merchants")


RULES: list[Rule] = [
    Rule(
        "checkin",
        "Check-in reminders",
        "On the day a check-in is due, from this time of day.",
        _checkin,
        {"hour": 17},
        units={"hour": "o'clock (24h)"},
    ),
    Rule("flag", "A transfer that didn't add up", "When a check-in finds a rule's transfer missing.", _flag),
    Rule(
        "by_hand",
        "Bills paid by hand",
        "Before a bill you pay by hand is due.",
        _by_hand,
        {"days": 2},
        units={"days": "days before"},
    ),
    Rule(
        "budgets",
        "Budgets nearly used up",
        "When a category has used this much of its budget, and again if it goes over.",
        _budgets,
        {"percent": 90},
        units={"percent": "% used"},
    ),
    Rule(
        "plan",
        "Spending ahead of the plan",
        "When the month's spending gets this far ahead of where the plan has it.",
        _plan,
        {"dollars": 150},
        units={"dollars": "dollars ahead"},
    ),
    Rule(
        "import",
        "Statements to import",
        "When the latest imported statement is this old, then weekly.",
        _import,
        {"days": 14},
        units={"days": "days old"},
    ),
    Rule(
        "prices",
        "Regular payments that went up",
        "When a subscription or other regular payment costs more than it did, by at least this much.",
        _prices,
        {"percent": 3, "days": 21},
        units={"percent": "% more", "days": "days to tell"},
    ),
    Rule(
        "bills_low",
        "Bills buffer under target",
        "Once a month while the bills account is under its target.",
        _bills_low,
    ),
]
BY_ID = {r.id: r for r in RULES}
