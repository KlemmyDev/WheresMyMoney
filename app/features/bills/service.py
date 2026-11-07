"""
Bills: what comes out regularly, how often, when next, and from which account.

A bill is entered once with its amount, how often (dates.EVERY) and its next due date; the dates after that follow
the schedule, so a bill's next due date moves on by itself. The bills buffer's target is a number of months of the
bills paid from that account.

Everything here blocks on SQLite, so call it through asyncio.to_thread from async code.
"""

from __future__ import annotations

import datetime as dt
import time
from dataclasses import dataclass
from typing import Any

from app.core import dates
from app.core.database import Database

HOW = ("auto", "manual", "estimate")
MAX_NAME = 60


@dataclass(frozen=True)
class Bill:
    id: int
    name: str
    amount: int
    every: str
    anchor: str  # a due date the schedule runs from
    account_id: int | None
    how: str
    match: str
    category_id: int | None

    @property
    def per_year(self) -> int:
        return self.amount * dates.PER_YEAR[self.every]

    def next_due(self, on_or_after: dt.date | None = None) -> dt.date:
        return dates.next_on_or_after(dates.parse(self.anchor), self.every, on_or_after or dates.today())

    def due_between(self, start: dt.date, end: dt.date) -> list[dt.date]:
        return list(dates.occurrences(dates.parse(self.anchor), self.every, start, end))

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "amount": self.amount,
            "every": self.every,
            "next_due": self.next_due().isoformat(),
            "account_id": self.account_id,
            "how": self.how,
            "match": self.match,
            "category_id": self.category_id,
            "per_year": self.per_year,
        }


_COLUMNS = "id, name, amount, every, next_due, account_id, how, match, category_id"


def _row(r: tuple[Any, ...]) -> Bill:
    return Bill(*r)


def clean(body: dict[str, Any]) -> dict[str, Any]:
    """A bill's fields, checked. Raises ValueError in words."""
    name = " ".join(str(body.get("name") or "").split())
    if not name or len(name) > MAX_NAME:
        raise ValueError("Give the bill a name.")
    try:
        amount = int(body.get("amount"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise ValueError("Enter the bill's amount.") from None
    if amount <= 0:
        raise ValueError("A bill's amount should be more than $0.")
    every = str(body.get("every") or "monthly")
    if every not in dates.EVERY:
        raise ValueError("Choose how often the bill comes.")
    try:
        due = dates.parse(str(body.get("next_due") or ""))
    except ValueError:
        raise ValueError("Enter when the bill is next due.") from None
    how = str(body.get("how") or "auto")
    if how not in HOW:
        raise ValueError("Say whether it's paid automatically, by hand or is an estimate.")
    account = body.get("account_id")
    category = body.get("category_id")
    return {
        "name": name,
        "amount": amount,
        "every": every,
        "next_due": due.isoformat(),
        "account_id": int(account) if account not in (None, "") else None,
        "how": how,
        "match": " ".join(str(body.get("match") or "").upper().split())[:60],
        "category_id": int(category) if category not in (None, "") else None,
    }


class BillsService:
    def __init__(self, db: Database):
        self.db = db

    def all(self) -> list[Bill]:
        with self.db.reading() as conn:
            rows = conn.execute(f"SELECT {_COLUMNS} FROM bills WHERE active = 1 ORDER BY name").fetchall()
        return [_row(r) for r in rows]

    def get(self, bill_id: int) -> Bill | None:
        with self.db.reading() as conn:
            row = conn.execute(f"SELECT {_COLUMNS} FROM bills WHERE id = ? AND active = 1", (bill_id,)).fetchone()
        return _row(row) if row else None

    def add(self, body: dict[str, Any]) -> Bill:
        f = clean(body)
        with self.db.writing() as conn:
            cur = conn.execute(
                "INSERT INTO bills (name, amount, every, next_due, account_id, how, match, category_id, created_at)"
                " VALUES (:name, :amount, :every, :next_due, :account_id, :how, :match, :category_id, :now)",
                {**f, "now": int(time.time())},
            )
        bill = self.get(int(cur.lastrowid or 0))
        assert bill is not None
        return bill

    def update(self, bill_id: int, body: dict[str, Any]) -> Bill:
        current = self.get(bill_id)
        if current is None:
            raise LookupError("That bill has gone.")
        f = clean({**current.view(), **body})
        with self.db.writing() as conn:
            conn.execute(
                "UPDATE bills SET name = :name, amount = :amount, every = :every, next_due = :next_due,"
                " account_id = :account_id, how = :how, match = :match, category_id = :category_id WHERE id = :id",
                {**f, "id": bill_id},
            )
        bill = self.get(bill_id)
        assert bill is not None
        return bill

    def remove(self, bill_id: int) -> bool:
        with self.db.writing() as conn:
            return conn.execute("UPDATE bills SET active = 0 WHERE id = ? AND active = 1", (bill_id,)).rowcount > 0

    # -- what they add up to --------------------------------------------------------

    def per_month(self, account_id: int | None = None) -> float:
        """The average month's bills in cents (all of them, or those paid from one account)."""
        bills = [b for b in self.all() if account_id is None or b.account_id == account_id]
        return sum(b.per_year for b in bills) / 12

    def due(self, start: dt.date, end: dt.date, account_id: int | None = None) -> list[dict[str, Any]]:
        """Every bill falling due from start to end (inclusive), soonest first."""
        out = []
        for b in self.all():
            if account_id is not None and b.account_id != account_id:
                continue
            for day in b.due_between(start, end):
                out.append({"bill_id": b.id, "name": b.name, "date": day.isoformat(), "amount": b.amount, "how": b.how})
        return sorted(out, key=lambda x: (x["date"], -int(x["amount"])))

    def by_month(self, months: int = 12) -> list[dict[str, Any]]:
        """What the bills add up to in each of the coming months (this one first)."""
        first = dates.today().replace(day=1)
        out = []
        for i in range(months):
            start = dates.add_months(first, i)
            end = dates.add_months(first, i + 1) - dt.timedelta(days=1)
            items = self.due(start, end)
            out.append(
                {"month": start.strftime("%Y-%m"), "total": sum(int(x["amount"]) for x in items), "count": len(items)}
            )
        return out

    def overview(self, bills_account: dict[str, Any] | None) -> dict[str, Any]:
        """The Bills page: every bill, what they come to, the buffer against its target, and the months ahead."""
        bills = self.all()
        today = dates.today()
        per_year = sum(b.per_year for b in bills)
        biggest = max((b.per_year for b in bills), default=0)
        next30 = self.due(today, today + dt.timedelta(days=30))
        return {
            "bills": sorted(
                [{**b.view(), "share": b.per_year / biggest if biggest else 0} for b in bills],
                key=lambda b: -int(b["per_year"]),
            ),
            "per_year": per_year,
            "per_month": round(per_year / 12),
            "next30": {
                "total": sum(int(x["amount"]) for x in next30),
                "count": len(next30),
                "by_hand": sum(1 for x in next30 if x["how"] == "manual"),
                "items": next30,
            },
            "by_month": self.by_month(),
            "account": bills_account,
        }
