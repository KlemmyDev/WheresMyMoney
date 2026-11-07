"""
What each account holds, worked out from what's known about it.

Two things are known: **transactions** (the ledger, from statement imports and what's typed in) and **balances** (a
check-in's figure, a statement's balance at the end of a day, or a balance set exactly). An account's balance is the
latest balance known, plus the transactions since. Its **ledger** is the sum of all its transactions. Only about two
years of transactions are imported, so the ledger can be short of the real balance: setting an exact balance adds a
"Balance adjustment" for the difference (today, or as an opening balance before the history starts).

Cash spending (kind cash) is spent from a wallet, not the account, so it isn't in the account's ledger or balance; it
still counts as spending.

Plain functions over a connection, so the services can use them inside their own transactions.
"""

from __future__ import annotations

import datetime as dt
import sqlite3
from dataclasses import dataclass

from app.core import dates

# Kinds that move the account's money (cash comes out of a wallet instead).
IN_LEDGER = ("statement", "manual", "adjustment")
_IN_LEDGER_SQL = "('statement', 'manual', 'adjustment')"


@dataclass(frozen=True)
class Known:
    """A balance known on a day."""

    id: int
    date: str
    at: int
    balance: int
    source: str  # checkin, statement, exact
    exact: bool


def ledger(conn: sqlite3.Connection, account_id: int, through: str | None = None) -> int:
    sql = f"SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = ? AND kind IN {_IN_LEDGER_SQL}"
    args: list[object] = [account_id]
    if through:
        sql += " AND date <= ?"
        args.append(through)
    return int(conn.execute(sql, args).fetchone()[0])


def latest_known(conn: sqlite3.Connection, account_id: int, on_or_before: str | None = None) -> Known | None:
    sql = "SELECT id, date, at, balance, source, exact FROM balances WHERE account_id = ?"
    args: list[object] = [account_id]
    if on_or_before:
        sql += " AND date <= ?"
        args.append(on_or_before)
    row = conn.execute(sql + " ORDER BY date DESC, at DESC, id DESC LIMIT 1", args).fetchone()
    return Known(row[0], row[1], row[2], row[3], row[4], bool(row[5])) if row else None


def _since(conn: sqlite3.Connection, account_id: int, known: Known, through: str | None) -> int:
    """Transactions after a known balance: dated after it, or typed in later the same day."""
    sql = (
        f"SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = ? AND kind IN {_IN_LEDGER_SQL}"
        " AND (date > ? OR (date = ? AND kind IN ('manual', 'adjustment') AND created_at > ?))"
    )
    args: list[object] = [account_id, known.date, known.date, known.at]
    if through:
        sql += " AND date <= ?"
        args.append(through)
    return int(conn.execute(sql, args).fetchone()[0])


def balance(conn: sqlite3.Connection, account_id: int, on: str | None = None) -> int:
    """The balance at the end of a day (today if not given)."""
    known = latest_known(conn, account_id, on)
    if known is None:
        return ledger(conn, account_id, on)
    return known.balance + _since(conn, account_id, known, on)


def series(conn: sqlite3.Connection, account_id: int, start: dt.date, end: dt.date) -> list[tuple[str, int]]:
    """The balance at the end of each day from start to end, worked out the same way as balance()."""
    knowns = [
        Known(r[0], r[1], r[2], r[3], r[4], bool(r[5]))
        for r in conn.execute(
            "SELECT id, date, at, balance, source, exact FROM balances WHERE account_id = ? AND date <= ?"
            " ORDER BY date, at, id",
            (account_id, end.isoformat()),
        )
    ]
    txs = conn.execute(
        f"SELECT date, amount, kind, created_at FROM transactions WHERE account_id = ? AND kind IN {_IN_LEDGER_SQL}"
        " AND date <= ? ORDER BY date",
        (account_id, end.isoformat()),
    ).fetchall()
    out: list[tuple[str, int]] = []
    day = start
    ki = -1
    while day <= end:
        iso = day.isoformat()
        while ki + 1 < len(knowns) and knowns[ki + 1].date <= iso:
            ki += 1
        if ki < 0:
            value = sum(a for d, a, _, _ in txs if d <= iso)
        else:
            k = knowns[ki]
            value = k.balance + sum(
                a
                for d, a, kind, created in txs
                if (k.date < d <= iso) or (d == k.date and kind in ("manual", "adjustment") and created > k.at)
            )
        out.append((iso, value))
        day += dt.timedelta(days=1)
    return out


def first_transaction(conn: sqlite3.Connection, account_id: int) -> str | None:
    row = conn.execute(
        f"SELECT MIN(date) FROM transactions WHERE account_id = ? AND kind IN {_IN_LEDGER_SQL} AND kind != 'adjustment'",
        (account_id,),
    ).fetchone()
    return row[0] if row and row[0] else None


def add_known(
    conn: sqlite3.Connection,
    account_id: int,
    date: str,
    balance_cents: int,
    source: str,
    exact: bool,
    at: int,
    checkin_id: int | None = None,
    expected: int | None = None,
) -> int:
    cur = conn.execute(
        "INSERT INTO balances (account_id, date, at, balance, source, exact, checkin_id, rough, expected)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            account_id,
            date,
            at,
            balance_cents,
            source,
            int(exact),
            checkin_id,
            None if exact else balance_cents,
            expected,
        ),
    )
    return int(cur.lastrowid or 0)


def adjust_to(
    conn: sqlite3.Connection, account_id: int, exact_balance: int, when: str, now: int, user_id: int | None = None
) -> dict[str, object] | None:
    """Make the ledger match an exact balance with a "Balance adjustment" for the difference, dated today or as an
    opening balance the day before the history starts (`when`: today or opening). None when nothing was needed."""
    if when not in ("today", "opening"):
        raise ValueError("Date the adjustment today, or as an opening balance.")
    difference = exact_balance - ledger(conn, account_id)
    if difference == 0:
        return None
    today = dates.today()
    if when == "opening":
        first = first_transaction(conn, account_id)
        day = (dates.parse(first) - dt.timedelta(days=1)) if first else today
        # One opening balance at most: fold an earlier one into this.
        old = conn.execute(
            "SELECT id, amount FROM transactions WHERE account_id = ? AND kind = 'adjustment' AND description = ?",
            (account_id, OPENING),
        ).fetchone()
        if old:
            conn.execute(
                "UPDATE transactions SET amount = ?, date = ?, created_at = ? WHERE id = ?",
                (old[1] + difference, day.isoformat(), now, old[0]),
            )
            return {"id": old[0], "amount": old[1] + difference, "date": day.isoformat(), "description": OPENING}
        description = OPENING
    else:
        day = today
        description = ADJUSTMENT
    cur = conn.execute(
        "INSERT INTO transactions (account_id, date, amount, description, merchant, kind, user_id, created_at)"
        " VALUES (?, ?, ?, ?, '', 'adjustment', ?, ?)",
        (account_id, day.isoformat(), difference, description, user_id, now),
    )
    return {"id": cur.lastrowid, "amount": difference, "date": day.isoformat(), "description": description}


ADJUSTMENT = "Balance adjustment"
OPENING = "Opening balance"
