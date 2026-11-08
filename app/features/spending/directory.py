"""
The merchants: every shop the household spends at, what's gone there month by month, and the statement names that
belong to it.

A statement name ("WOOLWORTHS MITCHELTON") belongs to a merchant automatically: its brand when it's a known one (every
Woolworths together), money to or from a person by their name, otherwise its first two words (a first word alone
would put HOME LOAN REPAYMENT and HOME INSURANCE together). The household can map a statement name to another merchant, or to a new one they name
(`merchant_aliases`), and give any merchant a nicer name (`merchant_names`). Keys are upper case, like the patterns.
"""

from __future__ import annotations

import datetime as dt
import itertools
import re
import sqlite3
import statistics
from typing import Any

from app.features.spending import merchants

_KEY_CHARS = re.compile(r"[^A-Z0-9&' -]+")
MONTHS = 24  # months of history a merchant's page shows
LIST_MONTHS = 12  # months the list's totals and sparklines cover


def key_of(name: str) -> str:
    """A merchant key from a name the household typed ("Domino's Pizza" → "DOMINOS PIZZA")."""
    return " ".join(_KEY_CHARS.sub(" ", name.upper().replace("'", "")).split())[:60]


def pretty(key: str) -> str:
    """A key as a name: title case, short brand names kept in capitals (BP, KFC, IGA)."""
    if key in merchants.NAMES:
        return merchants.NAMES[key]
    words = []
    for w in key.split():
        if len(w) <= 3 and (w in merchants.SUGGESTIONS or not re.search(r"[AEIOU]", w)):
            words.append(w)
        else:
            words.append(w[:1] + w[1:].lower())
    return " ".join(words)


def auto_key(merchant_text: str, description: str = "") -> str:
    """The merchant a statement name belongs to by itself."""
    # "THE CHEESECAKE SHOP" and "CHEESECAKE SHOP" are one brand.
    bare = merchant_text[4:] if merchant_text.startswith("THE ") else merchant_text
    known = merchants.brand(bare) or merchants.brand(merchant_text)
    if known:
        # However it showed up ("WOOLIES", "THE CHEESECAKE SHOP"), the business's own key.
        return merchants.CANONICAL.get(known, known)
    remembered = merchants.learn_pattern(merchant_text, None, None, description)
    # A person's name is kept whole; anything else by its first two words at most.
    if len(remembered.split()) > merchants.WORDS:
        return remembered
    return " ".join(merchant_text.split()[: merchants.WORDS])


# Statement names that don't say who was paid: every BPAY looks the same on a uBank statement.
_UNNAMED = re.compile(r"^(?:(?:INTERNET|MOBILE|ONLINE|APP)\s+)?BPAY(?:\s+(?:PAYMENT|PMT|TRANSFER))?$")
UNNAMED_KEY = "BPAY"
UNNAMED_NAME = "BPAY (who to?)"


def is_unnamed(merchant_text: str) -> bool:
    return bool(_UNNAMED.match(" ".join((merchant_text or "").upper().split())))


class Book:
    """The household's merchant mappings and names, read once."""

    def __init__(self, conn: sqlite3.Connection):
        self.aliases: dict[str, str] = dict(conn.execute("SELECT text, key FROM merchant_aliases").fetchall())
        self.names: dict[str, str] = dict(conn.execute("SELECT key, name FROM merchant_names").fetchall())
        self.by_amount: dict[tuple[str, int], str] = {
            (t, a): k for t, a, k in conn.execute("SELECT text, amount, key FROM merchant_amount_aliases").fetchall()
        }
        self.overrides: dict[int, str] = dict(
            conn.execute(
                "SELECT id, merchant_override FROM transactions WHERE merchant_override IS NOT NULL"
            ).fetchall()
        )
        # A bill paid by BPAY is the bill's merchant: its name, as a key.
        self.bills: dict[int, str] = {}
        self.bill_names: dict[str, str] = {}
        for bill_id, name in conn.execute("SELECT id, name FROM bills").fetchall():
            k = key_of(name)
            if k:
                self.bills[bill_id] = k
                self.bill_names.setdefault(k, name)

    def key(
        self,
        merchant_text: str,
        description: str = "",
        amount: int = 0,
        tx_id: int | None = None,
        bill_id: int | None = None,
    ) -> str:
        if tx_id is not None and tx_id in self.overrides:
            return self.overrides[tx_id]
        if not merchant_text:
            return ""
        if is_unnamed(merchant_text):
            return (
                self.by_amount.get((merchant_text, abs(amount)))
                or (self.bills.get(bill_id) if bill_id is not None else None)
                or self.aliases.get(merchant_text)
                or UNNAMED_KEY
            )
        return self.aliases.get(merchant_text) or auto_key(merchant_text, description)

    def name(self, key: str) -> str:
        if key == UNNAMED_KEY and key not in self.names:
            return UNNAMED_NAME
        return self.names.get(key) or self.bill_names.get(key) or pretty(key)


