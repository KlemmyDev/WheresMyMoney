"""
Rules are the household's plan for moving money, set up once as scheduled transfers in their banking app. The app
never moves money: it works out what the rules should have done, and at each check-in compares that with the
balances typed in, flagging a transfer that doesn't add up.

Kinds:
- pay: pay lands in `to_account` (amount, every fortnight from a payday, say);
- transfer: `amount` from `from_account` to `to_account` on a schedule (each payday);
- top_up: top `to_account` up *to* `amount` from `from_account` (the monthly spending top-up), so only the
  difference moves and whatever wasn't spent stays offsetting;
- sweep: move whatever `from_account` holds over `amount`/100 months of its bills into `to_account` (350 is 3.5).

`simulate` steps through every rule and bill from one day to another, oldest first, from the balances known at the
start, so each one sees the balances the ones before it left (a top-up after payday, a sweep after the bills).

Everything here blocks on SQLite, so call it through asyncio.to_thread from async code.
"""

from __future__ import annotations

import datetime as dt
import time
from dataclasses import dataclass, field
from typing import Any

from app.core import dates
from app.core.database import Database

KINDS = ("pay", "transfer", "top_up", "sweep")
MAX_LABEL = 60


@dataclass(frozen=True)
class Rule:
    id: int
    kind: str
    from_account: int | None
    to_account: int | None
    amount: int
    every: str
    anchor: str
    label: str
    enabled: bool
    last_status: str | None
    last_checked: str | None

    def runs(self, start: dt.date, end: dt.date) -> list[dt.date]:
        return list(dates.occurrences(dates.parse(self.anchor), self.every, start, end))

    def next_run(self, on_or_after: dt.date | None = None) -> dt.date:
        return dates.next_on_or_after(dates.parse(self.anchor), self.every, on_or_after or dates.today())

    def last_run(self, on_or_before: dt.date | None = None) -> dt.date | None:
        return dates.last_on_or_before(dates.parse(self.anchor), self.every, on_or_before or dates.today())

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "from_account": self.from_account,
            "to_account": self.to_account,
            "amount": self.amount,
            "every": self.every,
            "anchor": self.anchor,
            "label": self.label,
            "enabled": self.enabled,
            "next_run": self.next_run().isoformat(),
            "last_run": (lr.isoformat() if (lr := self.last_run()) else None),
            "last_status": self.last_status,
            "last_checked": self.last_checked,
        }


_COLUMNS = "id, kind, from_account, to_account, amount, every, anchor, label, enabled, last_status, last_checked"


def _row(r: tuple[Any, ...]) -> Rule:
    return Rule(r[0], r[1], r[2], r[3], r[4] or 0, r[5], r[6], r[7], bool(r[8]), r[9], r[10])


