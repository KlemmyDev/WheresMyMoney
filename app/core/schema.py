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


def _goal_details(conn: sqlite3.Connection) -> None:
    """goals: an `icon` (plane, car, shield, home, kids, play) and `by_date`, the month it should be reached by."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(goals)")}
    if "icon" not in cols:
        conn.execute("ALTER TABLE goals ADD COLUMN icon TEXT")
    if "by_date" not in cols:
        conn.execute("ALTER TABLE goals ADD COLUMN by_date TEXT")


def _splits_and_paid_back(conn: sqlite3.Connection) -> None:
    """splits: one transaction's amount shared across categories (`amount` in cents, positive; the parts add up to
    the transaction's amount). A split transaction keeps its biggest part's category, with category_by 'split'.
    transactions.`excluded`: someone's paying it back, so it isn't counted as spending (or, money in, it's them
    paying it back)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(transactions)")}
    if "excluded" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS splits (id INTEGER PRIMARY KEY, transaction_id INTEGER NOT NULL,"
        " category_id INTEGER NOT NULL, amount INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS splits_by_transaction ON splits (transaction_id)")


def _one_offs(conn: sqlite3.Connection) -> None:
    """transactions.`one_off`: spending that won't happen again (a birthday party, a one-time repair). It still counts
    in the month, but the spending forecast doesn't learn from it."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(transactions)")}
    if "one_off" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN one_off INTEGER NOT NULL DEFAULT 0")


def _merchant_book(conn: sqlite3.Connection) -> None:
    """merchant_aliases: a statement name (transactions.merchant) the household mapped to a merchant other than the
    one it gets by itself. merchant_names: a merchant's name, where the household chose one. Both by merchant key
    (app.features.spending.directory)."""
    conn.execute("CREATE TABLE IF NOT EXISTS merchant_aliases (text TEXT PRIMARY KEY, key TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS merchant_names (key TEXT PRIMARY KEY, name TEXT NOT NULL)")


def _merchant_sorting(conn: sqlite3.Connection) -> None:
    """merchant_settings: a merchant's default category and a `note` ("car insurance for the Mazda").
    merchant_amount_rules: categories by how much was spent there,
    tried in `sort` order before the default ("over $30 at 7-Eleven is fuel"); `over` is 1 for more than `amount`
    (cents), 0 for less. Both by merchant key (app.features.spending.directory)."""
    conn.execute("CREATE TABLE IF NOT EXISTS merchant_settings (key TEXT PRIMARY KEY, category_id INTEGER, note TEXT)")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS merchant_amount_rules (id INTEGER PRIMARY KEY, key TEXT NOT NULL,"
        " over INTEGER NOT NULL, amount INTEGER NOT NULL, category_id INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS merchant_amount_rules_by_key ON merchant_amount_rules (key, sort)")


def _unnamed_payments(conn: sqlite3.Connection) -> None:
    """A payment whose statement line doesn't say who it was to (uBank's BPAY is just "Internet BPay") gets its
    merchant another way: transactions.`merchant_override` for that one payment, or merchant_amount_aliases for every
    payment with that statement name and amount (cents, positive)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(transactions)")}
    if "merchant_override" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN merchant_override TEXT")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS merchant_amount_aliases (text TEXT NOT NULL, amount INTEGER NOT NULL,"
        " key TEXT NOT NULL, PRIMARY KEY (text, amount))"
    )


def _merge_dismissed(conn: sqlite3.Connection) -> None:
    """merchant_merge_dismissed: merchants the household said aren't the same place (their keys sorted, joined with
    "|"), so they're not suggested for merging again."""
    conn.execute("CREATE TABLE IF NOT EXISTS merchant_merge_dismissed (keys TEXT PRIMARY KEY)")


def _celebrations(conn: sqlite3.Connection) -> None:
    """A Celebrations category (birthday cakes, parties) for a household that has its own categories already."""
    from app.features.spending.service import add_missing_categories

    add_missing_categories(conn)


def _names_stuck_to_numbers(conn: sqlite3.Connection) -> None:
    """Merchants cut down again: a name stuck to a reference ("EIDA-4410938271") now keeps the name instead of being
    dropped with the number."""
    from app.features.spending import merchants

    for tx_id, description, was in conn.execute("SELECT id, description, merchant FROM transactions").fetchall():
        now = merchants.merchant(description)
        if now != was:
            conn.execute("UPDATE transactions SET merchant = ? WHERE id = ?", (now, tx_id))


