"""
Spotting bills in the ledger: payments to the same merchant, on a steady schedule, for about the same amount.

A merchant's payments (by the pattern a merchant is remembered by, app.features.spending.merchants) are chained in
date order: a payment joins a chain whose last one was for about the same amount (within `CLOSE`), or, once the chain
has a schedule, one for a different amount that comes when the next is due — that's a price change, like an insurer's
yearly rise. A merchant can have several chains (Apple charges each subscription separately).

A chain is a bill when it has `MIN_SEEN` payments (two will do for half-yearly or yearly) whose gaps mostly fit one of
the schedules in dates.EVERY, and it's still going: the next would be due no more than half a gap after the
statements end. Its price changes are the amounts that stepped and stayed. A merchant whose amounts vary (power, water)
can still be a bill when its payments come like clockwork and it's sorted as a bill: it's an estimate, at the average
of its latest few.

Payments already matched to a bill (or to its statement name) aren't suggested again: instead, a bill whose latest
payment was a different amount is suggested an update.

Pure functions over plain rows, so it's tested without a database; BillsService feeds it.
"""

from __future__ import annotations

import datetime as dt
import itertools
import statistics
from dataclasses import dataclass, field
from typing import Any

from app.core import dates
from app.features.spending import merchants

MIN_SEEN = 3
MIN_SEEN_SHORT = 5  # weekly and fortnightly: shopping can look weekly for a month
ON_TIME = 0.6  # and this share are strictly on time (not counting missed ones)
CLOSE = 0.08  # amounts within 8% (or CLOSE_CENTS) are the same price
CLOSE_CENTS = 200
STEP = 0.45  # a price change on schedule can be up to 45% either way
REGULAR = 0.75  # this share of the gaps fit the schedule
VARIABLE_REGULAR = 0.8
CHANGED = 0.01  # a step of more than 1% (and CHANGED_CENTS) is a price change
CHANGED_CENTS = 50

# Gap in days → the schedule, with how far either way a gap can be (banks move debits off weekends).
SCHEDULES: list[tuple[str, int, int, int]] = [
    ("weekly", 7, 6, 8),
    ("fortnightly", 14, 12, 16),
    ("monthly", 30, 26, 35),
    ("quarterly", 91, 82, 100),
    ("half-yearly", 182, 170, 195),
    ("yearly", 365, 350, 380),
]
_BY_NAME = {s[0]: s for s in SCHEDULES}
# Two payments are enough to tell these apart from a coincidence.
TWO_WILL_DO = ("half-yearly", "yearly")
# Words at the end of a merchant that aren't its name.
_TAIL = {"COM", "BILL", "INC", "PTY", "LTD", "LIMITED", "AU", "AUS", "AUSTRALIA", "WWW", "NET", "ORG"}
# Short words that are names in capitals.
_KEEP_CAPS = {
    "BPAY",
    "NIB",
    "RACQ",
    "NRMA",
    "RACV",
    "AAMI",
    "AGL",
    "TPG",
    "HCF",
    "AHM",
    "BWS",
    "ATO",
    "KFC",
    "IGA",
    "TAL",
}


@dataclass(frozen=True)
class Payment:
    id: int
    account_id: int
    date: str
    amount: int  # cents paid (positive)
    description: str
    merchant: str
    category_id: int | None
    bill_id: int | None


@dataclass
class Chain:
    payments: list[Payment] = field(default_factory=list)

    @property
    def last(self) -> Payment:
        return self.payments[-1]

    def gaps(self) -> list[int]:
        ds = [dates.parse(p.date) for p in self.payments]
        return [(b - a).days for a, b in itertools.pairwise(ds)]

    def schedule(self) -> tuple[str, int, int, int] | None:
        return schedule_of(self.gaps())


def close(a: int, b: int) -> bool:
    return abs(a - b) <= max(CLOSE_CENTS, round(max(a, b) * CLOSE))


def schedule_of(gaps: list[int]) -> tuple[str, int, int, int] | None:
    """The schedule most gaps fit (a gap of two or three missed ones counts half), or None."""
    gaps = [g for g in gaps if g > 2]
    if not gaps:
        return None
    best = None
    for s in SCHEDULES:
        score = 0.0
        for g in gaps:
            if s[2] <= g <= s[3]:
                score += 1
            elif s[1] < 60 and any(s[2] * k <= g <= s[3] * k for k in (2, 3)):
                score += 0.5
        share = score / len(gaps)
        if best is None or share > best[1]:
            best = (s, share)
    assert best is not None
    return best[0] if best[1] >= REGULAR else None


def _fits(gap: int, s: tuple[str, int, int, int]) -> bool:
    return s[2] <= gap <= s[3]