def clean(body: dict[str, Any]) -> dict[str, Any]:
    kind = str(body.get("kind") or "")
    if kind not in KINDS:
        raise ValueError("Choose what the rule does: pay, a transfer, a top-up or a sweep.")

    def account(name: str) -> int | None:
        v = body.get(name)
        return int(v) if v not in (None, "") else None

    src, dst = account("from_account"), account("to_account")
    if kind in ("transfer", "top_up", "sweep") and (src is None or dst is None):
        raise ValueError("Choose the account it comes from and the one it goes to.")
    if kind == "pay" and dst is None:
        raise ValueError("Choose the account the pay lands in.")
    if src is not None and src == dst:
        raise ValueError("A transfer needs two different accounts.")
    try:
        amount = int(body.get("amount"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise ValueError("Enter the amount.") from None
    if amount <= 0:
        raise ValueError("The amount should be more than $0.")
    every = str(body.get("every") or "fortnightly")
    if every not in dates.EVERY:
        raise ValueError("Choose how often it happens.")
    try:
        anchor = dates.parse(str(body.get("anchor") or ""))
    except ValueError:
        raise ValueError("Enter the date it next happens.") from None
    return {
        "kind": kind,
        "from_account": src if kind != "pay" else None,
        "to_account": dst,
        "amount": amount,
        "every": every,
        "anchor": anchor.isoformat(),
        "label": " ".join(str(body.get("label") or "").split())[:MAX_LABEL],
        "enabled": int(bool(body.get("enabled", True))),
    }


@dataclass
class Simulation:
    """What the rules and bills should have done to each account from one day to another."""

    balances: dict[int, float]
    # Accounts whose figure is only approximate (a top-up or sweep depends on what was spent along the way).
    approximate: set[int] = field(default_factory=set)
    events: list[dict[str, Any]] = field(default_factory=list)


class RulesService:
    def __init__(self, db: Database):
        self.db = db

    def all(self, enabled_only: bool = False) -> list[Rule]:
        sql = f"SELECT {_COLUMNS} FROM rules"
        if enabled_only:
            sql += " WHERE enabled = 1"
        with self.db.reading() as conn:
            rows = conn.execute(sql + " ORDER BY sort, id").fetchall()
        return [_row(r) for r in rows]

    def get(self, rule_id: int) -> Rule | None:
        with self.db.reading() as conn:
            row = conn.execute(f"SELECT {_COLUMNS} FROM rules WHERE id = ?", (rule_id,)).fetchone()
        return _row(row) if row else None

    def add(self, body: dict[str, Any]) -> Rule:
        f = clean(body)
        with self.db.writing() as conn:
            sort = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM rules").fetchone()[0]
            cur = conn.execute(
                "INSERT INTO rules (kind, from_account, to_account, amount, every, anchor, label, enabled, sort,"
                " created_at) VALUES (:kind, :from_account, :to_account, :amount, :every, :anchor, :label, :enabled,"
                " :sort, :now)",
                {**f, "sort": sort, "now": int(time.time())},
            )
        rule = self.get(int(cur.lastrowid or 0))
        assert rule is not None
        return rule

    def update(self, rule_id: int, body: dict[str, Any]) -> Rule:
        current = self.get(rule_id)
        if current is None:
            raise LookupError("That rule has gone.")
        f = clean({**current.view(), **body})
        with self.db.writing() as conn:
            conn.execute(
                "UPDATE rules SET kind = :kind, from_account = :from_account, to_account = :to_account,"
                " amount = :amount, every = :every, anchor = :anchor, label = :label, enabled = :enabled"
                " WHERE id = :id",
                {**f, "id": rule_id},
            )
        rule = self.get(rule_id)
        assert rule is not None
        return rule

    def remove(self, rule_id: int) -> bool:
        with self.db.writing() as conn:
            return conn.execute("DELETE FROM rules WHERE id = ?", (rule_id,)).rowcount > 0

    def note(self, rule_id: int, status: str, day: str) -> None:
        """How the rule went when it was last checked: ok, missing, differed or nothing (to sweep)."""
        with self.db.writing() as conn:
            conn.execute("UPDATE rules SET last_status = ?, last_checked = ? WHERE id = ?", (status, day, rule_id))

    # -- what they should do ----------------------------------------------------------

    def simulate(
        self,
        start_balances: dict[int, float],
        start: dt.date,
        end: dt.date,
        bills: list[Any],
        bills_per_month: dict[int, float],
        spending_accounts: set[int] | None = None,
    ) -> Simulation:
        """Step through each rule run and bill due after `start` up to `end` (inclusive)."""
        sim = Simulation(dict(start_balances))
        if end <= start:
            return sim
        first = start + dt.timedelta(days=1)
        steps: list[tuple[str, int, str, Any]] = []
        order = {"pay": 0, "transfer": 1, "bill": 2, "top_up": 3, "sweep": 4}
        for planned in self.all(enabled_only=True):
            for run_on in planned.runs(first, end):
                steps.append((run_on.isoformat(), order[planned.kind], "rule", planned))
        for bill in bills:
            if bill.account_id is None:
                continue
            for due_on in bill.due_between(first, end):
                steps.append((due_on.isoformat(), order["bill"], "bill", bill))
        steps.sort(key=lambda s: (s[0], s[1]))
        bal = sim.balances
        for day, _, what, item in steps:
            if what == "bill":
                bal[item.account_id] = bal.get(item.account_id, 0) - item.amount
                sim.events.append(
                    {
                        "date": day,
                        "kind": "bill",
                        "name": item.name,
                        "account": item.account_id,
                        "amount": -item.amount,
                        "bill_id": item.id,
                    }
                )
                continue
            rule: Rule = item
            moved: float
            if rule.kind == "pay" or rule.kind == "transfer":
                moved = rule.amount
            elif rule.kind == "top_up":
                moved = max(rule.amount - bal.get(rule.to_account or 0, 0), 0)
                if spending_accounts and rule.to_account in spending_accounts:
                    sim.approximate.update({rule.from_account or 0, rule.to_account or 0})
            else:  # sweep
                keep = bills_per_month.get(rule.from_account or 0, 0) * rule.amount / 100
                moved = max(bal.get(rule.from_account or 0, 0) - keep, 0)
            if rule.from_account is not None:
                bal[rule.from_account] = bal.get(rule.from_account, 0) - moved
            if rule.to_account is not None:
                bal[rule.to_account] = bal.get(rule.to_account, 0) + moved
            sim.events.append(
                {
                    "date": day,
                    "kind": rule.kind,
                    "rule_id": rule.id,
                    "from": rule.from_account,
                    "to": rule.to_account,
                    "amount": round(moved),
                }
            )
        return sim

    def explain(self, account_id: int, difference: int, tolerance: int, sim: Simulation) -> dict[str, Any] | None:
        """The rule run (in the simulation) that best explains an account being `difference` off: a transfer into it
        that didn't arrive (short by about its amount), or one out of it that didn't go (over by about it)."""
        best = None
        for e in sim.events:
            if e["kind"] in ("bill",) or not e.get("amount"):
                continue
            into = e.get("to") == account_id
            out = e.get("from") == account_id
            if not (into or out):
                continue
            expected_gap = -e["amount"] if into else e["amount"]
            if abs(difference - expected_gap) <= tolerance:
                gap = abs(difference - expected_gap)
                if best is None or gap < best[0]:
                    best = (gap, e)
        return best[1] if best else None

    def month(self, monthly_bills: float, allowance: int, repayment: int) -> dict[str, int]:
        """What a usual month looks like under the rules: pay in, what moves where, and what stays offsetting."""
        pay = transfers = 0
        for r in self.all(enabled_only=True):
            per_month = r.amount * dates.PER_YEAR[r.every] / 12
            if r.kind == "pay":
                pay += round(per_month)
            elif r.kind == "transfer":
                transfers += round(per_month)
        return {
            "pay": pay,
            "transfers": transfers,
            "spending": allowance,
            "bills": round(monthly_bills),
            "repayment": repayment,
            # Everything offsets the loan, so what grows the offsets is what isn't spent, paid or repaid.
            "surplus": pay - allowance - round(monthly_bills) - repayment,
        }
