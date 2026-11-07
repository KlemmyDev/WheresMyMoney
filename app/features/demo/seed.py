"""
A made-up household for development and demos (DEMO=1), only ever put into an empty database.

It's the household from the designs: Offset, Bills, Spending and Savings at uBank, all offsetting a home loan at
5.84%, fourteen bills, a fortnightly pay with payday transfers, a monthly spending top-up, four savings goals, and two
years of statement transactions generated to fit, ending at a rough check-in.
"""

from __future__ import annotations

import datetime as dt
import random
import sqlite3
import time

from app.core import dates
from app.core.database import Database
from app.features.accounts import ledger
from app.features.spending import merchants
from app.features.spending.service import category_by_name, seed_categories

SHOPS = [
    ("WOOLWORTHS 1234 MITCHELTON", "Groceries", 40, 180, 0.55),
    ("COLES 0882 KEPERRA", "Groceries", 20, 140, 0.3),
    ("ALDI STORES MITCHELTON", "Groceries", 30, 110, 0.12),
    ("BP MITCHELTON", "Fuel", 55, 95, 0.16),
    ("AMPOL KEPERRA 4054", "Fuel", 50, 90, 0.08),
    ("GUZMAN Y GOMEZ BRISBANE", "Eating out", 25, 60, 0.12),
    ("MCDONALDS EVERTON PARK", "Eating out", 12, 35, 0.1),
    ("BUNNINGS 552 KEPERRA", "Home", 15, 120, 0.08),
    ("KMART 1120 BRISBANE", "Home", 15, 80, 0.06),
    ("CHEMIST WAREHOUSE 412", "Health", 10, 60, 0.07),
    ("EVENT CINEMAS CHERMSIDE", "Fun", 30, 70, 0.04),
    ("PAYPAL *STEAMGAMES", "Fun", 10, 40, 0.03),
    ("SQ *MITCHELTON MARKETS", "Groceries", 15, 45, 0.04),
    ("SMIGGLE CHERMSIDE", "Kids", 10, 45, 0.04),
    ("AMAZON AU MARKETPLACE", None, 15, 90, 0.07),
]
BILLS = [
    ("Car loan", 72000, "monthly", 15, "auto"),
    ("Health insurance", 34200, "monthly", 24, "auto"),
    ("School fees", 83500, "term", None, "manual"),
    ("Kids activities", 18000, "monthly", 1, "auto"),
    ("Council rates", 51200, "quarterly", 10, "manual"),
    ("Home insurance", 198000, "yearly", None, "auto"),
    ("Car insurance", 11840, "monthly", 20, "auto"),
    ("Phones", 9500, "monthly", 3, "auto"),
    ("Internet", 8900, "monthly", 12, "auto"),
    ("Car rego", 86500, "yearly", None, "manual"),
    ("Gym", 6400, "monthly", 5, "auto"),
    ("Water", 18600, "quarterly", 15, "manual"),
    ("Electricity", 8300, "quarterly", 31, "estimate"),
    ("Streaming", 2599, "monthly", 2, "auto"),
]