def chains(payments: list[Payment]) -> list[Chain]:
    """A merchant's payments (oldest first), chained by price and schedule."""
    out: list[Chain] = []
    for p in payments:
        day = dates.parse(p.date)
        best: tuple[float, Chain] | None = None
        for c in out:
            gap = (day - dates.parse(c.last.date)).days
            if gap < 4:
                continue  # the same day or week twice is a second purchase, not the next bill
            s = c.schedule() if len(c.payments) >= 2 else None
            if s is not None and gap < s[2]:
                continue  # before the next is due: another payment to the same merchant
            on_time = s is not None and _fits(gap, s)
            if close(p.amount, c.last.amount):
                score = 2.0 + (1 if on_time else 0)
            elif on_time and abs(p.amount - c.last.amount) <= c.last.amount * STEP:
                score = 1.0
            else:
                continue
            if best is None or score > best[0] or (score == best[0] and c.last.date > best[1].last.date):
                best = (score, c)
        if best is None:
            out.append(Chain([p]))
        else:
            best[1].payments.append(p)
    return out


def price_changes(amounts: list[tuple[str, int]]) -> list[dict[str, Any]]:
    """Where the price stepped and stayed: each {date, was, now}."""
    out = []
    current = amounts[0][1] if amounts else 0
    for i, (day, a) in enumerate(amounts[1:], start=1):
        moved = abs(a - current) > max(CHANGED_CENTS, round(current * CHANGED))
        if not moved:
            continue
        after = [x for _, x in amounts[i + 1 :]]
        if after and not close(after[0], a):
            continue  # a one-off (a part payment, a late fee), not a new price
        out.append({"date": day, "was": current, "now": a, "pct": round((a - current) / current * 100, 1)})
        current = a
    return out


def nice_name(pattern: str) -> str:
    words = pattern.split()
    while len(words) > 1 and words[-1] in _TAIL:
        words.pop()
    out = []
    for w in words:
        if w in _KEEP_CAPS or w == "&":
            out.append(w)
        else:
            out.append(w[:1] + w[1:].lower() if "'" not in w else w.capitalize())
    return " ".join(out)


def _variable(amounts: list[int]) -> bool:
    if len(amounts) < 2:
        return False
    mid = statistics.median(amounts)
    return mid > 0 and (max(amounts) - min(amounts)) / mid > 0.15


def find(
    payments: list[Payment],
    bills: list[Any],
    bill_categories: set[int],
    category_names: dict[int, str],
    ends: dict[int, str],
    today: dt.date,
) -> dict[str, Any]:
    """The bills the payments suggest, and the bills whose price has moved. `ends` is each account's last day of
    statements; `bill_categories` the categories that count as bills."""
    bill_names = {v.lower(): k for k, v in category_names.items()}
    by_merchant: dict[str, list[Payment]] = {}
    for p in sorted(payments, key=lambda p: (p.date, p.id)):
        key = merchants.learn_pattern(p.merchant, None, None, p.description)
        if key:
            by_merchant.setdefault(key, []).append(p)

    found: list[dict[str, Any]] = []
    for pattern, ps in by_merchant.items():
        candidates = [c for c in chains(ps) if len(c.payments) >= 2]
        suggested = merchants.suggest(pattern)
        looks_like_bill = any(p.category_id in bill_categories for p in ps) or (
            suggested is not None and bill_names.get(suggested.lower()) in bill_categories
        )
        good = []
        for c in candidates:
            s = c.schedule()
            n = len(c.payments)
            if s is None:
                continue
            gaps = c.gaps()
            if sum(1 for g in gaps if _fits(g, s)) / len(gaps) < ON_TIME:
                continue
            if s[1] < 20 and n < MIN_SEEN_SHORT:
                continue
            if n * 3 < len(ps) and not looks_like_bill:
                continue  # a few like-priced visits to a shop you go to often
            if n < MIN_SEEN and not (
                s[0] in TWO_WILL_DO and looks_like_bill and close(c.payments[0].amount, c.last.amount)
            ):
                continue
            good.append((c, s, False))
        if not good and len(ps) >= MIN_SEEN:
            # Amounts that vary but come like clockwork, sorted as a bill (power, water): an estimate.
            whole = Chain(list(ps))
            gaps = [g for g in whole.gaps() if g > 2]
            s = schedule_of(gaps)
            if s is not None and len(gaps) >= MIN_SEEN - 1:
                share = sum(1 for g in gaps if _fits(g, s)) / len(gaps)
                if share >= VARIABLE_REGULAR and (looks_like_bill or share >= 0.95):
                    good.append((whole, s, True))
        for c, s, variable in good:
            fallback = bill_names.get(suggested.lower()) if suggested else None
            found.append(_describe(pattern, c, s, variable, ends, today, category_names, bill_categories, fallback))

    # Several bills from one merchant are told apart by their price.
    names: dict[str, int] = {}
    for f in found:
        names[f["name"]] = names.get(f["name"], 0) + 1
    for f in found:
        if names[f["name"]] > 1:
            f["name"] = f"{f['name']} {f['amount'] / 100:.2f}"
            f["key"] = f"{f['key']}|{f['amount']}"

    suggestions, updates = [], []
    for f in found:
        bill = _bill_for(f, bills)
        if bill is None:
            if f["current"]:
                suggestions.append(f)
            continue
        if f["variable"] or not f["current"]:
            continue
        if abs(f["amount"] - bill.amount) > max(CHANGED_CENTS, round(bill.amount * CHANGED)):
            since = next((c["date"] for c in reversed(f["changes"]) if c["now"] == f["amount"]), f["last"])
            updates.append(
                {
                    "key": f"update:{bill.id}:{f['amount']}",
                    "bill_id": bill.id,
                    "name": bill.name,
                    "was": bill.amount,
                    "now": f["amount"],
                    "pct": round((f["amount"] - bill.amount) / bill.amount * 100, 1),
                    "since": since,
                    "every": f["every"],
                    "per_year_change": (f["amount"] - bill.amount) * dates.PER_YEAR[bill.every],
                    "history": f["history"],
                }
            )
    suggestions.sort(key=lambda f: -f["per_year"])
    updates.sort(key=lambda u: -abs(u["per_year_change"]))
    return {"suggestions": suggestions, "updates": updates}


