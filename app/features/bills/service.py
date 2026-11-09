"""
Bills: what comes out regularly, how often, when next, and from which account.

A bill is entered once with its amount, how often (dates.EVERY) and its next due date; the dates after that follow
the schedule, so a bill's next due date moves on by itself. The bills buffer's target is a number of months of the
bills paid from that account.

Everything here blocks on SQLite, so call it through asyncio.to_thread from async code.
"""

from __future__ import annotations

import datetime as dt
import re
import sqlite3
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
OCCASIONAL = ("quarterly", "term", "half-yearly", "yearly")  # a few times a year or less: worth setting aside for
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


_REF_DIGITS = re.compile(r"\d+")


def signature(description: str) -> str:
    """A statement line with its numbers set aside, to tell the same payee's lines apart from others when there's no
    merchant to go on: "EIDA-4410938271" and "EIDA-4410938295" are both "EIDA-#"."""
    return " ".join(_REF_DIGITS.sub("#", description.upper()).split())


def _unlinked(conn: sqlite3.Connection, exclude: int | None = None) -> list[dict[str, Any]]:
    """Payments out of the household's bank accounts that aren't part of any bill (statement lines and ones typed in)."""
    rows = conn.execute(
        "SELECT t.id, t.date, -t.amount, t.merchant, t.description, a.name FROM transactions t"
        " JOIN accounts a ON a.id = t.account_id WHERE a.kind = 'bank' AND t.amount < 0 AND t.bill_id IS NULL"
        " AND t.kind IN ('statement', 'manual') AND t.rule_id IS NULL AND t.id != ?",
        (exclude if exclude is not None else -1,),
    ).fetchall()
    return [
        {
            "id": r[0],
            "date": r[1],
            "amount": r[2],
            "merchant": str(r[3] or ""),
            "description": str(r[4] or ""),
            "account": r[5],
        }
        for r in rows
    ]


def _alike(r: dict[str, Any], merchant: str, sig: str) -> bool:
    if merchant:
        return merchants.matches(r["merchant"], merchant)
    return not r["merchant"] and signature(r["description"]) == sig


