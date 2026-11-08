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
from app.features.bills import detect
from app.features.spending import merchants

HOW = ("auto", "manual", "estimate")
DISMISSED = "bill_dismissed:"  # kv: a suggestion (or update) the household said no to
LOOK_BACK_MONTHS = 25
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

    def link(self, bill_id: int, tx_id: int) -> int:
        """Make a payment part of a bill, with the same merchant's other payments for about the same amount (any
        amount for an estimate) that aren't part of a bill yet, sorting those with no category into the bill's.
        Returns how many were linked."""
        bill = self.get(bill_id)
        if bill is None:
            raise LookupError("That bill has gone.")
        with self.db.writing() as conn:
            row = conn.execute(
                "SELECT merchant, -amount FROM transactions WHERE id = ? AND amount < 0", (tx_id,)
            ).fetchone()
            if not row:
                raise LookupError("That payment has gone.")
            merchant, amount = str(row[0] or ""), int(row[1])
            ids = [tx_id]
            if merchant:
                rows = conn.execute(
                    "SELECT t.id, t.merchant, -t.amount FROM transactions t JOIN accounts a ON a.id = t.account_id"
                    " WHERE a.kind = 'bank' AND t.amount < 0 AND t.bill_id IS NULL AND t.id != ?"
                    " AND t.kind IN ('statement', 'manual')",
                    (tx_id,),
                ).fetchall()
                near = max(amount // 4, 500)
                ids += [
                    r[0]
                    for r in rows
                    if merchants.matches(str(r[1] or ""), merchant)
                    and (bill.how == "estimate" or abs(int(r[2]) - amount) <= near)
                ]
            marks = ",".join("?" * len(ids))
            conn.execute(f"UPDATE transactions SET bill_id = ? WHERE id IN ({marks})", (bill.id, *ids))
            if bill.category_id is not None:
                conn.execute(
                    f"UPDATE transactions SET category_id = ?, category_by = 'bill' WHERE id IN ({marks})"
                    " AND (category_id IS NULL OR category_by IS NULL OR category_by IN ('rule', 'suggest'))",
                    (bill.category_id, *ids),
                )
        return len(ids)

    # -- one bill and what it's cost ------------------------------------------------

    def detail(self, bill_id: int) -> dict[str, Any]:
        """One bill: its payments (oldest first), what they add up to, when its price changed, and what's ahead.

        Its payments are the statement lines matched to it (on import, or when a spotted bill was added). A price
        change is a payment for a different amount that the next one stayed at (or the latest); an estimate's
        amounts vary, so it has none.
        """
        bill = self.get(bill_id)
        if bill is None:
            raise LookupError("That bill has gone.")
        today = dates.today()
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT id, date, -amount FROM transactions WHERE bill_id = ? AND amount < 0 ORDER BY date, id",
                (bill_id,),
            ).fetchall()
        payments = [{"id": r[0], "date": r[1], "amount": r[2]} for r in rows]
        amounts = [int(p["amount"]) for p in payments]
        total = sum(amounts)
        year_ago = (today - dt.timedelta(days=365)).isoformat()

        def moved(a: int, b: int) -> bool:
            return abs(a - b) > max(detect.CHANGED_CENTS, round(max(a, b) * detect.CHANGED))

        changes = []
        if bill.how != "estimate":
            for i in range(1, len(amounts)):
                was, now = amounts[i - 1], amounts[i]
                stayed = i == len(amounts) - 1 or not moved(amounts[i + 1], now)
                if moved(was, now) and stayed:
                    changes.append({"date": payments[i]["date"], "was": was, "now": now})
        ahead = self.due(today, dates.add_months(today, 12) - dt.timedelta(days=1))
        mine = [x for x in ahead if x["bill_id"] == bill_id]
        all_per_year = sum(b.per_year for b in self.all())
        return {
            "bill": bill.view(),
            "payments": payments,
            "total": total,
            "count": len(payments),
            "average": round(total / len(payments)) if payments else None,
            "last_year": sum(int(p["amount"]) for p in payments if p["date"] >= year_ago),
            "first": payments[0]["date"] if payments else None,
            "changes": changes,
            "upcoming": [{"date": x["date"], "amount": x["amount"]} for x in mine[:6]],
            "next_year": sum(int(x["amount"]) for x in mine),
            "share": bill.per_year / all_per_year if all_per_year else 0,
        }

    # -- bills spotted in the ledger --------------------------------------------------

    def _payments(self) -> tuple[list[detect.Payment], dict[int, str], set[int], dict[int, str]]:
        since = dates.add_months(dates.today(), -LOOK_BACK_MONTHS).isoformat()
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT t.id, t.account_id, t.date, -t.amount, t.description, t.merchant, t.category_id, t.bill_id"
                " FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c"
                " ON c.id = t.category_id WHERE a.kind = 'bank' AND t.amount < 0 AND t.date >= ?"
                " AND t.kind IN ('statement', 'manual') AND t.rule_id IS NULL AND COALESCE(c.kind, '') != 'transfer'"
                " AND UPPER(t.description) NOT LIKE '%TRANSFER%'",
                (since,),
            ).fetchall()
            ends = dict(
                conn.execute(
                    "SELECT account_id, MAX(date) FROM transactions WHERE kind = 'statement' GROUP BY account_id"
                ).fetchall()
            )
            cats = conn.execute("SELECT id, name, kind FROM categories").fetchall()
        payments = [detect.Payment(*r) for r in rows]
        return payments, ends, {c[0] for c in cats if c[2] == "bills"}, {c[0]: c[1] for c in cats}

    def _dismissed(self) -> set[str]:
        with self.db.reading() as conn:
            rows = conn.execute("SELECT key FROM kv WHERE key LIKE ?", (DISMISSED + "%",)).fetchall()
        return {r[0][len(DISMISSED) :] for r in rows}

    def spotted(self) -> dict[str, Any]:
        """Bills the ledger suggests (not added yet, not dismissed), and bills whose price has moved."""
        payments, ends, bill_cats, names = self._payments()
        found = detect.find(payments, self.all(), bill_cats, names, ends, dates.today())
        no = self._dismissed()
        return {
            "suggestions": [s for s in found["suggestions"] if s["key"] not in no],
            "updates": [u for u in found["updates"] if u["key"] not in no],
        }

    def dismiss(self, key: str) -> None:
        key = str(key or "")[:200]
        if not key:
            raise ValueError("Say which suggestion.")
        with self.db.writing() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (DISMISSED + key, str(int(time.time())))
            )

    def accept(self, key: str, changes: dict[str, Any] | None = None) -> Bill:
        """Add a spotted bill (with any changes the household made to it), and link the payments it was spotted
        from, sorting those with no category into the bill's."""
        found = next((s for s in self.spotted()["suggestions"] if s["key"] == key), None)
        if found is None:
            raise LookupError("That suggestion has gone: the bills page has the latest.")
        body = {
            k: found[k] for k in ("name", "amount", "every", "next_due", "account_id", "how", "match", "category_id")
        }
        bill = self.add({**body, **(changes or {})})
        ids = found["transaction_ids"]
        with self.db.writing() as conn:
            marks = ",".join("?" * len(ids))
            conn.execute(f"UPDATE transactions SET bill_id = ? WHERE id IN ({marks})", (bill.id, *ids))
            if bill.category_id is not None:
                conn.execute(
                    f"UPDATE transactions SET category_id = ?, category_by = 'bill' WHERE id IN ({marks})"
                    " AND (category_id IS NULL OR category_by IS NULL OR category_by IN ('rule', 'suggest'))",
                    (bill.category_id, *ids),
                )
        return bill