def _describe(
    pattern: str,
    c: Chain,
    s: tuple[str, int, int, int],
    variable: bool,
    ends: dict[int, str],
    today: dt.date,
    category_names: dict[int, str],
    bill_categories: set[int],
    fallback_category: int | None = None,
) -> dict[str, Any]:
    every = s[0]
    ps = c.payments
    amounts = [p.amount for p in ps]
    variable = variable or _variable(amounts[-4:])
    amount = round(statistics.mean(amounts[-3:])) if variable else ps[-1].amount
    accounts: dict[int, int] = {}
    for p in ps:
        accounts[p.account_id] = accounts.get(p.account_id, 0) + 1
    account_id = max(accounts.items(), key=lambda kv: kv[1])[0]
    last = dates.parse(ps[-1].date)
    end = dates.parse(ends.get(account_id) or today.isoformat())
    # Still going: the next one wasn't due more than half a gap (and a week) before the statements end.
    due = dates.step(last, every)
    current = due + dt.timedelta(days=s[1] // 2 + 7) >= end
    cats: dict[int, int] = {}
    for p in ps:
        if p.category_id is not None:
            cats[p.category_id] = cats.get(p.category_id, 0) + 1
    category_id = max(cats.items(), key=lambda kv: (kv[0] in bill_categories, kv[1]))[0] if cats else fallback_category
    changes = [] if variable else price_changes([(p.date, p.amount) for p in ps])
    gaps = c.gaps()
    on_time = sum(1 for g in gaps if _fits(g, s))
    return {
        "key": f"{pattern}|{every}|{account_id}",
        "name": nice_name(" ".join(ps[-1].merchant.split()[: max(len(pattern.split()), 2)]) or pattern),
        "match": pattern,
        "amount": amount,
        "every": every,
        "per_year": amount * dates.PER_YEAR[every],
        "next_due": dates.next_on_or_after(last, every, today).isoformat(),
        "account_id": account_id,
        "how": "estimate" if variable else "auto",
        "variable": variable,
        "category_id": category_id,
        "category": category_names.get(category_id) if category_id is not None else None,
        "seen": len(ps),
        "first": ps[0].date,
        "last": ps[-1].date,
        "current": current,
        "regular": round(on_time / len(gaps), 2) if gaps else 1.0,
        "min": min(amounts),
        "max": max(amounts),
        "changes": changes,
        "rise": (
            {
                "was": changes[0]["was"],
                "now": amount,
                "pct": round((amount - changes[0]["was"]) / changes[0]["was"] * 100, 1),
            }
            if changes
            else None
        ),
        "history": [{"date": p.date, "amount": p.amount} for p in ps[-24:]],
        "transaction_ids": [p.id for p in ps],
        "bill_ids": sorted({p.bill_id for p in ps if p.bill_id is not None}),
        "example": ps[-1].description,
    }


def _bill_for(f: dict[str, Any], bills: list[Any]) -> Any | None:
    """The household's bill these payments are, if any: matched to it on import, by its statement name, or by its
    name's first word and the same schedule or price."""
    for b in bills:
        if b.id in f["bill_ids"]:
            return b
    for b in bills:
        if b.match and (merchants.matches(f["match"], b.match) or merchants.matches(b.match, f["match"])):
            return b
    first_word = f["match"].split()[0]
    for b in bills:
        words = b.name.upper().split()
        same = b.every == f["every"] or close(b.amount, f["amount"])
        if words and len(words[0]) >= 3 and words[0] == first_word and same:
            return b
    return None
