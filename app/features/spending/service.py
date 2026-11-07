"""
Spending: categories and their budgets, the merchant rules learned from the household's choices, adding spending by
hand, and the spending month (top-up to top-up): what's left, the daily pace and what's safe to spend.

A category's `kind` says what it counts as: spending (in budgets and pace), bills, income, or transfer (money moving
between the household's own accounts, or out to cash, which counts when the cash is spent).

Everything here blocks on SQLite, so call it through asyncio.to_thread from async code.
"""

from __future__ import annotations

import datetime as dt
import sqlite3
import time
from typing import Any

from app.core import dates
from app.core.database import Database
from app.features.spending import merchants

CATEGORY_KINDS = ("spending", "bills", "income", "transfer")
# A new household's categories, with the designs' starting budgets (cents a month).
DEFAULT_CATEGORIES: list[tuple[str, str, int | None]] = [
    ("Groceries", "spending", 120000),
    ("Eating out", "spending", 30000),
    ("Fuel", "spending", 38000),
    ("Fun", "spending", 25000),
    ("Kids", "spending", 25000),
    ("Home", "spending", 25000),
    ("Health", "spending", 20000),
    ("Other", "spending", None),
    ("Bills", "bills", None),
    ("Pay", "income", None),
    ("Interest", "income", None),
    ("Transfer", "transfer", None),
    ("Cash out", "transfer", None),
]
MAX_NOTE = 200