def _merchant_from_bill(conn: sqlite3.Connection, name: str, ids: list[int]) -> None:
    from app.features.spending import directory

    clean = merchants.merchant(name)
    known = merchants.brand(clean) if clean else None
    key = merchants.CANONICAL.get(known, known) if known else None
    if not key:
        return
    book = directory.Book(conn)
    marks = ",".join("?" * len(ids))
    for tx_id, text, description, amount, bill_id in conn.execute(
        f"SELECT id, merchant, description, amount, bill_id FROM transactions WHERE id IN ({marks})", ids
    ).fetchall():
        if book.key(text or "", description, amount, tx_id, bill_id) == key:
            continue
        if tx_id in book.overrides or (text and text in book.aliases):
            continue  # the household already said who it is
        if text and not directory.is_unnamed(text):
            directory.assign(conn, text, key, None)
            book.aliases[text] = key
        else:
            conn.execute("UPDATE transactions SET merchant_override = ? WHERE id = ?", (key, tx_id))


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

    def restore(self, bill_id: int) -> None:
        """Undo a remove: the bill comes back as it was, with its payments still linked."""
        with self.db.writing() as conn:
            if not conn.execute("UPDATE bills SET active = 1 WHERE id = ? AND active = 0", (bill_id,)).rowcount:
                raise LookupError("That bill can't be brought back.")

    def status(self, bill_id: int) -> dict[str, Any]:
        """Where a bill stands, for the list: "paid" (its latest due date is paid), "late" (a due date has passed
        unpaid), "soon" (due within a week) or "later", with the due date it's about."""
        d = self.due_now(bill_id)
        if d is None:
            return {"status": "later", "status_date": None}
        today = dates.today()
        day = dates.parse(d["date"])
        st = (
            "paid"
            if d["paid"]
            else "late"
            if day < today
            else "soon"
            if day <= today + dt.timedelta(days=7)
            else "later"
        )
        return {"status": st, "status_date": d["date"]}

    def due_now(self, bill_id: int) -> dict[str, Any] | None:
        """The due date to mark paid on the bill's page: the first one from a fortnight ago to its next due date that
        hasn't been paid, or else the latest of them (paid)."""
        bill = self.get(bill_id)
        if bill is None:
            return None
        today = dates.today()
        items = [d for d in self.due(today - dt.timedelta(days=14), bill.next_due()) if d["bill_id"] == bill_id]
        return next((d for d in items if d["paid"] is None), items[-1] if items else None)

    # -- what they add up to --------------------------------------------------------

    def per_month(self, account_id: int | None = None) -> float:
        """The average month's bills in cents (all of them, or those paid from one account)."""
        bills = [b for b in self.all() if account_id is None or b.account_id == account_id]
        return sum(b.per_year for b in bills) / 12

    def due(self, start: dt.date, end: dt.date, account_id: int | None = None) -> list[dict[str, Any]]:
        """Every bill falling due from start to end (inclusive), soonest first. `paid` is the payment made for that
        due date, if there is one: a payment of the bill after the time before it fell due and up to a week after."""
        out = []
        bills = [b for b in self.all() if account_id is None or b.account_id == account_id]
        with self.db.reading() as conn:
            paid_on = {
                b.id: [
                    (r[0], r[1], -int(r[2]))
                    for r in conn.execute(
                        "SELECT id, date, amount FROM transactions WHERE bill_id = ? AND amount < 0 ORDER BY date",
                        (b.id,),
                    )
                ]
                for b in bills
            }
        for b in bills:
            for day in b.due_between(start, end):
                before = list(dates.occurrences(dates.parse(b.anchor), b.every, day - dt.timedelta(days=400), day))
                after = before[-2] if len(before) > 1 else day - dt.timedelta(days=31)
                window = (after.isoformat(), (day + dt.timedelta(days=7)).isoformat())
                paid = next(
                    (
                        {"transaction_id": t, "date": d, "amount": a}
                        for t, d, a in paid_on[b.id]
                        if window[0] < d <= window[1]
                    ),
                    None,
                )
                out.append(
                    {
                        "bill_id": b.id,
                        "name": b.name,
                        "date": day.isoformat(),
                        "amount": b.amount,
                        "how": b.how,
                        "paid": paid,
                    }
                )
        return sorted(out, key=lambda x: (x["date"], -int(x["amount"])))

    def pay(self, bill_id: int, amount: int | None, day: str | None, user_id: int | None) -> dict[str, Any]:
        """Mark a bill paid by hand: a typed-in payment of it (its amount unless another is given, today unless another
        day is), from the account it's paid from or else the bills account. Undo removes that payment."""
        bill = self.get(bill_id)
        if bill is None:
            raise LookupError("That bill has gone.")
        cents = bill.amount if amount is None else int(amount)
        if cents <= 0:
            raise ValueError("How much was paid?")
        when = dates.parse(day) if day else dates.today()
        if when > dates.today():
            raise ValueError("That day hasn't come yet.")
        with self.db.writing() as conn:
            account = bill.account_id or next(
                (r[0] for r in conn.execute("SELECT id FROM accounts WHERE role = 'bills' AND archived = 0 LIMIT 1")),
                None,
            )
            if account is None:
                raise ValueError("Which account was it paid from? Set that on the bill.")
            cur = conn.execute(
                "INSERT INTO transactions (account_id, date, amount, description, merchant, kind, category_id,"
                " category_by, bill_id, user_id, created_at) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?)",
                (
                    account,
                    when.isoformat(),
                    -cents,
                    bill.name,
                    merchants.merchant(bill.name),
                    bill.category_id,
                    "bill" if bill.category_id is not None else None,
                    bill.id,
                    user_id,
                    int(time.time()),
                ),
            )
        return {
            "transaction_id": int(cur.lastrowid or 0),
            "bill_id": bill.id,
            "amount": cents,
            "date": when.isoformat(),
        }

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

    def set_aside(self) -> dict[str, Any]:
        """The bills that come a few times a year or less (quarterly, a term, half-yearly, yearly) and setting money
        aside for them: each one's monthly share, and how much of it should be built up by now (its share of the time
        since it was last due), so it's all there when it lands. Soonest first."""
        today = dates.today()
        items: list[dict[str, Any]] = []
        for b in self.all():
            if b.every not in OCCASIONAL:
                continue
            nxt = b.next_due(today)
            last = dates.last_on_or_before(dates.parse(b.anchor), b.every, today - dt.timedelta(days=1))
            if last is None or last >= nxt:
                last = dates.step(nxt, b.every, -1)
            period = max((nxt - last).days, 1)
            elapsed = min(max((today - last).days, 0), period)
            items.append(
                {
                    "bill_id": b.id,
                    "name": b.name,
                    "amount": b.amount,
                    "every": b.every,
                    "how": b.how,
                    "account_id": b.account_id,
                    "next_due": nxt.isoformat(),
                    "days": (nxt - today).days,
                    "per_month": round(b.per_year / 12),
                    "built": round(b.amount * elapsed / period),
                }
            )
        items.sort(key=lambda x: (x["next_due"], -int(x["amount"])))
        return {
            "items": items,
            "per_year": sum(int(x["amount"]) * dates.PER_YEAR[str(x["every"])] for x in items),
            "per_month": sum(int(x["per_month"]) for x in items),
            "built": sum(int(x["built"]) for x in items),
        }

    def overview(self, bills_account: dict[str, Any] | None) -> dict[str, Any]:
        """The Bills page: every bill, what they come to, the buffer against its target, and the months ahead."""
        bills = self.all()
        today = dates.today()
        per_year = sum(b.per_year for b in bills)
        biggest = max((b.per_year for b in bills), default=0)
        next30 = self.due(today, today + dt.timedelta(days=30))
        first = today.replace(day=1)
        last = (first + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)
        return {
            "bills": sorted(
                [{**b.view(), "share": b.per_year / biggest if biggest else 0, **self.status(b.id)} for b in bills],
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
            # This calendar month's due dates, paid or not, for the calendar.
            "calendar": {"month": first.isoformat()[:7], "items": self.due(first, last)},
            "account": bills_account,
            "set_aside": self.set_aside(),
        }

    def link(self, bill_id: int, tx_id: int) -> int:
        """Make a payment part of a bill, with its other payments that look the same (the same merchant, or with no
        merchant the same statement line once its numbers are set aside: "EIDA-4410938271") for about the same amount
        (any amount for an estimate) that aren't part of a bill yet. Learns how the bill shows up, so it's matched on
        import from then on. Returns how many were linked."""
        bill = self.get(bill_id)
        if bill is None:
            raise LookupError("That bill has gone.")
        with self.db.writing() as conn:
            row = conn.execute(
                "SELECT merchant, description, -amount FROM transactions WHERE id = ? AND amount < 0", (tx_id,)
            ).fetchone()
            if not row:
                raise LookupError("That payment has gone.")
            merchant, sig, amount = str(row[0] or ""), signature(str(row[1] or "")), int(row[2])
            near = max(amount // 4, 500)
            ids = [tx_id] + [
                r["id"]
                for r in _unlinked(conn, exclude=tx_id)
                if _alike(r, merchant, sig) and (bill.how == "estimate" or abs(r["amount"] - amount) <= near)
            ]
            self._attach(conn, bill, ids)
        return len(ids)

    def link_many(self, bill_id: int, tx_ids: list[int]) -> int:
        """Make exactly these payments part of a bill (picked on the bill's page), and learn how it shows up."""
        bill = self.get(bill_id)
        if bill is None:
            raise LookupError("That bill has gone.")
        ids = sorted({int(i) for i in tx_ids})
        if not ids:
            raise ValueError("Pick the payments that are this bill.")
        with self.db.writing() as conn:
            marks = ",".join("?" * len(ids))
            found = [
                r[0]
                for r in conn.execute(
                    f"SELECT id FROM transactions WHERE id IN ({marks}) AND amount < 0", ids
                ).fetchall()
            ]
            if not found:
                raise LookupError("Those payments have gone.")
            self._attach(conn, bill, found)
        return len(found)

    def candidates(self, bill_id: int) -> list[dict[str, Any]]:
        """Payments from the last year or so, not part of any bill, that look like this bill: matched by how it shows
        up (its match, the merchant of a payment already in it, or its name), for about its amount (any amount for an
        estimate). Newest first, each with why it looks like it."""
        bill = self.get(bill_id)
        if bill is None:
            raise LookupError("That bill has gone.")
        since = (dates.today() - dt.timedelta(days=400)).isoformat()
        with self.db.reading() as conn:
            known = conn.execute(
                "SELECT DISTINCT merchant, description FROM transactions WHERE bill_id = ?", (bill.id,)
            ).fetchall()
            merchants_in = {str(m) for m, _ in known if m}
            sigs_in = {signature(str(d)) for m, d in known if not m}
            first = bill.name.upper().split()[0] if bill.name else ""
            near = max(bill.amount // 4, 500)
            out = []
            for r in _unlinked(conn):
                if r["date"] < since:
                    continue
                m = r["merchant"]
                why = None
                if bill.match and bill.match in m:
                    why = f"Shows up as {bill.match}"
                elif any(merchants.matches(m, k) for k in merchants_in):
                    why = "Same merchant as its other payments"
                elif not m and signature(r["description"]) in sigs_in:
                    why = "Same statement line as its other payments"
                elif first and len(first) >= 4 and first in m.split():
                    why = f"Has {bill.name.split()[0]} in it"
                if why is None:
                    continue
                if bill.how != "estimate" and abs(r["amount"] - bill.amount) > near:
                    continue
                out.append({**r, "why": why})
        out.sort(key=lambda r: (r["date"], r["id"]), reverse=True)
        return out[:60]

    def _attach(self, conn: sqlite3.Connection, bill: Bill, ids: list[int]) -> None:
        marks = ",".join("?" * len(ids))
        conn.execute(f"UPDATE transactions SET bill_id = ? WHERE id IN ({marks})", (bill.id, *ids))
        if bill.category_id is not None:
            conn.execute(
                f"UPDATE transactions SET category_id = ?, category_by = 'bill' WHERE id IN ({marks})"
                " AND (category_id IS NULL OR category_by IS NULL OR category_by IN ('rule', 'suggest'))",
                (bill.category_id, *ids),
            )
        # A bill named for a business the app knows (Superloop) makes its payments that business's, so they show its
        # name and mark however the statement put it ("EIDA-4410938271").
        _merchant_from_bill(conn, bill.name, ids)
        # Learn how the bill shows up, so later statements are matched to it: the merchant its payments share.
        if not bill.match:
            names = {
                r[0]
                for r in conn.execute(
                    f"SELECT DISTINCT merchant FROM transactions WHERE id IN ({marks})", ids
                ).fetchall()
            }
            if len(names) == 1 and (name := next(iter(names))):
                conn.execute("UPDATE bills SET match = ? WHERE id = ?", (name[:60], bill.id))

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