def _investments(conn: sqlite3.Connection) -> None:
    """Investments: the ETFs held, entered by hand as they're bought and sold.

    funds: `ticker` as the exchange has it (VAS; looked up as VAS.AX unless it names its market), `grp` (aus, intl,
    bonds, property, cash, other) and `target`, its aimed-for share of the portfolio (0 to 1).
    trades: `side` buy or sell, `units` (fractions allowed), `price` each in cents (fractions of a cent allowed), and
    the brokerage `fee` in cents. prices: a fund's close each day, in cents, looked up once a day."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS funds (id INTEGER PRIMARY KEY, ticker TEXT NOT NULL UNIQUE COLLATE NOCASE,"
        " name TEXT NOT NULL, grp TEXT NOT NULL DEFAULT 'other', target REAL, sort INTEGER NOT NULL DEFAULT 0,"
        " created_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY, fund_id INTEGER NOT NULL, date TEXT NOT NULL,"
        " side TEXT NOT NULL, units REAL NOT NULL, price REAL NOT NULL, fee INTEGER NOT NULL DEFAULT 0,"
        " created_at INTEGER NOT NULL)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS trades_by_fund ON trades (fund_id, date)")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS prices (fund_id INTEGER NOT NULL, date TEXT NOT NULL, close REAL NOT NULL,"
        " PRIMARY KEY (fund_id, date))"
    )


def _retirement(conn: sqlite3.Connection) -> None:
    """super_accounts: each person's super, for the retirement estimate: `born` (year), the `fund`, its `balance`
    in cents as of `as_of`, their `salary` (cents a year) and the employer's `rate` (0.12 is 12%)."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS super_accounts (id INTEGER PRIMARY KEY, person TEXT NOT NULL, born INTEGER NOT NULL,"
        " fund TEXT NOT NULL DEFAULT '', balance INTEGER NOT NULL DEFAULT 0, as_of TEXT, salary INTEGER NOT NULL"
        " DEFAULT 0, rate REAL NOT NULL DEFAULT 0.12, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)"
    )


def _assets(conn: sqlite3.Connection) -> None:
    """Things owned that aren't accounts, valued by hand for net worth: `kind` home, car or other. asset_values: each
    value given, from `date` (the latest is what it's worth now)."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS assets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT"
        " 'other', sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_values (id INTEGER PRIMARY KEY, asset_id INTEGER NOT NULL, date TEXT NOT NULL,"
        " value INTEGER NOT NULL)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS asset_values_by_asset ON asset_values (asset_id, date)")


def _super_fees(conn: sqlite3.Connection) -> None:
    """super_accounts.`fees`: the fund's fees as a JSON list, each {"name", "kind", "amount"}: kind pct is a share of
    the balance a year (0.001 is 0.10%), fixed is cents a year (admin fees, insurance). super_accounts.`options`: how
    the balance is invested, a JSON list of {"name", "share", "return_pct", "fee_pct"} (return before fees, NULL for
    the household's assumption; the option's own investment fee). funds.`fee_pct`: an ETF's management fee a year."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(super_accounts)")}
    if "fees" not in cols:
        conn.execute("ALTER TABLE super_accounts ADD COLUMN fees TEXT NOT NULL DEFAULT '[]'")
    if "options" not in cols:
        conn.execute("ALTER TABLE super_accounts ADD COLUMN options TEXT NOT NULL DEFAULT '[]'")
    cols = {r[1] for r in conn.execute("PRAGMA table_info(funds)")}
    if "fee_pct" not in cols:
        conn.execute("ALTER TABLE funds ADD COLUMN fee_pct REAL")


def _goal_moves(conn: sqlite3.Connection) -> None:
    """goal_moves: money moved (or to be moved) into a goal. `status` planned (not moved yet: not counted), moved
    (counted when the household said so) or matched (counted from a statement's transfer). `transaction_id` is the
    statement row it was matched to, so a transfer is never counted twice."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS goal_moves (id INTEGER PRIMARY KEY, goal_id INTEGER NOT NULL, amount INTEGER NOT"
        " NULL, date TEXT NOT NULL, status TEXT NOT NULL, transaction_id INTEGER UNIQUE, created_at INTEGER NOT NULL)"
    )


def _super_values(conn: sqlite3.Connection) -> None:
    """super_values: each super balance given, as of its date, so net worth can show super over time. Starts with
    the balance each person has now."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS super_values (id INTEGER PRIMARY KEY, super_id INTEGER NOT NULL, date TEXT NOT NULL,"
        " balance INTEGER NOT NULL, UNIQUE (super_id, date))"
    )
    conn.execute(
        "INSERT OR IGNORE INTO super_values (super_id, date, balance) SELECT id, COALESCE(as_of, date('now')), balance"
        " FROM super_accounts"
    )


def _fund_platforms(conn: sqlite3.Connection) -> None:
    """funds.`platform`: where it's held (a broker, a micro-investing app, an exchange); funds.`kind`: etf, share or
    crypto (a crypto ticker is looked up in Australian dollars)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(funds)")}
    if "platform" not in cols:
        conn.execute("ALTER TABLE funds ADD COLUMN platform TEXT NOT NULL DEFAULT ''")
    if "kind" not in cols:
        conn.execute("ALTER TABLE funds ADD COLUMN kind TEXT NOT NULL DEFAULT 'etf'")


def _budget_categories(conn: sqlite3.Connection) -> None:
    """More starting categories for budgeting (Parking & tolls, Home maintenance, Furniture, Loans, School fees) for
    a household that has its own already."""
    from app.features.spending.service import add_missing_categories

    add_missing_categories(conn)


def _push_only(conn: sqlite3.Connection) -> None:
    """Notifications go only to the browsers and phones that turned them on (web push): the ntfy and webhook
    settings, with the tokens and addresses they held, are gone."""
    conn.execute("DROP TABLE IF EXISTS notify_channels")


MIGRATIONS: list[Callable[[sqlite3.Connection], None]] = [
    _baseline,
    _money,
    _loan_changes,
    _sorting,
    _more_categories,
    _goal_details,
    _splits_and_paid_back,
    _investments,
    _retirement,
    _assets,
    _super_fees,
    _goal_moves,
    _super_values,
    _fund_platforms,
    _budget_categories,
    _push_only,
    _one_offs,
    _merchant_book,
    _merchant_sorting,
    _unnamed_payments,
    _merge_dismissed,
    _celebrations,
    _names_stuck_to_numbers,
]
