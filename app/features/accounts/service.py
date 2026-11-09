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
import re
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


GOAL_ICONS = ("plane", "car", "shield", "home", "kids", "play")


# What happened to a reached goal's money: still in the account, spent on the thing, or moved to the offset.
GOAL_OUTCOMES = ("kept", "spent", "offset")


def goal_ref(name: str) -> str:
    """The description to give a goal's transfers so imports can match them: GOAL and the first ten letters and
    numbers of its name (the app shows the same)."""
    cut = re.sub(r"[^A-Z0-9 ]", "", name.upper())[:10].strip()
    return f"GOAL {cut or 'NEW'}"


def _plain(text: str) -> str:
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", text.upper()).split())


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
                raise ValueError("That's a lot of accounts. Remove some you don't use first.")
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
        """Hide an account, keeping its history. The loan stops being paid from it."""
        with self.db.writing() as conn:
            done = conn.execute(
                "UPDATE accounts SET archived = 1 WHERE id = ? AND archived = 0", (account_id,)
            ).rowcount
            if done:
                conn.execute("UPDATE accounts SET repay_from = NULL WHERE repay_from = ?", (account_id,))
            return done > 0

    def archived(self) -> list[dict[str, Any]]:
        """The accounts that were removed, newest first, with how many transactions each kept."""
        with self.db.reading() as conn:
            rows = conn.execute(
                f"SELECT {_COLUMNS}, (SELECT COUNT(*) FROM transactions t WHERE t.account_id = accounts.id)"
                " FROM accounts WHERE archived = 1 ORDER BY id DESC"
            ).fetchall()
            return [{**_row(r), "transactions": r[-1], "balance": ledger.balance(conn, r[0])} for r in rows]

    def restore(self, account_id: int) -> dict[str, Any]:
        """Bring a removed account back, with its history."""
        with self.db.writing() as conn:
            row = conn.execute("SELECT kind FROM accounts WHERE id = ? AND archived = 1", (account_id,)).fetchone()
            if row is None:
                raise LookupError("That account isn't one you removed.")
            if conn.execute("SELECT COUNT(*) FROM accounts WHERE archived = 0").fetchone()[0] >= MAX_ACCOUNTS:
                raise ValueError("That's a lot of accounts. Remove one you don't use first.")
            if (
                row[0] == "loan"
                and conn.execute("SELECT 1 FROM accounts WHERE kind = 'loan' AND archived = 0").fetchone()
            ):
                raise ValueError("There's already a home loan. Remove it first to bring this one back.")
            conn.execute("UPDATE accounts SET archived = 0 WHERE id = ?", (account_id,))
        account = self.get(account_id)
        assert account is not None
        return account

    def by_last4(self, last4: str) -> dict[str, Any] | None:
        return next((a for a in self.rows() if a["last4"] == last4), None)

    def loan_changes(self, account_id: int) -> list[dict[str, Any]]:
        """The loan's rate and repayment over time, newest first, as its statements showed them."""
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT date, field, value, was, description FROM loan_changes WHERE account_id = ?"
                " ORDER BY date DESC, id DESC",
                (account_id,),
            ).fetchall()
        return [{"date": r[0], "field": r[1], "value": r[2], "was": r[3], "description": r[4]} for r in rows]

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
        ov = self.overview()
        found = next((a for a in [*ov["accounts"], ov["loan"]] if a and a["id"] == account_id), None)
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
            goals = conn.execute(
                "SELECT id, account_id, name, target, saved, icon, by_date, reached_at, outcome FROM goals"
                " WHERE removed_at IS NULL ORDER BY sort, id"
            ).fetchall()
            planned: dict[int, list[dict[str, Any]]] = {}
            for move_id, goal_id, amount, day in conn.execute(
                "SELECT id, goal_id, amount, date FROM goal_moves WHERE status = 'planned' ORDER BY date, id"
            ):
                planned.setdefault(goal_id, []).append({"id": move_id, "amount": amount, "date": day})
        offsetting = sum(a["balance"] for a in out if a["offsets_loan"])
        loan_balance = loan_row["balance"] if loan_row else 0
        for a in out:
            a["target"] = self._target(a, loan_balance, bills_by_account, goals)
        return {
            "accounts": out,
            "loan": loan_row,
            "offsetting": offsetting,
            "total": sum(a["balance"] for a in out),
            "goals": [
                {
                    "id": g[0],
                    "account_id": g[1],
                    "name": g[2],
                    "target": g[3],
                    "saved": g[4],
                    "icon": g[5],
                    "by_date": g[6],
                    "ref": goal_ref(g[2]),
                    "planned": planned.get(g[0], []),
                    "reached_at": g[7],
                    "outcome": g[8],
                }
                for g in goals
            ],
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

    def activity(self, account_id: int, days: int = 365) -> dict[str, Any]:
        """Up to a year of an account, a day at a time: its balance at the end of the day and the money in and out.

        For the loan, money in is what's added to what's owed (interest, drawdowns) and money out is what's repaid. A
        loan with no statement imported is estimated: interest charged at each month's end on what the offsetting
        accounts don't cover, and repayments from the account it's paid from (its payments that name the loan's last
        four digits, as uBank's "HOME LOAN REPAYMENT 9917" does)."""
        days = min(max(days, 7), 366)
        end = dates.today()
        start = end - dt.timedelta(days=days - 1)
        rows = self.rows()
        account = next((a for a in rows if a["id"] == account_id), None)
        if account is None:
            raise LookupError("That account has gone.")
        kinds = ",".join("?" * len(ledger.IN_LEDGER))
        with self.db.reading() as conn:
            series = ledger.series(conn, account_id, start, end)
            flows = {
                d: (int(i or 0), int(o or 0))
                for d, i, o in conn.execute(
                    "SELECT date, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),"
                    " SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) FROM transactions"
                    f" WHERE account_id = ? AND kind IN ({kinds}) AND date BETWEEN ? AND ? GROUP BY date",
                    (account_id, *ledger.IN_LEDGER, start.isoformat(), end.isoformat()),
                )
            }
            has_statements = conn.execute(
                "SELECT 1 FROM transactions WHERE account_id = ? AND kind = 'statement' LIMIT 1", (account_id,)
            ).fetchone()
            if account["kind"] == "loan" and not has_statements:
                return self._estimated_loan(conn, account, rows, start, end, series[-1][1])
        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "estimated": False,
            "days": [
                {"date": d, "balance": b, "in": flows.get(d, (0, 0))[0], "out": flows.get(d, (0, 0))[1]}
                for d, b in series
            ],
        }

    def _estimated_loan(
        self,
        conn: sqlite3.Connection,
        account: dict[str, Any],
        rows: list[dict[str, Any]],
        start: dt.date,
        end: dt.date,
        owed_now: int,
    ) -> dict[str, Any]:
        n = (end - start).days + 1
        days = [start + dt.timedelta(days=i) for i in range(n)]
        offsetting = [0] * n
        for a in rows:
            if a["kind"] == "bank" and a["offsets_loan"]:
                for i, (_, value) in enumerate(ledger.series(conn, a["id"], start, end)):
                    offsetting[i] += value
        repaid = [0] * n
        if account["repay_from"] and account["last4"]:
            kinds = ",".join("?" * len(ledger.IN_LEDGER))
            for d, amount in conn.execute(
                f"SELECT date, amount FROM transactions WHERE account_id = ? AND kind IN ({kinds}) AND amount < 0"
                " AND date BETWEEN ? AND ? AND description LIKE ?",
                (account["repay_from"], *ledger.IN_LEDGER, start.isoformat(), end.isoformat(), f"%{account['last4']}%"),
            ):
                repaid[(dates.parse(d) - start).days] += -amount
        rate = (account["rate_bp"] or 0) / 10000 / 365
        owed = [owed_now] * n
        charged = [0] * n
        # What's owed depends on the interest and the interest on what's owed: two passes settle it closely enough.
        for _ in range(2):
            charged = [0] * n
            accrued = 0.0
            for i, day in enumerate(days):
                accrued += max(owed[i] - offsetting[i], 0) * rate
                if (day + dt.timedelta(days=1)).month != day.month:
                    charged[i] = round(accrued)
                    accrued = 0.0
            balance = owed_now
            for i in range(n - 1, -1, -1):
                owed[i] = balance
                balance -= charged[i] - repaid[i]
        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "estimated": True,
            "days": [
                {"date": days[i].isoformat(), "balance": owed[i], "in": charged[i], "out": repaid[i]} for i in range(n)
            ],
        }

    # -- savings goals --------------------------------------------------------------------

    def save_goal(self, body: dict[str, Any], goal_id: int | None = None) -> dict[str, Any]:
        """Add a goal, or change one (what's left out of `body` stays as it was)."""
        with self.db.writing() as conn:
            was: dict[str, Any] = {}
            if goal_id is not None:
                row = conn.execute(
                    "SELECT name, target, saved, icon, by_date FROM goals WHERE id = ?", (goal_id,)
                ).fetchone()
                if row is None:
                    raise LookupError("That goal has gone.")
                was = dict(zip(("name", "target", "saved", "icon", "by_date"), row, strict=True))
            body = {**was, **body}
            name = " ".join(str(body.get("name") or "").split())[:40]
            if not name:
                raise ValueError("Give the goal a name, like Japan trip.")
            target = money(body, "target")
            if not target or target <= 0:
                raise ValueError("Enter how much the goal needs.")
            saved = max(money(body, "saved") or 0, 0)
            icon = body.get("icon") or None
            if icon is not None and icon not in GOAL_ICONS:
                raise ValueError("Choose one of the goal icons.")
            by_date = body.get("by_date") or None
            if by_date is not None:
                try:
                    by_date = dates.parse(str(by_date)).isoformat()
                except ValueError:
                    raise ValueError("Choose when the goal should be reached by.") from None
            if goal_id is None:
                account_id = body.get("account_id")
                if account_id in (None, ""):
                    raise ValueError("Choose the savings account the goal is in.")
                cur = conn.execute(
                    "INSERT INTO goals (account_id, name, target, saved, icon, by_date, sort) VALUES (?, ?, ?, ?, ?, ?,"
                    " (SELECT COALESCE(MAX(sort), 0) + 1 FROM goals))",
                    (int(account_id), name, target, saved, icon, by_date),
                )
                goal_id = int(cur.lastrowid or 0)
            else:
                conn.execute(
                    "UPDATE goals SET name = ?, target = ?, saved = ?, icon = ?, by_date = ? WHERE id = ?",
                    (name, target, saved, icon, by_date, goal_id),
                )
        return next(g for g in self.overview()["goals"] if g["id"] == goal_id)

    def top_up_goal(self, goal_id: int, amount: int, moved: bool = True) -> dict[str, Any]:
        """Money into a goal: moved now (counted straight away) or planned (counted once it's moved, or once a
        statement shows it). A negative amount takes money out (it won't go below nothing)."""
        today = dates.today().isoformat()
        with self.db.writing() as conn:
            if not conn.execute("SELECT 1 FROM goals WHERE id = ? AND removed_at IS NULL", (goal_id,)).fetchone():
                raise LookupError("That goal has gone.")
            if moved:
                conn.execute("UPDATE goals SET saved = MAX(saved + ?, 0) WHERE id = ?", (amount, goal_id))
            if amount > 0:
                conn.execute(
                    "INSERT INTO goal_moves (goal_id, amount, date, status, created_at) VALUES (?, ?, ?, ?, ?)",
                    (goal_id, amount, today, "moved" if moved else "planned", int(time.time())),
                )
        return next(g for g in self.overview()["goals"] if g["id"] == goal_id)

    def settle_move(self, move_id: int, moved: bool) -> dict[str, Any]:
        """A planned move: done (counted now) or not happening (forgotten)."""
        with self.db.writing() as conn:
            row = conn.execute(
                "SELECT goal_id, amount FROM goal_moves WHERE id = ? AND status = 'planned'", (move_id,)
            ).fetchone()
            if row is None:
                raise LookupError("That planned top-up has gone.")
            if moved:
                conn.execute(
                    "UPDATE goal_moves SET status = 'moved', date = ? WHERE id = ?",
                    (dates.today().isoformat(), move_id),
                )
                conn.execute("UPDATE goals SET saved = saved + ? WHERE id = ?", (row[1], row[0]))
            else:
                conn.execute("DELETE FROM goal_moves WHERE id = ?", (move_id,))
        return next(g for g in self.overview()["goals"] if g["id"] == row[0])

    def match_goal_transfers(self) -> int:
        """Statement rows into a goal's account whose description names the goal (GOAL KITCHEN): each counts toward
        it once. One the household already said it moved (same amount, within three weeks) is linked rather than
        counted again; a planned one is counted now. Returns how many were matched."""
        matched = 0
        with self.db.writing() as conn:
            goals = conn.execute("SELECT id, account_id, name FROM goals WHERE removed_at IS NULL").fetchall()
            if not goals:
                return 0
            since = (dates.today() - dt.timedelta(days=400)).isoformat()
            rows = conn.execute(
                "SELECT id, account_id, date, amount, description FROM transactions WHERE kind = 'statement'"
                " AND amount > 0 AND date >= ? AND upper(description) LIKE '%GOAL%'"
                " AND id NOT IN (SELECT transaction_id FROM goal_moves WHERE transaction_id IS NOT NULL)"
                " ORDER BY date, id",
                (since,),
            ).fetchall()
            for tx_id, account_id, day, amount, description in rows:
                said = _plain(description)
                goal = next(
                    (g for g in goals if g[1] == account_id and f" {_plain(goal_ref(g[2]))} " in f" {said} "), None
                )
                if goal is None:
                    continue
                lo = (dates.parse(day) - dt.timedelta(days=21)).isoformat()
                hi = (dates.parse(day) + dt.timedelta(days=21)).isoformat()
                move = conn.execute(
                    "SELECT id, status FROM goal_moves WHERE goal_id = ? AND amount = ? AND transaction_id IS NULL"
                    " AND status IN ('moved', 'planned') AND date BETWEEN ? AND ? ORDER BY status = 'moved' DESC,"
                    " date LIMIT 1",
                    (goal[0], amount, lo, hi),
                ).fetchone()
                if move is None:
                    conn.execute(
                        "INSERT INTO goal_moves (goal_id, amount, date, status, transaction_id, created_at)"
                        " VALUES (?, ?, ?, 'matched', ?, ?)",
                        (goal[0], amount, day, tx_id, int(time.time())),
                    )
                    conn.execute("UPDATE goals SET saved = saved + ? WHERE id = ?", (amount, goal[0]))
                else:
                    conn.execute("UPDATE goal_moves SET transaction_id = ? WHERE id = ?", (tx_id, move[0]))
                    if move[1] == "planned":
                        conn.execute("UPDATE goal_moves SET status = 'moved', date = ? WHERE id = ?", (day, move[0]))
                        conn.execute("UPDATE goals SET saved = saved + ? WHERE id = ?", (amount, goal[0]))
                matched += 1
        return matched

    def remove_goal(self, goal_id: int) -> bool:
        """Take a goal off the list: what it saved stays in the account, just not in a goal. Undo brings it back."""
        with self.db.writing() as conn:
            return (
                conn.execute(
                    "UPDATE goals SET removed_at = ? WHERE id = ? AND removed_at IS NULL",
                    (dates.today().isoformat(), goal_id),
                ).rowcount
                > 0
            )

    def restore_goal(self, goal_id: int) -> dict[str, Any]:
        with self.db.writing() as conn:
            if not conn.execute(
                "UPDATE goals SET removed_at = NULL WHERE id = ? AND removed_at IS NOT NULL", (goal_id,)
            ).rowcount:
                raise LookupError("That goal can't be brought back.")
        return next(g for g in self.overview()["goals"] if g["id"] == goal_id)

    def reach_goal(self, goal_id: int, outcome: str | None) -> dict[str, Any]:
        """Say a goal is reached and what happened to the money (kept in the account, spent, or moved to the offset),
        or with no outcome, that it isn't reached after all."""
        if outcome is not None and outcome not in GOAL_OUTCOMES:
            raise ValueError("Say what happened to the money.")
        with self.db.writing() as conn:
            if not conn.execute(
                "UPDATE goals SET reached_at = ?, outcome = ? WHERE id = ? AND removed_at IS NULL",
                (dates.today().isoformat() if outcome else None, outcome, goal_id),
            ).rowcount:
                raise LookupError("That goal has gone.")
        return next(g for g in self.overview()["goals"] if g["id"] == goal_id)

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
            "changes": self.loan_changes(lo["id"])[:6],
            "interest_charged": self.interest_charged(lo["id"]),
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

    def interest_charged(self, loan_id: int, months: int = 12) -> dict[str, Any] | None:
        """The interest the loan's imported statements actually charged: each of the last `months` months (this one
        included), the latest charge and the year's total. None until a loan statement is imported. On the loan what's
        owed is positive, so a charge is a positive row; a reversal of one (negative) takes it back off."""
        today = dates.today()
        first = dates.add_months(today.replace(day=1), -(months - 1))
        keys = [dates.add_months(first, i).strftime("%Y-%m") for i in range(months)]
        with self.db.reading() as conn:
            if not conn.execute(
                "SELECT 1 FROM transactions WHERE account_id = ? AND kind = 'statement' LIMIT 1", (loan_id,)
            ).fetchone():
                return None
            rows = conn.execute(
                "SELECT date, amount FROM transactions WHERE account_id = ? AND kind = 'statement'"
                " AND UPPER(description) LIKE '%INTEREST%' AND date >= ? ORDER BY date",
                (loan_id, first.isoformat()),
            ).fetchall()
            last = conn.execute(
                "SELECT date, amount FROM transactions WHERE account_id = ? AND kind = 'statement'"
                " AND UPPER(description) LIKE '%INTEREST%' AND amount > 0 ORDER BY date DESC, id DESC LIMIT 1",
                (loan_id,),
            ).fetchone()
        by_month = dict.fromkeys(keys, 0)
        for day, amount in rows:
            if day[:7] in by_month:
                by_month[day[:7]] += amount
        counted = [m for m in keys if by_month[m]]
        total = sum(by_month.values())
        return {
            "months": [{"month": m, "amount": by_month[m]} for m in keys],
            "last": {"date": last[0], "amount": last[1]} if last else None,
            "year": total,
            "per_month": round(total / len(counted)) if counted else 0,
        }

    def change_rate(self, rate_bp: int, repayment: int | None, since: str) -> dict[str, Any]:
        """The rate changed: set the loan's rate (and repayment, if it changed too) and record both as changes from
        `since`, so the loan's history shows them."""
        if not 0 < rate_bp <= 3000:
            raise ValueError("Enter the new rate, like 6.37.")
        if repayment is not None and repayment <= 0:
            raise ValueError("Enter the repayment.")
        try:
            day = dates.parse(since).isoformat()
        except ValueError:
            raise ValueError("Choose when the new rate starts.") from None
        lo = self.loan()
        if lo is None:
            raise LookupError("There's no home loan yet.")
        now = int(time.time())
        with self.db.writing() as conn:
            for field, value, was in (("rate", rate_bp, lo["rate_bp"]), ("repayment", repayment, lo["repayment"])):
                if value is None or value == was:
                    continue
                conn.execute(
                    "INSERT OR IGNORE INTO loan_changes (account_id, date, field, value, was, description, created_at)"
                    " VALUES (?, ?, ?, ?, ?, 'Changed in the app', ?)",
                    (lo["id"], day, field, value, was, now),
                )
            conn.execute(
                "UPDATE accounts SET rate_bp = ?, repayment = COALESCE(?, repayment) WHERE id = ?",
                (rate_bp, repayment, lo["id"]),
            )
        return self.view(lo["id"])

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
