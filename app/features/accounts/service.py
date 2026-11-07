"""
The household's accounts and the home loan: their jobs (roles), balances, ledgers, targets and savings goals.

Roles, and the target each gives an account:
- offset: grow until it covers the loan (100% of its balance);
- bills: hold `target_months` months of the bills paid from it (3 unless changed);
- spending: a month of everyday money, topped up *to* `allowance`;
- savings: split into goals;
- track: just a balance.

Everything here blocks on SQLite, so call it through asyncio.to_thread from async code.
"""

from __future__ import annotations

import datetime as dt
import sqlite3
import time
from typing import Any

from app.core import dates
from app.core.database import Database
from app.features.accounts import ledger, loan
from app.features.bills.service import BillsService

ROLES = ("offset", "bills", "spending", "savings", "track")
COLOURS = ("offset", "bills", "spending", "savings", "track", "teal", "rose", "sky")
ROLE_COLOUR = {"offset": "offset", "bills": "bills", "spending": "spending", "savings": "savings", "track": "track"}
MAX_NAME = 40
MAX_ACCOUNTS = 20

_COLUMNS = (
    "id, name, kind, role, last4, colour, offsets_loan, target_months, allowance, alert_below, rate_bp, repayment,"
    " repay_from, goal_date, sort"
)


def _row(r: tuple[Any, ...]) -> dict[str, Any]:
    return {
        "id": r[0],
        "name": r[1],
        "kind": r[2],
        "role": r[3],
        "last4": r[4],
        "colour": r[5],
        "offsets_loan": bool(r[6]),
        "target_months": r[7],
        "allowance": r[8],
        "alert_below": bool(r[9]),
        "rate_bp": r[10],
        "repayment": r[11],
        "repay_from": r[12],
        "goal_date": r[13],
        "sort": r[14],
    }


def money(body: dict[str, Any], key: str) -> int | None:
    value = body.get(key)
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{key.replace('_', ' ').capitalize()} should be an amount in cents.") from None


def _clean(body: dict[str, Any], kind: str) -> dict[str, Any]:
    name = " ".join(str(body.get("name") or "").split())
    if not name or len(name) > MAX_NAME:
        raise ValueError("Give the account a name, like the one in your banking app.")
    last4 = "".join(c for c in str(body.get("last4") or "") if c.isdigit())[-4:] or None
    out: dict[str, Any] = {"name": name, "kind": kind, "last4": last4}
    if kind == "loan":
        rate = body.get("rate_bp")
        try:
            rate_bp = int(rate) if rate not in (None, "") else 0
        except (TypeError, ValueError):
            raise ValueError("Enter the interest rate.") from None
        if not 0 <= rate_bp <= 3000:
            raise ValueError("The interest rate should be between 0% and 30%.")
        goal = body.get("goal_date")
        if goal:
            try:
                dt.date.fromisoformat(str(goal) + ("-01" if len(str(goal)) == 7 else ""))
            except ValueError:
                raise ValueError("The goal should be a month, like 2033-12.") from None
        out.update(
            role="track",
            colour="track",
            offsets_loan=0,
            rate_bp=rate_bp,
            repayment=money(body, "repayment"),
            repay_from=int(body["repay_from"]) if body.get("repay_from") not in (None, "") else None,
            goal_date=str(goal)[:7] if goal else None,
            target_months=None,
            allowance=None,
            alert_below=0,
        )
        return out
    role = str(body.get("role") or "track")
    if role not in ROLES:
        raise ValueError("Choose the account's job: offset, bills, spending, savings or just track it.")
    colour = str(body.get("colour") or ROLE_COLOUR[role])
    if colour not in COLOURS:
        colour = ROLE_COLOUR[role]
    months = body.get("target_months")
    try:
        target_months = float(months) if months not in (None, "") else (3.0 if role == "bills" else None)
    except (TypeError, ValueError):
        raise ValueError("The bills buffer is a number of months.") from None
    if target_months is not None and not 0.5 <= target_months <= 24:
        raise ValueError("Hold between half a month and 24 months of bills.")
    out.update(
        role=role,
        colour=colour,
        offsets_loan=int(bool(body.get("offsets_loan", True))),
        target_months=target_months if role == "bills" else None,
        allowance=money(body, "allowance") if role == "spending" else None,
        alert_below=int(bool(body.get("alert_below", True))),
        rate_bp=None,
        repayment=None,
        repay_from=None,
        goal_date=None,
    )
    return out


