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
import re
import sqlite3
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
    words = []
    for w in key.split():
        if len(w) <= 3 and (w in merchants.SUGGESTIONS or not re.search(r"[AEIOU]", w)):
            words.append(w)
        else:
            words.append(w[:1] + w[1:].lower())
    return " ".join(words)


def auto_key(merchant_text: str, description: str = "") -> str:
    """The merchant a statement name belongs to by itself."""
    known = merchants.brand(merchant_text)
    if known:
        return known
    remembered = merchants.learn_pattern(merchant_text, None, None, description)
    # A person's name is kept whole; anything else by its first two words at most.
    if len(remembered.split()) > merchants.WORDS:
        return remembered
    return " ".join(merchant_text.split()[: merchants.WORDS])


class Book:
    """The household's merchant mappings and names, read once."""

    def __init__(self, conn: sqlite3.Connection):
        self.aliases: dict[str, str] = dict(conn.execute("SELECT text, key FROM merchant_aliases").fetchall())
        self.names: dict[str, str] = dict(conn.execute("SELECT key, name FROM merchant_names").fetchall())

    def key(self, merchant_text: str, description: str = "") -> str:
        if not merchant_text:
            return ""
        return self.aliases.get(merchant_text) or auto_key(merchant_text, description)

    def name(self, key: str) -> str:
        return self.names.get(key) or pretty(key)


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
_SPENDING = (
    "SELECT t.id, t.merchant, t.description, t.amount, t.date, c.name FROM transactions t"
    " LEFT JOIN categories c ON c.id = t.category_id WHERE t.kind != 'adjustment' AND t.rule_id IS NULL"
    " AND COALESCE(c.kind, 'spending') IN ('spending', 'bills') AND t.merchant != ''"
)


def _gather(conn: sqlite3.Connection, book: Book) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for tx_id, text, description, amount, day, category in conn.execute(_SPENDING).fetchall():
        key = book.key(text, description)
        g = out.setdefault(
            key,
            {"key": key, "spent": 0, "count": 0, "first": day, "last": day, "by_month": {}, "cats": {}, "texts": {}},
        )
        g["spent"] -= amount
        if amount < 0:
            g["count"] += 1
        g["first"] = min(g["first"], day)
        g["last"] = max(g["last"], day)
        g["by_month"][_month(day)] = g["by_month"].get(_month(day), 0) - amount
        if category:
            g["cats"][category] = g["cats"].get(category, 0) + 1
        t = g["texts"].setdefault(text, {"text": text, "count": 0, "last": day, "transaction_id": tx_id})
        t["count"] += 1
        if day >= t["last"]:
            t["last"], t["transaction_id"] = day, tx_id
    return out


def directory(conn: sqlite3.Connection, today: dt.date) -> list[dict[str, Any]]:
    """Every merchant with money out, the most spent at over the last year first."""
    book = Book(conn)
    months = _months_back(today, LIST_MONTHS)
    out = []
    for g in _gather(conn, book).values():
        if g["count"] == 0:
            continue
        series = [g["by_month"].get(m, 0) for m in months]
        out.append(
            {
                "key": g["key"],
                "name": book.name(g["key"]),
                "count": g["count"],
                "spent": g["spent"],
                "spent_year": sum(series),
                "months": series,
                "first": g["first"],
                "last": g["last"],
                "category": max(g["cats"].items(), key=lambda kv: kv[1])[0] if g["cats"] else None,
                "names": len(g["texts"]),
            }
        )
    out.sort(key=lambda m: (-m["spent_year"], -m["spent"]))
    return out


def detail(conn: sqlite3.Connection, key: str, today: dt.date) -> dict[str, Any]:
    """One merchant: its months, the statement names mapped to it (and how), and its transaction ids."""
    book = Book(conn)
    g = _gather(conn, book).get(key)
    if g is None:
        raise LookupError("No spending at that merchant.")
    months = _months_back(today, MONTHS)
    first = _month(g["first"])
    shown = [m for m in months if m >= first] or months[-1:]
    ids = [
        r[0]
        for r in conn.execute(_SPENDING + " ORDER BY t.date DESC, t.id DESC").fetchall()
        if book.key(r[1], r[2]) == key
    ]
    year = sum(g["by_month"].get(m, 0) for m in months[-12:])
    active = max(1, min(12, len([m for m in months[-12:] if m >= first])))
    return {
        "key": key,
        "name": book.name(key),
        "named": key in book.names,
        "count": g["count"],
        "spent": g["spent"],
        "spent_year": year,
        "per_month": round(year / active),
        "per_visit": round(g["spent"] / g["count"]) if g["count"] else 0,
        "first": g["first"],
        "last": g["last"],
        "category": max(g["cats"].items(), key=lambda kv: kv[1])[0] if g["cats"] else None,
        "months": [{"month": m, "spent": g["by_month"].get(m, 0)} for m in shown],
        "names": [
            {**t, "mapped": t["text"] in book.aliases}
            for t in sorted(g["texts"].values(), key=lambda t: (-t["count"], t["text"]))
        ],
        "transaction_ids": ids[:200],
    }


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
    return {"text": text, "key": key}


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
    texts = {
        text
        for text, description in conn.execute(
            "SELECT DISTINCT merchant, description FROM transactions WHERE merchant != ''"
        ).fetchall()
        if book.key(text, description) in sources
    }
    for text in texts:
        assign(conn, text, key, None)
    return {"key": key, "moved": len(texts)}


def forget(conn: sqlite3.Connection, text: str) -> dict[str, Any]:
    """Undo a mapping: the statement name goes back to the merchant it would get by itself."""
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