def _month(d: str) -> str:
    return d[:7]


def _months_back(today: dt.date, n: int) -> list[str]:
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out[::-1]


# Money out at a shop: not transfers between our accounts, money in, balance fixes or uBank's automatic rules.
# Money out at a shop and money in from whoever pays us (a tax refund, Medicare, a refund): not transfers between our
# accounts, balance fixes or uBank's automatic rules.
_SPENDING = (
    "SELECT t.id, t.merchant, t.description, t.amount, t.date, c.name, t.bill_id FROM transactions t"
    " LEFT JOIN categories c ON c.id = t.category_id WHERE t.kind != 'adjustment'"
    # uBank's rules move money between our own accounts, except pay: that's money in from an employer.
    " AND (t.rule_id IS NULL OR c.kind = 'income')"
    " AND COALESCE(c.kind, 'spending') IN ('spending', 'bills', 'income')"
    " AND (t.merchant != '' OR t.merchant_override IS NOT NULL)"
)


def _gather(conn: sqlite3.Connection, book: Book) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for tx_id, text, description, amount, day, category, bill_id in conn.execute(_SPENDING).fetchall():
        key = book.key(text, description, amount, tx_id, bill_id)
        g = out.setdefault(
            key,
            {
                "key": key,
                "spent": 0,
                "count": 0,
                "received": 0,
                "received_count": 0,
                "first": day,
                "last": day,
                "by_month": {},
                "in_month": {},
                "cats": {},
                "texts": {},
                "visits": [],
                "person": False,
            },
        )
        month = _month(day)
        if " ".join(description.upper().split()).startswith(merchants.PERSON):
            g["person"] = True
        if amount < 0:
            g["spent"] -= amount
            g["count"] += 1
            g["visits"].append((day, -amount))
            g["by_month"][month] = g["by_month"].get(month, 0) - amount
        else:
            g["received"] += amount
            g["received_count"] += 1
            g["in_month"][month] = g["in_month"].get(month, 0) + amount
        g["first"] = min(g["first"], day)
        g["last"] = max(g["last"], day)
        if category:
            g["cats"][category] = g["cats"].get(category, 0) + 1
        if not text:
            continue  # put here on its own, with no statement name to list
        t = g["texts"].setdefault(text, {"text": text, "count": 0, "last": day, "transaction_id": tx_id})
        t["count"] += 1
        if day >= t["last"]:
            t["last"], t["transaction_id"] = day, tx_id
    return out


# -- regular payments and their price -------------------------------------------------------

_EVERY = [
    (6, 8, "Every week"),
    (13, 16, "Every fortnight"),
    (26, 35, "Every month"),
    (85, 96, "Every 3 months"),
    (175, 190, "Every 6 months"),
    (350, 380, "Every year"),
]


_MONTHS = {"Every month": 1, "Every 3 months": 3, "Every 6 months": 6, "Every year": 12}