def seed(db: Database, today: dt.date | None = None) -> bool:
    """Fill an empty database with the demo household. Returns whether it did."""
    today = today or dates.today()
    rng = random.Random(7)
    now = int(time.time())
    start = dates.add_months(today.replace(day=1), -24)
    with db.writing() as conn:
        if conn.execute("SELECT 1 FROM accounts LIMIT 1").fetchone():
            return False
        seed_categories(conn)
        cat = {
            name: category_by_name(conn, name)
            for name in (
                "Groceries",
                "Fuel",
                "Eating out",
                "Home",
                "Health",
                "Fun",
                "Kids",
                "Bills",
                "Pay",
                "Interest",
                "Transfer",
                "Dividends",
            )
        }

        def account(name: str, role: str, last4: str, **extra: object) -> int:
            cols = {
                "name": name,
                "kind": "bank",
                "role": role,
                "last4": last4,
                "colour": role,
                "offsets_loan": 1,
                "created_at": now,
                "sort": last4,
                **extra,
            }
            cur = conn.execute(
                f"INSERT INTO accounts ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", list(cols.values())
            )
            return int(cur.lastrowid or 0)

        offset = account("Offset", "offset", "2210")
        bills_acct = account("Bills", "bills", "2238", target_months=3)
        spend = account("Spending", "spending", "2241", allowance=320000)
        savings = account("Savings", "savings", "2256")
        cur = conn.execute(
            "INSERT INTO accounts (name, kind, role, last4, colour, offsets_loan, rate_bp, repayment, repay_from,"
            " goal_date, sort, created_at) VALUES ('Home loan', 'loan', 'track', '9917', 'track', 0, 584, 377000, ?,"
            " '2033-12', 9, ?)",
            (offset, now),
        )
        home_loan = int(cur.lastrowid or 0)

        # Payday: Thursday, every fortnight, the latest on or before today.
        payday = today - dt.timedelta(days=(today.weekday() - 3) % 7)
        rules = [
            ("pay", None, offset, 695000, "fortnightly", payday, "Pay"),
            ("transfer", offset, bills_acct, 120000, "fortnightly", payday, "Payday to Bills"),
            ("transfer", offset, savings, 30000, "fortnightly", payday, "Payday to Savings"),
            ("top_up", offset, spend, 320000, "monthly", dates.add_months(today.replace(day=25), -1), "Monthly top-up"),
            ("sweep", bills_acct, offset, 350, "monthly", today.replace(day=1), "Bills sweep"),
        ]
        rule_ids = {}
        for i, (kind, src, dst, amount, every, anchor, label) in enumerate(rules):
            cur = conn.execute(
                "INSERT INTO rules (kind, from_account, to_account, amount, every, anchor, label, sort, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (kind, src, dst, amount, every, anchor.isoformat(), label, i, now),
            )
            rule_ids[label] = int(cur.lastrowid or 0)
        bill_rows = []
        for name, amount, every, dom, how in BILLS:
            if every == "term":
                anchor = dt.date(today.year + 1, 1, 20)
            elif every == "yearly":
                anchor = dt.date(today.year, 3, 14) if name == "Home insurance" else dt.date(today.year, 11, 28)
            else:
                anchor = today.replace(day=min(dom or 1, 28))
            cur = conn.execute(
                "INSERT INTO bills (name, amount, every, next_due, account_id, how, match, category_id, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)",
                (
                    name,
                    amount,
                    every,
                    anchor.isoformat(),
                    bills_acct,
                    how,
                    cat["Kids"] if name == "Kids activities" else cat["Bills"],
                    now,
                ),
            )
            bill_rows.append((int(cur.lastrowid or 0), name, amount, every, anchor))
        for i, (name, target, saved) in enumerate(
            [
                ("Emergency", 1000000, 800000),
                ("Japan trip", 800000, 552000),
                ("Next car", 3000000, 510000),
                ("Christmas", 150000, 90000),
            ]
        ):
            conn.execute(
                "INSERT INTO goals (account_id, name, target, saved, sort) VALUES (?, ?, ?, ?, ?)",
                (savings, name, target, saved, i),
            )

        # Two years of statements, generated day by day.
        bal = {offset: 2400000, bills_acct: 520000, spend: 90000, savings: 1050000}
        rows: list[tuple[int, str, int, str, int | None, int | None, int | None, int]] = []

        def move(
            acct: int,
            day: dt.date,
            amount: int,
            desc: str,
            category: int | None,
            rule: int | None = None,
            bill: int | None = None,
        ) -> None:
            bal[acct] += amount
            rows.append((acct, day.isoformat(), amount, desc, category, rule, bill, bal[acct]))

        day = start
        last = today - dt.timedelta(days=1)
        while day <= last:
            if (day - payday).days % 14 == 0:
                move(offset, day, 695000, "Salary ACME PTY LTD", cat["Pay"], rule_ids["Pay"])
                move(offset, day, -120000, "Transfer", cat["Transfer"], rule_ids["Payday to Bills"])
                move(bills_acct, day, 120000, "Transfer", cat["Transfer"], rule_ids["Payday to Bills"])
                move(offset, day, -30000, "Transfer", cat["Transfer"], rule_ids["Payday to Savings"])
                move(savings, day, 30000, "Transfer", cat["Transfer"], rule_ids["Payday to Savings"])
            if day.day == 1:
                move(offset, day, -377000, "HOME LOAN REPAYMENT 9917", cat["Bills"])
                interest = round(bal[savings] * 0.045 / 12)
                move(savings, day, interest, "Interest", cat["Interest"])
            if day.day == 16 and day.month in (1, 4, 7, 10):
                move(offset, day, round(rng.uniform(300, 470) * 100), "VANGUARD DISTRIBUTION", cat["Dividends"])
            if day.day == 25:
                need = max(320000 - bal[spend], 0)
                if need:
                    move(offset, day, -need, "Transfer", cat["Transfer"], rule_ids["Monthly top-up"])
                    move(spend, day, need, "Transfer", cat["Transfer"], rule_ids["Monthly top-up"])
            for bid, name, amount, every, anchor in bill_rows:
                if day in set(dates.occurrences(anchor, every, day, day)):
                    move(bills_acct, day, -amount, name.upper() + " PAYMENT", None, bill=bid)
            for desc, category, lo, hi, chance in SHOPS:
                if rng.random() < chance * 0.75:
                    amount = -round(rng.uniform(lo, hi) * 100)
                    move(spend, day, amount, desc, cat[category] if category and rng.random() < 0.9 else None)
            day += dt.timedelta(days=1)

        for acct, d, amount, desc, category_id, rule_id, bill, running in rows:
            conn.execute(
                "INSERT INTO transactions (account_id, date, amount, description, merchant, kind, category_id,"
                " balance, rule_id, bill_id, created_at) VALUES (?, ?, ?, ?, ?, 'statement', ?, ?, ?, ?, ?)",
                (acct, d, amount, desc, merchants.merchant(desc), category_id, running, rule_id, bill, now - 86400),
            )
        # The bank's balance two years ago is known (from the statements), so the ledger starts with it.
        opening = {offset: 2400000, bills_acct: 520000, spend: 90000, savings: 1050000}
        for acct, amount in opening.items():
            conn.execute(
                "INSERT INTO transactions (account_id, date, amount, description, merchant, kind, created_at)"
                " VALUES (?, ?, ?, ?, '', 'adjustment', ?)",
                (acct, (start - dt.timedelta(days=1)).isoformat(), amount, ledger.OPENING, now - 86400),
            )
        # Learned rules for the regular shops.
        for desc, category, *_ in SHOPS:
            if category:
                conn.execute(
                    "INSERT OR IGNORE INTO merchant_rules (pattern, category_id, created_at) VALUES (?, ?, ?)",
                    (merchants.pattern(desc), cat[category], now),
                )
        # A rough check-in at the last payday, with the loan's balance from its last statement.
        last_pay = payday if payday <= last else payday - dt.timedelta(days=14)
        for day, owed in ((dates.add_months(last_pay, -1), 60626700), (last_pay, 60482000)):
            conn.execute(
                "INSERT INTO balances (account_id, date, at, balance, source, exact) VALUES (?, ?, ?, ?, 'checkin', 0)",
                (home_loan, day.isoformat(), now - 3600, owed),
            )
        cur = conn.execute(
            "INSERT INTO checkins (date, exact, created_at) VALUES (?, 0, ?)", (last_pay.isoformat(), now - 3600)
        )
        checkin_id = int(cur.lastrowid or 0)
        for acct in (offset, bills_acct, spend, savings):
            figure = ledger.balance(conn, acct, last_pay.isoformat())
            rough = round(figure, -3)
            ledger.add_known(conn, acct, last_pay.isoformat(), rough, "checkin", False, now - 3600, checkin_id)
        _investments(conn, today, rng, now)
        conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ('setting:setup_done', 'true')")
        conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ('setting:household', '\"Demo household\"')")
    return True