def seed_categories(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT 1 FROM categories LIMIT 1").fetchone():
        return
    for i, (name, kind, budget) in enumerate(DEFAULT_CATEGORIES):
        conn.execute("INSERT INTO categories (name, kind, budget, sort) VALUES (?, ?, ?, ?)", (name, kind, budget, i))


def category_by_name(conn: sqlite3.Connection, name: str) -> int | None:
    row = conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()
    return int(row[0]) if row else None


def learned(conn: sqlite3.Connection) -> list[tuple[str, int]]:
    """The learned merchant rules, longest pattern first (so the most specific wins)."""
    rows = conn.execute("SELECT pattern, category_id FROM merchant_rules").fetchall()
    return sorted(((p, c) for p, c in rows), key=lambda r: -len(r[0]))


def rule_for(rules: list[tuple[str, int]], merchant_text: str) -> int | None:
    for pattern, category in rules:
        if merchants.matches(merchant_text, pattern):
            return category
    return None


class SpendingService:
    def __init__(self, db: Database):
        self.db = db

    def seed(self) -> None:
        with self.db.writing() as conn:
            seed_categories(conn)

    # -- categories -------------------------------------------------------------------

    def categories(self) -> list[dict[str, Any]]:
        with self.db.reading() as conn:
            rows = conn.execute("SELECT id, name, kind, budget, icon FROM categories ORDER BY sort, name").fetchall()
        return [{"id": r[0], "name": r[1], "kind": r[2], "budget": r[3], "icon": r[4]} for r in rows]

    def save_category(self, body: dict[str, Any], category_id: int | None = None) -> dict[str, Any]:
        name = " ".join(str(body.get("name") or "").split())[:40]
        if not name:
            raise ValueError("Give the category a name.")
        kind = str(body.get("kind") or "spending")
        if kind not in CATEGORY_KINDS:
            raise ValueError("A category is spending, bills, income or a transfer.")
        budget = body.get("budget")
        budget = int(budget) if budget not in (None, "") else None
        if budget is not None and budget < 0:
            raise ValueError("A budget can't be less than $0.")
        with self.db.writing() as conn:
            clash = conn.execute(
                "SELECT id FROM categories WHERE name = ? AND id != ?", (name, category_id or 0)
            ).fetchone()
            if clash:
                raise ValueError(f"There's already a category called {name}.")
            if category_id is None:
                sort = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM categories").fetchone()[0]
                cur = conn.execute(
                    "INSERT INTO categories (name, kind, budget, sort) VALUES (?, ?, ?, ?)", (name, kind, budget, sort)
                )
                category_id = int(cur.lastrowid or 0)
            elif not conn.execute(
                "UPDATE categories SET name = ?, kind = ?, budget = ? WHERE id = ?", (name, kind, budget, category_id)
            ).rowcount:
                raise LookupError("That category has gone.")
        return next(c for c in self.categories() if c["id"] == category_id)

    def remove_category(self, category_id: int) -> bool:
        with self.db.writing() as conn:
            conn.execute("UPDATE transactions SET category_id = NULL WHERE category_id = ?", (category_id,))
            conn.execute("DELETE FROM merchant_rules WHERE category_id = ?", (category_id,))
            return conn.execute("DELETE FROM categories WHERE id = ?", (category_id,)).rowcount > 0

    def merchant_rules(self) -> list[dict[str, Any]]:
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT m.id, m.pattern, m.category_id, c.name FROM merchant_rules m"
                " JOIN categories c ON c.id = m.category_id ORDER BY m.pattern"
            ).fetchall()
        return [{"id": r[0], "pattern": r[1], "category_id": r[2], "category": r[3]} for r in rows]

    def remove_merchant_rule(self, rule_id: int) -> bool:
        with self.db.writing() as conn:
            return conn.execute("DELETE FROM merchant_rules WHERE id = ?", (rule_id,)).rowcount > 0

    # -- transactions -----------------------------------------------------------------

    def add(self, body: dict[str, Any], user_id: int | None) -> dict[str, Any]:
        """Spending (or money in) typed in by hand: `amount` in cents, negative for spending. `cash` keeps it out of
        the account's balance (it came from a wallet)."""
        try:
            amount = int(body.get("amount"))  # type: ignore[arg-type]
            account_id = int(body.get("account_id"))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            raise ValueError("Enter the amount and the account.") from None
        if amount == 0:
            raise ValueError("Enter an amount.")
        description = " ".join(str(body.get("description") or "").split())[:120]
        if not description:
            raise ValueError("Say what it was for, like Woolworths.")
        try:
            day = dates.parse(str(body.get("date") or dates.today().isoformat()))
        except ValueError:
            raise ValueError("That date isn't one we can read.") from None
        if day > dates.today():
            raise ValueError("That's in the future: add it on the day.")
        category = body.get("category_id")
        kind = "cash" if body.get("cash") else "manual"
        note = str(body.get("note") or "").strip()[:MAX_NOTE]
        with self.db.writing() as conn:
            if not conn.execute("SELECT 1 FROM accounts WHERE id = ? AND kind = 'bank'", (account_id,)).fetchone():
                raise ValueError("Choose one of your accounts.")
            m = merchants.merchant(description)
            if category in (None, ""):
                category = rule_for(learned(conn), m)
            cur = conn.execute(
                "INSERT INTO transactions (account_id, date, amount, description, merchant, kind, category_id, note,"
                " user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (account_id, day.isoformat(), amount, description, m, kind, category, note, user_id, int(time.time())),
            )
            tx_id = int(cur.lastrowid or 0)
        return self.transaction(tx_id)

    def transaction(self, tx_id: int) -> dict[str, Any]:
        rows = self.transactions(ids=[tx_id])
        if not rows:
            raise LookupError("That transaction has gone.")
        return rows[0]

    def transactions(
        self,
        account_id: int | None = None,
        start: str | None = None,
        end: str | None = None,
        limit: int = 200,
        ids: list[int] | None = None,
        search: str | None = None,
    ) -> list[dict[str, Any]]:
        sql = (
            "SELECT t.id, t.account_id, t.date, t.amount, t.description, t.kind, t.category_id, c.name, c.kind, t.note,"
            " t.rule_id, t.bill_id, t.user_id, u.display_name, u.username, t.merged FROM transactions t"
            " LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN users u ON u.id = t.user_id WHERE 1 = 1"
        )
        args: list[Any] = []
        if account_id is not None:
            sql += " AND t.account_id = ?"
            args.append(account_id)
        if start:
            sql += " AND t.date >= ?"
            args.append(start)
        if end:
            sql += " AND t.date <= ?"
            args.append(end)
        if ids:
            sql += f" AND t.id IN ({','.join('?' * len(ids))})"
            args += ids
        if search:
            sql += " AND (t.description LIKE ? OR t.note LIKE ?)"
            args += [f"%{search}%", f"%{search}%"]
        sql += " ORDER BY t.date DESC, t.id DESC LIMIT ?"
        args.append(limit)
        with self.db.reading() as conn:
            rows = conn.execute(sql, args).fetchall()
        return [
            {
                "id": r[0],
                "account_id": r[1],
                "date": r[2],
                "amount": r[3],
                "description": r[4],
                "kind": r[5],
                "category_id": r[6],
                "category": r[7],
                "category_kind": r[8],
                "note": r[9],
                "rule_id": r[10],
                "bill_id": r[11],
                "user_id": r[12],
                "who": (r[13] or r[14]) if r[12] else None,
                "merged": bool(r[15]),
            }
            for r in rows
        ]

    def update_transaction(self, tx_id: int, body: dict[str, Any]) -> dict[str, Any]:
        """Change a transaction's category or note. With `always`, remember the category for its merchant and
        apply it to the merchant's earlier transactions that have no category yet."""
        with self.db.writing() as conn:
            row = conn.execute("SELECT merchant, kind FROM transactions WHERE id = ?", (tx_id,)).fetchone()
            if not row:
                raise LookupError("That transaction has gone.")
            if "category_id" in body:
                category = body["category_id"]
                category = int(category) if category not in (None, "") else None
                conn.execute("UPDATE transactions SET category_id = ? WHERE id = ?", (category, tx_id))
                if body.get("always") and category is not None and row[0]:
                    self._learn(conn, row[0], category)
            if "note" in body:
                conn.execute(
                    "UPDATE transactions SET note = ? WHERE id = ?", (str(body["note"] or "")[:MAX_NOTE], tx_id)
                )
            if "description" in body and row[1] in ("manual", "cash"):
                text = " ".join(str(body["description"] or "").split())[:120]
                if text:
                    conn.execute(
                        "UPDATE transactions SET description = ?, merchant = ? WHERE id = ?",
                        (text, merchants.merchant(text), tx_id),
                    )
        return self.transaction(tx_id)

    def learn(self, description: str, category_id: int) -> int:
        with self.db.writing() as conn:
            return self._learn(conn, merchants.merchant(description), category_id)

    @staticmethod
    def _learn(conn: sqlite3.Connection, merchant_text: str, category_id: int) -> int:
        """Remember a merchant's category, and give it to that merchant's uncategorised transactions. Returns how
        many earlier ones it was given to."""
        pattern = " ".join(merchant_text.split()[: merchants.WORDS])
        if not pattern:
            return 0
        conn.execute(
            "INSERT INTO merchant_rules (pattern, category_id, created_at) VALUES (?, ?, ?)"
            " ON CONFLICT (pattern) DO UPDATE SET category_id = excluded.category_id",
            (pattern, category_id, int(time.time())),
        )
        return conn.execute(
            "UPDATE transactions SET category_id = ? WHERE category_id IS NULL AND (merchant = ? OR merchant LIKE ?)",
            (category_id, pattern, pattern + " %"),
        ).rowcount

    def remove_transaction(self, tx_id: int) -> bool:
        """Only what was typed in (or an adjustment) can be removed: a statement's rows are the bank's."""
        with self.db.writing() as conn:
            row = conn.execute("SELECT kind FROM transactions WHERE id = ?", (tx_id,)).fetchone()
            if not row:
                return False
            if row[0] == "statement":
                raise ValueError("That came from a statement, so it stays. Change its category instead.")
            return conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,)).rowcount > 0

    # -- the spending month -----------------------------------------------------------

    def period(self, top_up: Any | None) -> tuple[dt.date, dt.date]:
        """The spending month: from the last top-up to the day before the next (or the calendar month)."""
        today = dates.today()
        if top_up is not None:
            start = top_up.last_run(today) or today
            end = top_up.next_run(today + dt.timedelta(days=1)) - dt.timedelta(days=1)
            return start, end
        start = today.replace(day=1)
        return start, dates.add_months(start, 1) - dt.timedelta(days=1)

    def month(self, accounts: list[int], left: int, allowance: int, top_up: Any | None) -> dict[str, Any]:
        """The spending month for the spending accounts: what's left, the pace, safe to spend, by category and day."""
        start, end = self.period(top_up)
        today = dates.today()
        days = (end - start).days + 1
        elapsed = min(max((today - start).days + 1, 1), days)
        remaining = max(days - elapsed, 0)
        cats = self.categories()
        spending_ids = {c["id"] for c in cats if c["kind"] == "spending"}
        rows: list[tuple[str, int, int | None, int | None, int | None]] = []
        if accounts:
            with self.db.reading() as conn:
                rows = conn.execute(
                    f"SELECT date, amount, category_id, rule_id, user_id FROM transactions WHERE account_id IN"
                    f" ({','.join('?' * len(accounts))}) AND date BETWEEN ? AND ? AND kind IN ('statement', 'manual',"
                    " 'cash')",
                    [*accounts, start.isoformat(), end.isoformat()],
                ).fetchall()
        daily = [0] * days
        by_category: dict[int | None, int] = {}
        by_person: dict[int | None, int] = {}
        spent = 0
        for day, amount, category, rule_id, user_id in rows:
            if rule_id is not None or (category is not None and category not in spending_ids):
                continue
            if category is None and amount > 0:
                continue  # money in that isn't sorted yet isn't a refund we can be sure of
            out = -amount
            spent += out
            i = (dates.parse(day) - start).days
            if 0 <= i < days:
                daily[i] += out
            by_category[category] = by_category.get(category, 0) + out
            by_person[user_id] = by_person.get(user_id, 0) + out
        pace = elapsed / days
        budgets = [
            {
                "id": c["id"],
                "name": c["name"],
                "budget": c["budget"],
                "spent": by_category.get(c["id"], 0),
            }
            for c in cats
            if c["kind"] == "spending" and (c["budget"] or by_category.get(c["id"]))
        ]
        unsorted = by_category.get(None, 0)
        budgeted = sum(c["budget"] or 0 for c in cats if c["kind"] == "spending")
        per_day = spent / elapsed if elapsed else 0
        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "days": days,
            "day": elapsed,
            "remaining": remaining,
            "allowance": allowance,
            "left": left,
            "spent": spent,
            "safe_per_day": round(left / remaining) if remaining else left,
            "even_per_day": round(allowance / days) if days else 0,
            "vs_pace": round(spent - allowance * pace),
            "pace": pace,
            "projected": round(left - per_day * remaining),
            "daily": daily,
            "categories": budgets,
            "unsorted": unsorted,
            "unbudgeted": max(allowance - budgeted, 0),
            "by_person": [{"user_id": k, "spent": v} for k, v in by_person.items()],
        }
