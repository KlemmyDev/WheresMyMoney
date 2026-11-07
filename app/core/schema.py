"""
The database's tables, as a list of migrations (app.core.database runs the ones a database hasn't had yet).

Money is whole cents (INTEGER), signed where it moves: a credit is positive, a debit negative. Dates are ISO text
(2026-11-07) in the household's time zone; moments are unix seconds.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable


def _baseline(conn: sqlite3.Connection) -> None:
    """The platform: settings, sign-in, API keys, notifications."""
    conn.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,"
        " display_name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,"
        " created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, prefix TEXT NOT NULL,"
        " hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, last_used INTEGER)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notify_channels (kind TEXT PRIMARY KEY, enabled INTEGER NOT NULL,"
        " config TEXT NOT NULL, updated_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notify_rules (rule TEXT PRIMARY KEY, enabled INTEGER NOT NULL, settings TEXT NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notify_state (rule TEXT PRIMARY KEY, pending_since INTEGER, active_since INTEGER,"
        " last_fired INTEGER, quiet INTEGER NOT NULL DEFAULT 0, data TEXT)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notify_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,"
        " rule TEXT, event TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, results TEXT NOT NULL)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS notify_history_by_ts ON notify_history (ts)")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE,"
        " p256dh TEXT NOT NULL, auth TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL,"
        " last_sent INTEGER, last_error TEXT)"
    )


def _money(conn: sqlite3.Connection) -> None:
    """Accounts, the ledger, balances, check-ins, imports, categories, rules and bills.

    accounts: `kind` is bank or loan. A bank account has a `role` (offset, bills, spending, savings, track) that sets
    its target: `target_months` of bills for a bills buffer, `allowance` (topped up to) for spending. `offsets_loan`
    counts it against the loan. A loan has `rate_bp` (basis points: 584 is 5.84%), `repayment` and its `repay_from`
    account, and `goal_date` for being fully offset.

    transactions: the ledger. `kind` is statement (from an import), manual (typed in), cash (spent from a wallet, so
    not in the account's ledger), adjustment (a balance adjustment: `date` is today, or before the history starts for
    an opening one). `merchant` is the description cut down for matching (app.features.spending.merchants).

    balances: what an account's balance was known to be on a day: a check-in (rough unless it was exact), a
    statement's balance at the end of a day, or a balance set exactly. `at` orders those on the same day.
    """
    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,"
        " role TEXT NOT NULL DEFAULT 'track', last4 TEXT, colour TEXT NOT NULL DEFAULT 'offset',"
        " offsets_loan INTEGER NOT NULL DEFAULT 1, target_months REAL, allowance INTEGER,"
        " alert_below INTEGER NOT NULL DEFAULT 1, rate_bp INTEGER, repayment INTEGER, repay_from INTEGER,"
        " goal_date TEXT, sort INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,"
        " created_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,"
        " kind TEXT NOT NULL DEFAULT 'spending', budget INTEGER, icon TEXT, sort INTEGER NOT NULL DEFAULT 0)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL,"
        " filename TEXT NOT NULL, first_date TEXT, last_date TEXT, rows INTEGER NOT NULL, added INTEGER NOT NULL,"
        " skipped INTEGER NOT NULL, merged INTEGER NOT NULL, closing INTEGER, created_at INTEGER NOT NULL,"
        " user_id INTEGER)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL,"
        " date TEXT NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL, merchant TEXT NOT NULL DEFAULT '',"
        " kind TEXT NOT NULL, category_id INTEGER, note TEXT NOT NULL DEFAULT '', balance INTEGER,"
        " import_id INTEGER, rule_id INTEGER, bill_id INTEGER, user_id INTEGER, merged INTEGER NOT NULL DEFAULT 0,"
        " created_at INTEGER NOT NULL)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS transactions_by_account ON transactions (account_id, date)")
    conn.execute("CREATE INDEX IF NOT EXISTS transactions_by_date ON transactions (date)")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS checkins (id INTEGER PRIMARY KEY, date TEXT NOT NULL, exact INTEGER NOT NULL,"
        " user_id INTEGER, created_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS balances (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL, date TEXT NOT NULL,"
        " at INTEGER NOT NULL, balance INTEGER NOT NULL, source TEXT NOT NULL, exact INTEGER NOT NULL,"
        " checkin_id INTEGER, rough INTEGER, expected INTEGER)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS balances_by_account ON balances (account_id, date, at)")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS checkin_flags (id INTEGER PRIMARY KEY, checkin_id INTEGER NOT NULL,"
        " account_id INTEGER NOT NULL, rule_id INTEGER, difference INTEGER NOT NULL, status TEXT NOT NULL,"
        " created_at INTEGER NOT NULL, resolved_at INTEGER)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS merchant_rules (id INTEGER PRIMARY KEY, pattern TEXT NOT NULL UNIQUE,"
        " category_id INTEGER NOT NULL, created_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS rules (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, from_account INTEGER,"
        " to_account INTEGER, amount INTEGER, every TEXT NOT NULL, anchor TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',"
        " enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, last_status TEXT, last_checked TEXT,"
        " created_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY, name TEXT NOT NULL, amount INTEGER NOT NULL,"
        " every TEXT NOT NULL, next_due TEXT NOT NULL, account_id INTEGER, how TEXT NOT NULL DEFAULT 'auto',"
        " match TEXT NOT NULL DEFAULT '', category_id INTEGER, active INTEGER NOT NULL DEFAULT 1,"
        " created_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL, name TEXT NOT NULL,"
        " target INTEGER NOT NULL, saved INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0)"
    )


# Applied in order; the database's PRAGMA user_version records how many have run.
# Never edit or reorder one that has shipped: add a new one.
def _loan_changes(conn: sqlite3.Connection) -> None:
    """loan_changes: the home loan's interest rate and repayment over time, as its statements showed them. `field` is
    rate (`value` in basis points) or repayment (cents). The loan's own rate_bp and repayment are the latest of each."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS loan_changes (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL,"
        " date TEXT NOT NULL, field TEXT NOT NULL, value INTEGER NOT NULL, was INTEGER, description TEXT NOT NULL,"
        " import_id INTEGER, created_at INTEGER NOT NULL, UNIQUE (account_id, date, field, value))"
    )