class AccountsService:
    def __init__(self, db: Database, bills: BillsService):
        self.db = db
        self.bills = bills

    # -- the accounts themselves --------------------------------------------------------

    def rows(self, conn: sqlite3.Connection | None = None) -> list[dict[str, Any]]:
        def read(c: sqlite3.Connection) -> list[dict[str, Any]]:
            rows = c.execute(f"SELECT {_COLUMNS} FROM accounts WHERE archived = 0 ORDER BY kind, sort, id").fetchall()
            return [_row(r) for r in rows]

        if conn is not None:
            return read(conn)
        with self.db.reading() as c:
            return read(c)

    def get(self, account_id: int) -> dict[str, Any] | None:
        return next((a for a in self.rows() if a["id"] == account_id), None)

    def add(self, body: dict[str, Any], user_id: int | None = None) -> dict[str, Any]:
        kind = "loan" if body.get("kind") == "loan" else "bank"
        f = _clean(body, kind)
        opening = money(body, "balance")
        now = int(time.time())
        with self.db.writing() as conn:
            if conn.execute("SELECT COUNT(*) FROM accounts WHERE archived = 0").fetchone()[0] >= MAX_ACCOUNTS:
                raise ValueError("That's a lot of accounts. Archive some you don't use first.")
            sort = conn.execute("SELECT COALESCE(MAX(sort), 0) + 1 FROM accounts").fetchone()[0]
            cur = conn.execute(
                "INSERT INTO accounts (name, kind, role, last4, colour, offsets_loan, target_months, allowance,"
                " alert_below, rate_bp, repayment, repay_from, goal_date, sort, created_at) VALUES (:name, :kind,"
                " :role, :last4, :colour, :offsets_loan, :target_months, :allowance, :alert_below, :rate_bp,"
                " :repayment, :repay_from, :goal_date, :sort, :now)",
                {**f, "sort": sort, "now": now},
            )
            account_id = int(cur.lastrowid or 0)
            if opening is not None:
                # Today's balance, as typed in: rough, like a check-in. Setting it exactly later adds the adjustment.
                ledger.add_known(conn, account_id, dates.today().isoformat(), opening, "checkin", False, now)
        account = self.get(account_id)
        assert account is not None
        return account

    def update(self, account_id: int, body: dict[str, Any]) -> dict[str, Any]:
        current = self.get(account_id)
        if current is None:
            raise LookupError("That account has gone.")
        f = _clean({**current, **body}, current["kind"])
        with self.db.writing() as conn:
            conn.execute(
                "UPDATE accounts SET name = :name, role = :role, last4 = :last4, colour = :colour,"
                " offsets_loan = :offsets_loan, target_months = :target_months, allowance = :allowance,"
                " alert_below = :alert_below, rate_bp = :rate_bp, repayment = :repayment, repay_from = :repay_from,"
                " goal_date = :goal_date WHERE id = :id",
                {**f, "id": account_id},
            )
        account = self.get(account_id)
        assert account is not None
        return account

    def archive(self, account_id: int) -> bool:
        with self.db.writing() as conn:
            return conn.execute("UPDATE accounts SET archived = 1 WHERE id = ?", (account_id,)).rowcount > 0

    def by_last4(self, last4: str) -> dict[str, Any] | None:
        return next((a for a in self.rows() if a["kind"] == "bank" and a["last4"] == last4), None)

    # -- balances -----------------------------------------------------------------------

    def balances(self) -> dict[int, int]:
        with self.db.reading() as conn:
            return {a["id"]: ledger.balance(conn, a["id"]) for a in self.rows(conn)}

    def set_balance(
        self, account_id: int, balance: int, exact: bool, when: str = "today", user_id: int | None = None
    ) -> dict[str, Any]:
        """Set an account's balance (or the loan's). Exact: make the ledger match with a balance adjustment."""
        account = self.get(account_id)
        if account is None:
            raise LookupError("That account has gone.")
        now = int(time.time())
        today = dates.today().isoformat()
        adjustment = None
        with self.db.writing() as conn:
            if exact and account["kind"] == "bank":
                adjustment = ledger.adjust_to(conn, account_id, balance, when, now, user_id)
            ledger.add_known(conn, account_id, today, balance, "exact" if exact else "checkin", exact, now + 1)
        return {"account": self.view(account_id), "adjustment": adjustment}

    def add_opening(self, account_id: int, amount: int, user_id: int | None = None) -> dict[str, Any]:
        """Add `amount` to the account's opening balance (dated the day before its history starts), as when an import
        shows the transactions falling short of the statement's balance. Changes no balance known since."""
        if self.get(account_id) is None:
            raise LookupError("That account has gone.")
        with self.db.writing() as conn:
            done = ledger.adjust_to(
                conn, account_id, ledger.ledger(conn, account_id) + amount, "opening", int(time.time()), user_id
            )
        if done is None:
            raise ValueError("There's nothing to add.")
        return done

    # -- what each account is for, and how it's doing ------------------------------------

    def loan(self) -> dict[str, Any] | None:
        return next((a for a in self.rows() if a["kind"] == "loan"), None)

    def view(self, account_id: int) -> dict[str, Any]:
        found = next((a for a in self.overview()["accounts"] if a["id"] == account_id), None)
        if found is None:
            raise LookupError("That account has gone.")
        return found

    def overview(self) -> dict[str, Any]:
        """Every account with its balance, ledger, the gap between them, its target and how it's tracking; the loan;
        and the offsetting total."""
        today = dates.today()
        month_ago = (today - dt.timedelta(days=30)).isoformat()
        bills_by_account = {b.account_id for b in self.bills.all()}
        out: list[dict[str, Any]] = []
        loan_row = None
        with self.db.reading() as conn:
            rows = self.rows(conn)
            for a in rows:
                bal = ledger.balance(conn, a["id"])
                known = ledger.latest_known(conn, a["id"])
                led = ledger.ledger(conn, a["id"])
                txs = conn.execute(
                    "SELECT COUNT(*), MIN(date) FROM transactions WHERE account_id = ?", (a["id"],)
                ).fetchone()
                item = {
                    **a,
                    "balance": bal,
                    "ledger": led,
                    "gap": bal - led if txs[0] else 0,
                    "transactions": txs[0],
                    "history_from": txs[1],
                    "known": {"date": known.date, "source": known.source, "exact": known.exact} if known else None,
                    "change_30d": bal - ledger.balance(conn, a["id"], month_ago),
                }
                if a["kind"] == "loan":
                    loan_row = item
                    continue
                out.append(item)
            goals = conn.execute("SELECT id, account_id, name, target, saved FROM goals ORDER BY sort, id").fetchall()
        offsetting = sum(a["balance"] for a in out if a["offsets_loan"])
        loan_balance = loan_row["balance"] if loan_row else 0
        for a in out:
            a["target"] = self._target(a, loan_balance, bills_by_account, goals)
        return {
            "accounts": out,
            "loan": loan_row,
            "offsetting": offsetting,
            "total": sum(a["balance"] for a in out),
            "goals": [{"id": g[0], "account_id": g[1], "name": g[2], "target": g[3], "saved": g[4]} for g in goals],
        }

    def _target(
        self, a: dict[str, Any], loan_balance: int, bills_by_account: set[int | None], goals: list[tuple[Any, ...]]
    ) -> dict[str, Any] | None:
        role, bal = a["role"], a["balance"]
        if role == "offset":
            return {"kind": "loan", "amount": loan_balance, "progress": bal / loan_balance if loan_balance else 0}
        if role == "bills":
            # The bills paid from this account (all of them, until any are set to come from it).
            per_month = self.bills.per_month(a["id"] if a["id"] in bills_by_account else None)
            months = a["target_months"] or 3
            amount = round(per_month * months)
            return {
                "kind": "months",
                "months": months,
                "per_month": round(per_month),
                "amount": amount,
                "held": bal / per_month if per_month else None,
                "progress": bal / amount if amount else 0,
            }
        if role == "spending":
            allowance = a["allowance"] or 0
            return {"kind": "allowance", "amount": allowance, "progress": bal / allowance if allowance else 0}
        if role == "savings":
            mine = [g for g in goals if g[1] == a["id"]]
            target = sum(g[3] for g in mine)
            return {"kind": "goals", "count": len(mine), "amount": target, "progress": bal / target if target else 0}
        return None

    def history(self, account_id: int, days: int = 180) -> list[tuple[str, int]]:
        end = dates.today()
        with self.db.reading() as conn:
            return ledger.series(conn, account_id, end - dt.timedelta(days=days - 1), end)

    # -- savings goals --------------------------------------------------------------------

    def save_goal(self, body: dict[str, Any], goal_id: int | None = None) -> dict[str, Any]:
        name = " ".join(str(body.get("name") or "").split())[:40]
        if not name:
            raise ValueError("Give the goal a name, like Japan trip.")
        target = money(body, "target")
        if not target or target <= 0:
            raise ValueError("Enter how much the goal needs.")
        saved = money(body, "saved") or 0
        account_id = body.get("account_id")
        with self.db.writing() as conn:
            if goal_id is None:
                if account_id in (None, ""):
                    raise ValueError("Choose the savings account the goal is in.")
                cur = conn.execute(
                    "INSERT INTO goals (account_id, name, target, saved, sort) VALUES (?, ?, ?, ?,"
                    " (SELECT COALESCE(MAX(sort), 0) + 1 FROM goals))",
                    (int(account_id), name, target, saved),
                )
                goal_id = int(cur.lastrowid or 0)
            elif not conn.execute(
                "UPDATE goals SET name = ?, target = ?, saved = ? WHERE id = ?", (name, target, saved, goal_id)
            ).rowcount:
                raise LookupError("That goal has gone.")
        return next(g for g in self.overview()["goals"] if g["id"] == goal_id)

    def remove_goal(self, goal_id: int) -> bool:
        with self.db.writing() as conn:
            return conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,)).rowcount > 0

    # -- the loan ---------------------------------------------------------------------------

    def loan_view(self, monthly_growth: int, planned_growth: int) -> dict[str, Any] | None:
        """The Loan page: coverage, interest, and when it's fully offset at the recent pace and the planned one."""
        ov = self.overview()
        lo = ov["loan"]
        if lo is None:
            return None
        offsetting = ov["offsetting"]
        offset_only = sum(a["balance"] for a in ov["accounts"] if a["role"] == "offset")
        rate = lo["rate_bp"] or 0
        repayment = lo["repayment"] or 0
        owed = lo["balance"]
        recent = loan.project(owed, offsetting, rate, repayment, monthly_growth)
        planned = loan.project(owed, offsetting, rate, repayment, planned_growth)
        return {
            "loan": lo,
            "offsetting": offsetting,
            "offset_only": offset_only,
            "coverage": offsetting / owed if owed else 0,
            "coverage_offset_only": offset_only / owed if owed else 0,
            "interest_per_day": loan.daily_interest(offsetting, owed, rate),
            "charged_per_month": max(owed - offsetting, 0) * rate / 10000 / 12,
            "principal_per_month": repayment - max(owed - offsetting, 0) * rate / 10000 / 12,
            "monthly_growth": monthly_growth,
            "planned_growth": planned_growth,
            "recent": {"date": recent.date, "months": recent.months, "points": recent.points},
            "planned": {"date": planned.date, "months": planned.months, "points": planned.points},
            "scenarios": loan.scenarios(owed, offsetting, rate, repayment, monthly_growth, (0, 20000, 50000, 100000)),
            "by_account": [
                {
                    "id": a["id"],
                    "name": a["name"],
                    "colour": a["colour"],
                    "balance": a["balance"],
                    "share": a["balance"] / owed if owed else 0,
                }
                for a in sorted(ov["accounts"], key=lambda a: -a["balance"])
                if a["offsets_loan"]
            ],
        }

    def offsetting_growth(self, days: int = 90) -> int:
        """How fast the offsetting accounts have grown lately, in cents a month (from their balances `days` ago)."""
        today = dates.today()
        then = (today - dt.timedelta(days=days)).isoformat()
        with self.db.reading() as conn:
            accounts = [a for a in self.rows(conn) if a["kind"] == "bank" and a["offsets_loan"]]
            now_total = sum(ledger.balance(conn, a["id"]) for a in accounts)
            # Only accounts known back then count, or a new one would look like growth.
            then_total = 0
            for a in accounts:
                first = conn.execute(
                    "SELECT MIN(d) FROM (SELECT MIN(date) d FROM balances WHERE account_id = ?"
                    " UNION SELECT MIN(date) FROM transactions WHERE account_id = ?)",
                    (a["id"], a["id"]),
                ).fetchone()[0]
                if first is None or first > then:
                    return 0
                then_total += ledger.balance(conn, a["id"], then)
        return round((now_total - then_total) * 30.4 / days)