def _next(last: dt.date, label: str, every: int) -> dt.date:
    """The next payment: the same day of the month for monthly ones (the 15th stays the 15th), else days on."""
    months = _MONTHS.get(label)
    if not months:
        return last + dt.timedelta(days=every)
    m = last.month - 1 + months
    year, month = last.year + m // 12, m % 12 + 1
    day = min(last.day, [31, 29 if year % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return dt.date(year, month, day)


def regular(visits: list[tuple[str, int]], today: dt.date) -> dict[str, Any] | None:
    """A merchant paid on a steady schedule (the gym weekly, Spotify monthly, insurance yearly): how often, about how
    much, and when next; or None. `visits` are (date, cents out), oldest first. Several payments on one day count once."""
    by_day: dict[str, int] = {}
    for day, amount in visits:
        by_day[day] = by_day.get(day, 0) + amount
    days = sorted(by_day)
    if len(days) < 3:
        return None
    dates_ = [dt.date.fromisoformat(d) for d in days]
    gaps = [(b - a).days for a, b in itertools.pairwise(dates_)][-8:]
    gap = statistics.median(gaps)
    label = next((name for lo, hi, name in _EVERY if lo <= gap <= hi), None)
    if label is None or (len(days) < 4 and gap < 85):
        return None
    slack = max(3, gap * 0.15)
    if sum(abs(g - gap) <= slack for g in gaps) < 0.75 * len(gaps):
        return None
    amounts = [by_day[d] for d in days]
    recent = amounts[-4:]
    typical = round(statistics.median(recent))
    # After a price change, what it costs now, not the old price still in the recent median.
    change = price_change(visits)
    if change:
        typical = change["now"]
        recent = [a for a in recent if abs(a - typical) <= max(50, typical * 0.02)] or recent[-1:]
    last = dates_[-1]
    every = round(gap)
    return {
        "every_days": every,
        "label": label,
        "amount": amounts[-1],
        "typical": typical,
        # The same amount each time (a subscription), rather than about the same (a power bill).
        "fixed": all(abs(a - typical) <= max(50, typical * 0.02) for a in recent),
        "last": last.isoformat(),
        "next": _next(last, label, every).isoformat(),
        # Paid like clockwork, then not for twice as long: probably cancelled.
        "stopped": (today - last).days > 2 * every + 3,
    }


def price_change(visits: list[tuple[str, int]]) -> dict[str, Any] | None:
    """The latest change in a steady price: what it was, what it is now, from when. A run of the same amount, then a
    run (at least one) of a new one."""
    by_day: dict[str, int] = {}
    for day, amount in visits:
        by_day[day] = by_day.get(day, 0) + amount
    days = sorted(by_day)
    amounts = [by_day[d] for d in days]
    if len(amounts) < 3:
        return None
    now = amounts[-1]
    same = lambda a, b: abs(a - b) <= max(50, b * 0.02)  # noqa: E731
    run = 1
    while run < len(amounts) and same(amounts[-run - 1], now):
        run += 1
    before = amounts[: len(amounts) - run][-3:]
    if len(before) < 2 or not all(same(a, before[-1]) for a in before):
        return None
    was = before[-1]
    if same(now, was):
        return None
    return {
        "was": was,
        "now": now,
        "date": days[len(amounts) - run],
        "pct": round((now - was) / was * 100, 1) if was else None,
        "up": now > was,
    }


def price_changes(conn: sqlite3.Connection, today: dt.date) -> list[dict[str, Any]]:
    """Regular payments whose price changed, newest change first (for the reminder)."""
    book = Book(conn)
    out = []
    for g in _gather(conn, book).values():
        reg = regular(g["visits"], today)
        change = price_change(g["visits"]) if reg and not reg["stopped"] else None
        if change:
            out.append({"key": g["key"], "name": book.name(g["key"]), "label": reg["label"], **change})
    out.sort(key=lambda c: c["date"], reverse=True)
    return out


# -- merchants that look like one ------------------------------------------------------------


# First words that say what something is rather than whose it is: "HOME LOAN" and "HOME INSURANCE" aren't one place.
_COMMON_FIRST = {
    "HOME",
    "CAR",
    "HEALTH",
    "LIFE",
    "PET",
    "PETS",
    "TRAVEL",
    "SCHOOL",
    "KIDS",
    "WATER",
    "POWER",
    "GAS",
    "COUNCIL",
    "BANK",
    "THE",
    "MY",
    "AUSTRALIAN",
    "AUST",
    "PAYMENT",
    "DIRECT",
    "INTERNET",
    "MOBILE",
    "ONLINE",
    "PHONE",
    "PHONES",
    "ELECTRICITY",
    "ENERGY",
    "STREAMING",
    "GYM",
    "RENT",
    "LOAN",
    "INSURANCE",
    "BILLS",
    "WEEKLY",
    "MONTHLY",
}


def _compact(key: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", key)


def suggestions(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Merchants that look like the same place under different names ("BUNNINGS KEPERRA" and "BUNNINGS WAREHOUSE",
    "LA VIDA POOLS" and "LAVIDA POOLS"), with the one to merge into: the most visited. Ones the household said aren't
    the same are left out."""
    book = Book(conn)
    groups = _gather(conn, book)
    dismissed = {r[0] for r in conn.execute("SELECT keys FROM merchant_merge_dismissed").fetchall()}
    candidates = [
        g for g in groups.values() if g["key"] and g["key"] != UNNAMED_KEY and not g["person"] and g["count"] > 0
    ]
    found: dict[str, dict[str, Any]] = {}

    def add(keys: list[str], reason: str) -> None:
        keys = sorted(set(keys))
        if len(keys) < 2 or "|".join(keys) in dismissed or any(k in found for k in keys):
            return
        into = max(keys, key=lambda k: (groups[k]["count"], groups[k]["spent"]))
        entry = {
            "keys": keys,
            "names": [book.name(k) for k in keys],
            "into": into,
            "into_name": book.name(into),
            "reason": reason,
            "count": sum(groups[k]["count"] for k in keys),
        }
        for k in keys:
            found[k] = entry

    # The same name once spaces and punctuation go ("LA VIDA POOLS", "LAVIDA POOLS"), or one inside the other.
    compact = {g["key"]: _compact(g["key"]) for g in candidates}
    for a in candidates:
        for b in candidates:
            ka, kb = a["key"], b["key"]
            if ka < kb and len(compact[ka]) >= 6 and len(compact[kb]) >= 6:
                ca, cb = compact[ka], compact[kb]
                if ca == cb or ca.startswith(cb) or cb.startswith(ca):
                    add([ka, kb], "The same name, written differently")
    # The same distinctive first word ("BUNNINGS KEPERRA", "BUNNINGS WAREHOUSE").
    by_first: dict[str, list[str]] = {}
    for g in candidates:
        first = g["key"].split()[0]
        if (
            len(first) >= 4
            and first not in merchants.GENERIC
            and first not in _COMMON_FIRST
            and not merchants.brand(g["key"])
            and not first.isdigit()
            # Two of the household's own bills are two things, whatever they're called.
            and g["key"] not in book.bill_names
        ):
            by_first.setdefault(first, []).append(g["key"])
    for first, keys in by_first.items():
        add(keys, f"Both start with {pretty(first)}")
    seen: set[int] = set()
    out = []
    for entry in found.values():
        if id(entry) not in seen:
            seen.add(id(entry))
            out.append(entry)
    out.sort(key=lambda e: -e["count"])
    return out


def dismiss_suggestion(conn: sqlite3.Connection, keys: list[str]) -> dict[str, Any]:
    keys = sorted({k for k in keys if k})
    if len(keys) < 2:
        raise ValueError("Which merchants?")
    conn.execute("INSERT OR IGNORE INTO merchant_merge_dismissed (keys) VALUES (?)", ("|".join(keys),))
    return {"keys": keys}


def _direction(g: dict[str, Any]) -> str:
    """ "in" for someone who mostly pays us (the ATO, an employer), "out" for somewhere we spend."""
    return "in" if g["received"] > g["spent"] else "out"


def directory(conn: sqlite3.Connection, today: dt.date) -> list[dict[str, Any]]:
    """Every merchant with money out or in, the most spent at over the last year first."""
    book = Book(conn)
    noted = notes(conn)
    cat_names = dict(conn.execute("SELECT id, name FROM categories").fetchall())
    defaults = {
        k: cat_names.get(c) for k, c in conn.execute("SELECT key, category_id FROM merchant_settings").fetchall() if c
    }
    rule_counts = dict(conn.execute("SELECT key, COUNT(*) FROM merchant_amount_rules GROUP BY key").fetchall())
    months = _months_back(today, LIST_MONTHS)
    out = []
    for g in _gather(conn, book).values():
        if g["count"] == 0 and g["received_count"] == 0:
            continue
        series = [g["by_month"].get(m, 0) for m in months]
        series_in = [g["in_month"].get(m, 0) for m in months]
        out.append(
            {
                "key": g["key"],
                "name": book.name(g["key"]),
                "direction": _direction(g),
                "count": g["count"],
                "spent": g["spent"],
                "spent_year": sum(series),
                "months": series,
                "received_count": g["received_count"],
                "received": g["received"],
                "received_year": sum(series_in),
                "months_in": series_in,
                "first": g["first"],
                "last": g["last"],
                "category": max(g["cats"].items(), key=lambda kv: kv[1])[0] if g["cats"] else None,
                "names": len(g["texts"]),
                "note": noted.get(g["key"], ""),
                # Its own sorting: the default category's name (or None) and how many amount rules.
                "default_category": defaults.get(g["key"]),
                "rules": rule_counts.get(g["key"], 0),
                "regular": (reg := regular(g["visits"], today)),
                "price_change": price_change(g["visits"]) if reg and not reg["stopped"] else None,
                # Its statement names, most used first, so the list can be searched by them too.
                "aliases": [t["text"] for t in sorted(g["texts"].values(), key=lambda t: -t["count"])[:8]],
            }
        )
    out.sort(key=lambda m: (-max(m["spent_year"], m["received_year"]), -max(m["spent"], m["received"])))
    return out


def detail(conn: sqlite3.Connection, key: str, today: dt.date) -> dict[str, Any]:
    """One merchant: its months, the statement names mapped to it (and how), and its transaction ids."""
    book = Book(conn)
    g = _gather(conn, book).get(key)
    if g is None:
        raise LookupError("Nothing at that merchant.")
    months = _months_back(today, MONTHS)
    first = _month(g["first"])
    shown = [m for m in months if m >= first] or months[-1:]
    ids = [
        r[0]
        for r in conn.execute(_SPENDING + " ORDER BY t.date DESC, t.id DESC").fetchall()
        if book.key(r[1], r[2], r[3], r[0], r[6]) == key
    ]
    year = sum(g["by_month"].get(m, 0) for m in months[-12:])
    year_in = sum(g["in_month"].get(m, 0) for m in months[-12:])
    active = max(1, min(12, len([m for m in months[-12:] if m >= first])))
    return {
        "key": key,
        "name": book.name(key),
        "named": key in book.names,
        "settings": settings(conn, key),
        "direction": _direction(g),
        "count": g["count"],
        "spent": g["spent"],
        "spent_year": year,
        "per_month": round(year / active),
        "per_visit": round(g["spent"] / g["count"]) if g["count"] else 0,
        "received_count": g["received_count"],
        "received": g["received"],
        "received_year": year_in,
        "received_per_month": round(year_in / active),
        "per_payment": round(g["received"] / g["received_count"]) if g["received_count"] else 0,
        "first": g["first"],
        "last": g["last"],
        "category": max(g["cats"].items(), key=lambda kv: kv[1])[0] if g["cats"] else None,
        "months": [{"month": m, "spent": g["by_month"].get(m, 0), "received": g["in_month"].get(m, 0)} for m in shown],
        "names": [
            {**t, "mapped": t["text"] in book.aliases, "unnamed": is_unnamed(t["text"])}
            for t in sorted(g["texts"].values(), key=lambda t: (-t["count"], t["text"]))
        ],
        "transaction_ids": ids[:200],
        # Payments that don't name who they were to, put here by amount ("BPAY of $98.00").
        "amounts": [
            {"text": t, "amount": a}
            for (t, a), k in sorted(book.by_amount.items(), key=lambda kv: kv[0][1])
            if k == key
        ],
        "unnamed": key == UNNAMED_KEY,
        # How much was put here by hand (statement names, BPAY amounts, single payments): what Unmerge undoes.
        "mapped": sum(1 for k in book.aliases.values() if k == key)
        + sum(1 for k in book.by_amount.values() if k == key)
        + sum(1 for k in book.overrides.values() if k == key),
        "regular": (reg := regular(g["visits"], today)),
        "price_change": price_change(g["visits"]) if reg and not reg["stopped"] else None,
        # Each payment's amount, oldest first, for a regular payment's price history.
        "history": [{"date": d, "amount": a} for d, a in g["visits"][-24:]] if reg else [],
    }


def _named(conn: sqlite3.Connection, key: str | None, name: str | None) -> str | None:
    """The key to use: the one given, or a new merchant's key from its name (remembering the name as typed)."""
    if name and name.strip():
        key = key_of(name)
        if not key:
            raise ValueError("Give the merchant a name.")
        if pretty(key) != name.strip():
            conn.execute(
                "INSERT INTO merchant_names (key, name) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name",
                (key, " ".join(name.split())[:60]),
            )
    return key


def _sort_by_business(conn: sqlite3.Connection, key: str) -> int:
    """Linking statement names or payments to a known business sorts its transactions that aren't sorted yet into that
    business's usual category (Superloop: Phone & internet). Ones already sorted are left as they are."""
    category = merchants.SUGGESTIONS.get(key) if key in merchants.NAMES else None
    row = conn.execute("SELECT id FROM categories WHERE name = ?", (category,)).fetchone() if category else None
    if not row:
        return 0
    book = Book(conn)
    changed = 0
    for tx_id, text, description, amount, bill_id in conn.execute(
        "SELECT id, merchant, description, amount, bill_id FROM transactions WHERE category_id IS NULL"
        " AND kind != 'adjustment' AND rule_id IS NULL AND (merchant != '' OR merchant_override IS NOT NULL)"
    ).fetchall():
        if book.key(text, description, amount, tx_id, bill_id) == key:
            conn.execute(
                "UPDATE transactions SET category_id = ?, category_by = 'suggest' WHERE id = ?", (row[0], tx_id)
            )
            changed += 1
    return changed


def assign_payment(
    conn: sqlite3.Connection, tx_id: int, scope: str, key: str | None, name: str | None
) -> dict[str, Any]:
    """Say who one payment was to (`scope` "this"), or every payment with its statement name and amount ("amount").
    With no merchant, "this" clears what was said for that payment."""
    row = conn.execute("SELECT merchant, amount FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    if row is None:
        raise LookupError("That transaction has gone.")
    text, amount = row
    key = _named(conn, key, name)
    if scope == "amount" and not text:
        scope = "this"  # with no statement name, there's nothing for other payments to be matched by
    if scope == "amount":
        if not key:
            raise ValueError("Pick a merchant, or name a new one.")
        conn.execute(
            "INSERT INTO merchant_amount_aliases (text, amount, key) VALUES (?, ?, ?)"
            " ON CONFLICT (text, amount) DO UPDATE SET key = excluded.key",
            (text, abs(amount), key),
        )
        conn.execute("UPDATE transactions SET merchant_override = NULL WHERE id = ?", (tx_id,))
        _sort_by_business(conn, key)
        return {"text": text, "amount": abs(amount), "key": key}
    conn.execute("UPDATE transactions SET merchant_override = ? WHERE id = ?", (key or None, tx_id))
    if key:
        _sort_by_business(conn, key)
    return {"text": text, "key": key or Book(conn).key(text, "", amount, tx_id)}


def assign(conn: sqlite3.Connection, text: str, key: str | None, name: str | None) -> dict[str, Any]:
    """Map a statement name to a merchant (an existing key, or a new one by name). Mapping it back to the merchant it
    would get anyway just forgets the mapping."""
    text = (text or "").strip()
    if not text:
        raise ValueError("Which statement name?")
    if name and name.strip():
        key = key_of(name)
        if not key:
            raise ValueError("Give the merchant a name.")
        if pretty(key) != name.strip():
            conn.execute(
                "INSERT INTO merchant_names (key, name) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name",
                (key, " ".join(name.split())[:60]),
            )
    if not key:
        raise ValueError("Pick a merchant, or name a new one.")
    if key == auto_key(text):
        conn.execute("DELETE FROM merchant_aliases WHERE text = ?", (text,))
    else:
        conn.execute(
            "INSERT INTO merchant_aliases (text, key) VALUES (?, ?) ON CONFLICT (text) DO UPDATE SET key = excluded.key",
            (text, key),
        )
    _sort_by_business(conn, key)
    return {"text": text, "key": key}


class Sorter:
    """Each merchant's own sorting: its amount rules, then its default category. Read once."""

    def __init__(self, conn: sqlite3.Connection, book: Book | None = None):
        self.book = book or Book(conn)
        self.default: dict[str, int] = {
            k: c for k, c in conn.execute("SELECT key, category_id FROM merchant_settings").fetchall() if c is not None
        }
        self.rules: dict[str, list[tuple[bool, int, int]]] = {}
        for key, over, amount, category in conn.execute(
            "SELECT key, over, amount, category_id FROM merchant_amount_rules ORDER BY key, sort, id"
        ).fetchall():
            self.rules.setdefault(key, []).append((bool(over), amount, category))

    def category(
        self, merchant_text: str, description: str, amount: int, tx_id: int | None = None, bill_id: int | None = None
    ) -> int | None:
        """The category this merchant's settings give a transaction, or None (fall back to learned rules)."""
        if not merchant_text or (not self.default and not self.rules):
            return None
        key = self.book.key(merchant_text, description, amount, tx_id, bill_id)
        spent = abs(amount)
        for over, limit, category in self.rules.get(key, []):
            if (spent > limit) if over else (spent < limit):
                return category
        return self.default.get(key)


MAX_NOTE = 200


def notes(conn: sqlite3.Connection) -> dict[str, str]:
    return dict(
        conn.execute("SELECT key, note FROM merchant_settings WHERE note IS NOT NULL AND note != ''").fetchall()
    )


def settings(conn: sqlite3.Connection, key: str) -> dict[str, Any]:
    row = conn.execute("SELECT category_id, note FROM merchant_settings WHERE key = ?", (key,)).fetchone()
    rules = conn.execute(
        "SELECT over, amount, category_id FROM merchant_amount_rules WHERE key = ? ORDER BY sort, id", (key,)
    ).fetchall()
    return {
        "category_id": row[0] if row else None,
        "note": (row[1] or "") if row else "",
        "rules": [{"over": bool(o), "amount": a, "category_id": c} for o, a, c in rules],
    }


# Categories the household chose themselves, or that came from a bill, a uBank rule or a split, are left alone.
_RESORTABLE = ("rule", "suggest")


def save_settings(conn: sqlite3.Connection, key: str, body: dict[str, Any]) -> dict[str, Any]:
    """Set a merchant's default category and amount rules, then re-sort its transactions that weren't sorted by hand.
    Returns the settings and how many transactions changed."""
    known = {r[0] for r in conn.execute("SELECT id FROM categories")}
    category = body.get("category_id")
    category = int(category) if category not in (None, "") else None
    if category is not None and category not in known:
        raise ValueError("That category has gone.")
    rules = []
    for r in body.get("rules") or []:
        try:
            amount = int(r.get("amount"))
            cat = int(r.get("category_id"))
        except (TypeError, ValueError):
            raise ValueError("Each rule needs an amount and a category.") from None
        if amount <= 0:
            raise ValueError("A rule's amount should be more than $0.")
        if cat not in known:
            raise ValueError("That category has gone.")
        rules.append((bool(r.get("over", True)), amount, cat))
    note = " ".join(str(body.get("note") or "").split())[:MAX_NOTE]
    conn.execute("DELETE FROM merchant_settings WHERE key = ?", (key,))
    if category is not None or note:
        conn.execute(
            "INSERT INTO merchant_settings (key, category_id, note) VALUES (?, ?, ?)", (key, category, note or None)
        )
    conn.execute("DELETE FROM merchant_amount_rules WHERE key = ?", (key,))
    conn.executemany(
        "INSERT INTO merchant_amount_rules (key, over, amount, category_id, sort) VALUES (?, ?, ?, ?, ?)",
        [(key, int(o), a, c, i) for i, (o, a, c) in enumerate(rules)],
    )
    # Re-sort this merchant's transactions.
    sorter = Sorter(conn)
    changed = 0
    for tx_id, text, description, amount, current in conn.execute(
        "SELECT id, merchant, description, amount, category_id FROM transactions WHERE (merchant != ''"
        " OR merchant_override IS NOT NULL)"
        " AND kind != 'adjustment' AND rule_id IS NULL AND bill_id IS NULL"
        f" AND (category_id IS NULL OR category_by IS NULL OR category_by IN ({','.join('?' * len(_RESORTABLE))}))",
        _RESORTABLE,
    ).fetchall():
        if sorter.book.key(text, description, amount, tx_id) != key:
            continue
        cat = sorter.category(text, description, amount, tx_id)
        if cat is not None and cat != current:
            conn.execute("UPDATE transactions SET category_id = ?, category_by = 'rule' WHERE id = ?", (cat, tx_id))
            changed += 1
    return {**settings(conn, key), "changed": changed}


def merge(conn: sqlite3.Connection, sources: list[str], key: str | None, name: str | None) -> dict[str, Any]:
    """Fold merchants into one (an existing key, or a new one by name): every statement name that belongs to any of
    `sources` is mapped to it, so all their transactions move together."""
    sources = [s for s in dict.fromkeys(sources or []) if s]
    if not sources:
        raise ValueError("Which merchants?")
    if name and name.strip():
        key = key_of(name)
        if not key:
            raise ValueError("Give the merchant a name.")
        if pretty(key) != name.strip():
            conn.execute(
                "INSERT INTO merchant_names (key, name) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name",
                (key, " ".join(name.split())[:60]),
            )
    if not key:
        raise ValueError("Pick the merchant to merge into, or name a new one.")
    book = Book(conn)
    texts: set[str] = set()
    payments: list[int] = []
    for tx_id, text, description, amount, bill_id in conn.execute(
        "SELECT id, merchant, description, amount, bill_id FROM transactions WHERE merchant != ''"
    ).fetchall():
        if book.key(text, description, amount, tx_id, bill_id) not in sources:
            continue
        # A payment that doesn't name who it was to moves on its own, so every other BPAY stays where it is.
        if is_unnamed(text) or tx_id in book.overrides:
            payments.append(tx_id)
        else:
            texts.add(text)
    for text in texts:
        assign(conn, text, key, None)
    conn.executemany("UPDATE transactions SET merchant_override = ? WHERE id = ?", [(key, i) for i in payments])
    _sort_by_business(conn, key)
    return {"key": key, "moved": len(texts) + len(payments)}


def unmerge(conn: sqlite3.Connection, key: str) -> dict[str, Any]:
    """Undo everything put into a merchant by hand: statement names, BPAY amounts and single payments go back to
    where they'd be by themselves."""
    moved = conn.execute("DELETE FROM merchant_aliases WHERE key = ?", (key,)).rowcount
    moved += conn.execute("DELETE FROM merchant_amount_aliases WHERE key = ?", (key,)).rowcount
    moved += conn.execute(
        "UPDATE transactions SET merchant_override = NULL WHERE merchant_override = ?", (key,)
    ).rowcount
    return {"key": key, "moved": moved}


def catalogue() -> list[dict[str, Any]]:
    """Businesses the app knows (businesses.json): each one's key, name, usual category and other spellings. Picking
    one when naming a merchant links the merchant to it, so its mark and name follow."""
    return [
        {"key": b["key"], "name": b["name"], "category": b["category"], "aliases": b["aliases"]}
        for b in merchants.CATALOGUE
    ]


def forget(conn: sqlite3.Connection, text: str, amount: int | None = None) -> dict[str, Any]:
    """Undo a mapping: the statement name (or, with `amount`, its payments of that amount) goes back to the merchant
    it would get by itself."""
    if amount is not None:
        conn.execute("DELETE FROM merchant_amount_aliases WHERE text = ? AND amount = ?", (text, abs(amount)))
        return {"text": text, "amount": abs(amount)}
    conn.execute("DELETE FROM merchant_aliases WHERE text = ?", (text,))
    return {"text": text, "key": auto_key(text)}


def rename(conn: sqlite3.Connection, key: str, name: str) -> dict[str, Any]:
    name = " ".join((name or "").split())[:60]
    if not name or name == pretty(key):
        conn.execute("DELETE FROM merchant_names WHERE key = ?", (key,))
        return {"key": key, "name": pretty(key)}
    conn.execute(
        "INSERT INTO merchant_names (key, name) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET name = excluded.name",
        (key, name),
    )
    return {"key": key, "name": name}