# The demo's ETFs: ticker, name, group, target, today's price (dollars), its yearly growth.
FUNDS = [
    ("VAS", "Vanguard Australian Shares", "aus", 0.5, 101.20, 0.07),
    ("VGS", "Vanguard International Shares", "intl", 0.35, 138.40, 0.10),
    ("VAF", "Vanguard Australian Fixed Interest", "bonds", 0.15, 44.975, 0.005),
]


def _investments(conn: sqlite3.Connection, today: dt.date, rng: random.Random, now: int) -> None:
    """Three ETFs bought most quarters for four and a half years (one sold down once), with five years of made-up
    daily closes that end at today's price."""
    first = today - dt.timedelta(days=round(4.6 * 365))
    for n, (ticker, name, group, target, end, growth) in enumerate(FUNDS):
        cur = conn.execute(
            "INSERT INTO funds (ticker, name, grp, target, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (ticker, name, group, target, n, now),
        )
        fund_id = int(cur.lastrowid or 0)
        closes: dict[str, float] = {}
        day = today - dt.timedelta(days=5 * 365)
        wobble = 0.0
        while day <= today:
            if day.weekday() < 5:
                years_back = (today - day).days / 365.25
                wobble = wobble * 0.97 + rng.gauss(0, 0.006 if group != "bonds" else 0.002)
                dip = -0.12 if group != "bonds" and 1.6 < years_back < 2.1 else 0.0
                closes[day.isoformat()] = round(end * 100 * (1 + growth) ** -years_back * (1 + wobble + dip), 2)
            day += dt.timedelta(days=1)
        if closes:  # scaled so the last close is today's price
            scale = end * 100 / closes[max(closes)]
            closes = {d: float(round(c * scale)) for d, c in closes.items()}
            closes[max(closes)] = end * 100
        conn.executemany(
            "INSERT INTO prices (fund_id, date, close) VALUES (?, ?, ?)",
            [(fund_id, d, c) for d, c in closes.items()],
        )
        dates_known = sorted(closes)
        buy = first + dt.timedelta(days=14 * n)
        while buy < today - dt.timedelta(days=20):
            if rng.random() < (0.8 if group != "bonds" else 0.5):
                on = next((d for d in dates_known if d >= buy.isoformat()), dates_known[-1])
                price = closes[on]
                units = max(1, round(200000 * (0.5 if group == "bonds" else 1) / price))
                conn.execute(
                    "INSERT INTO trades (fund_id, date, side, units, price, fee, created_at) VALUES (?, ?, ?, ?, ?, 0,"
                    " ?)",
                    (fund_id, on, "buy", units, price, now),
                )
            buy = dates.add_months(buy, 3)
        if ticker == "VAS":
            on = next(d for d in dates_known if d >= (today - dt.timedelta(days=280)).isoformat())
            conn.execute(
                "INSERT INTO trades (fund_id, date, side, units, price, fee, created_at) VALUES (?, ?, 'sell', 10, ?,"
                " 0, ?)",
                (fund_id, on, closes[on], now),
            )
