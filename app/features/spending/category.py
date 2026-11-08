"""
One category, looked at closely: what's gone on it month by month, where (its merchants), when (the weekdays), how it
compares with before, and what's likely next (the rest of this month, next month, its regular payments), learned with
the same forecast as the spending month but from this category's history alone.

Spending counts as everywhere else: every account, not balance fixes or uBank's automatic rules, not what someone's
paying back, splits by their parts. Months here are calendar months, like budget suggestions and merchants. Amounts
are cents spent (a refund takes some off).
"""

from __future__ import annotations

import datetime as dt
import sqlite3
from collections import defaultdict
from typing import Any

from app.core import dates
from app.features.spending import directory, forecast

MONTHS = 12  # whole months shown before this one
RANGES = (1, 3, 6, 12)  # the timeframes to look at: this month, or the last 3, 6 or 12 months (this one included)
SUGGEST = 6  # whole months a budget suggestion averages
MAX_TRANSACTIONS = 300


def _month(d: dt.date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _rows(conn: sqlite3.Connection, category_id: int, since: dt.date) -> list[tuple[int, dt.date, int, str, str, bool]]:
    """(transaction id, date, cents spent, merchant key, statement merchant, one-off) for each piece in the category."""
    raw = conn.execute(
        "SELECT id, date, amount, category_id, category_by, merchant, description, bill_id, one_off FROM transactions"
        " WHERE date >= ? AND kind IN ('statement', 'manual', 'cash') AND COALESCE(excluded, 0) = 0 AND rule_id IS NULL"
        " ORDER BY date, id",
        (since.isoformat(),),
    ).fetchall()
    split_ids = [r[0] for r in raw if r[4] == "split"]
    parts: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for i in range(0, len(split_ids), 500):
        chunk = split_ids[i : i + 500]
        for tx_id, cat, amount in conn.execute(
            f"SELECT transaction_id, category_id, amount FROM splits WHERE transaction_id IN ({','.join('?' * len(chunk))})",
            chunk,
        ).fetchall():
            parts[tx_id].append((cat, amount))
    book = directory.Book(conn)
    out = []
    for tx_id, day, amount, cat, by, merchant_text, description, bill_id, one_off in raw:
        if by == "split" and tx_id in parts:
            # A part's amount is positive; it goes the way the transaction does.
            mine = sum(a for c, a in parts[tx_id] if c == category_id)
            if not mine:
                continue
            spent = mine if amount < 0 else -mine
        elif cat == category_id:
            spent = -amount
        else:
            continue
        key = book.key(merchant_text or "", description or "", amount, tx_id, bill_id)
        out.append((tx_id, dates.parse(day), spent, key, merchant_text or "", bool(one_off)))
    return out


def insights(conn: sqlite3.Connection, category_id: int, today: dt.date, months: int = 3) -> dict[str, Any]:
    row = conn.execute("SELECT id, name, kind, budget FROM categories WHERE id = ?", (category_id,)).fetchone()
    if row is None:
        raise LookupError("That category has gone.")
    _, name, kind, budget = row
    if kind not in ("spending", "bills"):
        raise LookupError("Only spending and bills categories have a page.")
    months = months if months in RANGES else 3
    first = today.replace(day=1)
    chart_start = dates.add_months(first, -MONTHS)
    learn_start = today - dt.timedelta(days=forecast.LOOKBACK + forecast.BACKTEST)
    since = min(chart_start, learn_start)
    rows = _rows(conn, category_id, since)
    book = directory.Book(conn)

    # Month by month, from the first month with anything in it.
    by_month: dict[str, int] = defaultdict(int)
    for _, d, spent, *_rest in rows:
        by_month[_month(d)] += spent
    shown = [_month(dates.add_months(chart_start, i)) for i in range(MONTHS + 1)]
    earliest = min((d for _, d, *_r in rows), default=None)
    shown = [m for m in shown if earliest and m >= _month(earliest)] or shown[-1:]
    whole = [m for m in shown if m != _month(first)]
    year = [by_month.get(m, 0) for m in whole[-12:]]
    recent = [by_month.get(m, 0) for m in whole[-SUGGEST:]]
    average = round(sum(recent) / len(recent)) if recent else 0

    # The timeframe: this month so far, or the last few months with this one.
    r_start = dates.add_months(first, -(months - 1))
    span = (today - r_start).days + 1
    p_end = r_start - dt.timedelta(days=1)
    p_start = dates.add_months(r_start, -months)
    in_range = [r for r in rows if r_start <= r[1] <= today]
    before = [r for r in rows if p_start <= r[1] <= min(p_end, p_start + dt.timedelta(days=span - 1))]
    spent = sum(r[2] for r in in_range)
    previous = (
        sum(r[2] for r in before) if earliest is not None and earliest <= p_start + dt.timedelta(days=3) else None
    )

    merchants: dict[str, dict[str, Any]] = {}
    for _, _d, s, key, *_rest in in_range:
        m = merchants.setdefault(
            key, {"key": key, "name": book.name(key) if key else "No merchant", "spent": 0, "count": 0}
        )
        m["spent"] += s
        m["count"] += 1
    top = sorted((m for m in merchants.values() if m["spent"] > 0), key=lambda m: -m["spent"])
    weekdays = [0] * 7
    for _, d, s, *_rest in in_range:
        weekdays[d.weekday()] += max(s, 0)

    # What's likely: the forecast, learned from this category alone.
    history = [forecast.Spend(d, s, name, text, one_off) for _, d, s, _k, text, one_off in rows if d <= today]
    model = forecast.Model(history, today)
    month_end = dates.add_months(first, 1) - dt.timedelta(days=1)
    next_first = month_end + dt.timedelta(days=1)
    next_end = dates.add_months(next_first, 1) - dt.timedelta(days=1)
    this_month = by_month.get(_month(first), 0)
    likely: dict[str, Any] = {"ready": model.ready, "history_days": model.days, "needs_days": forecast.MIN_HISTORY}
    if model.ready:
        acc = forecast.accuracy(history, today)
        spread = min(max(1 - acc if acc is not None else 0.35, 0.1), 0.6)
        today_spent = sum(s for _, d, s, *_r in rows if d == today)
        ahead = model.days_ahead(today, month_end)
        if ahead:
            ahead[0]["expected"] = max(ahead[0]["expected"] - today_spent, 0)
        rest = sum(d["expected"] for d in ahead)
        nxt = sum(d["expected"] for d in model.days_ahead(next_first, next_end))
        three = sum(
            d["expected"] for d in model.days_ahead(next_first, dates.add_months(next_first, 3) - dt.timedelta(days=1))
        )
        likely.update(
            {
                "accuracy": acc,
                "rest": rest,
                "month_total": this_month + rest,
                "low": this_month + round(rest * (1 - spread)),
                "high": this_month + round(rest * (1 + spread)),
                "next_month": _month(next_first),
                "next": nxt,
                "next_low": round(nxt * (1 - spread)),
                "next_high": round(nxt * (1 + spread)),
                "next_three": three,
                "habits": [
                    {
                        **h.view(),
                        "key": book.key(h.merchant),
                        "name": book.name(book.key(h.merchant)),
                        "next": (
                            v[0].isoformat() if (v := h.visits(today, today + dt.timedelta(days=h.every * 2))) else None
                        ),
                    }
                    for h in sorted(model.habits, key=lambda h: -h.amount * 30 / h.every)
                ],
            }
        )

    suggested = -(-average // 1000) * 1000 if average else None
    over = sum(1 for v in recent if budget and v > budget)
    return {
        "id": category_id,
        "name": name,
        "kind": kind,
        "budget": budget,
        "first": earliest.isoformat() if earliest else None,
        "months": [{"month": m, "spent": by_month.get(m, 0)} for m in shown],
        "this_month": this_month,
        "day": today.day,
        "days": month_end.day,
        "year": sum(year),
        "year_months": len(year),
        "average": average,
        "average_months": len(recent),
        "highest": max(recent, default=0),
        "suggested": suggested,
        "over": over,
        "range": {
            "months": months,
            "start": r_start.isoformat(),
            "end": today.isoformat(),
            "spent": spent,
            "count": len(in_range),
            "previous": previous,
            "previous_start": p_start.isoformat(),
        },
        "merchants": top[:12],
        "merchant_count": len(top),
        "weekdays": weekdays,
        "likely": likely,
        "transaction_ids": [r[0] for r in sorted(in_range, key=lambda r: (r[1], r[0]), reverse=True)][
            :MAX_TRANSACTIONS
        ],
    }