def _sorting(conn: sqlite3.Connection) -> None:
    """More starting categories for a household that has its own already, and how each transaction's category was
    chosen: transactions.`category_by` is you (the household chose it), rule (a remembered merchant), suggest (a
    suggestion taken on import), bill, auto (a transfer, pay or interest) or NULL (not known: from before this).
    Remembering a merchant re-sorts its transactions unless the household chose theirs. Merchants are cut down again
    too, as the cutting got better (it drops "Direct Debit", "Payment To" and the like)."""
    from app.features.spending import merchants
    from app.features.spending.service import add_missing_categories

    add_missing_categories(conn)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(transactions)")}
    if "category_by" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN category_by TEXT")
    conn.execute(
        "UPDATE transactions SET category_by = CASE WHEN kind IN ('manual', 'cash') OR merged = 1 THEN 'you'"
        " WHEN bill_id IS NOT NULL THEN 'bill' WHEN rule_id IS NOT NULL THEN 'auto' END"
        " WHERE category_id IS NOT NULL AND category_by IS NULL"
    )
    rows = conn.execute("SELECT id, description, merchant FROM transactions").fetchall()
    for tx_id, description, was in rows:
        now = merchants.merchant(description)
        if now != was:
            conn.execute("UPDATE transactions SET merchant = ? WHERE id = ?", (now, tx_id))


def _more_categories(conn: sqlite3.Connection) -> None:
    """Another round of starting categories (Coffee, Alcohol, Childcare, Rent, Rego, Side income, Savings and more)
    for a household that has its own already."""
    from app.features.spending.service import add_missing_categories

    add_missing_categories(conn)


MIGRATIONS: list[Callable[[sqlite3.Connection], None]] = [
    _baseline,
    _money,
    _loan_changes,
    _sorting,
    _more_categories,
]
