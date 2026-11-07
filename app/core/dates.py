"""Days and schedules: today in the household's time zone, and what "every fortnight from Thursday" means."""

from __future__ import annotations

import calendar
import datetime as dt
import os
from collections.abc import Iterator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

Date = dt.date

# How often something happens: rules (payday transfers, the monthly top-up) and bills.
EVERY = ("weekly", "fortnightly", "monthly", "quarterly", "term", "half-yearly", "yearly")
PER_YEAR = {
    "weekly": 52,
    "fortnightly": 26,
    "monthly": 12,
    "quarterly": 4,
    "term": 4,  # school terms
    "half-yearly": 2,
    "yearly": 1,
}
MONTHS_APART = {"monthly": 1, "quarterly": 3, "term": 3, "half-yearly": 6, "yearly": 12}
DAYS_APART = {"weekly": 7, "fortnightly": 14}


def zone() -> dt.tzinfo:
    try:
        return ZoneInfo(os.environ.get("TZ") or "Australia/Brisbane")
    except (ZoneInfoNotFoundError, ValueError):
        return dt.UTC


# Tests (and the demo) move "today" by setting this.
_today_override: Date | None = None


def today() -> Date:
    return _today_override or dt.datetime.now(zone()).date()


def set_today(day: Date | None) -> None:
    global _today_override
    _today_override = day


def parse(text: str) -> Date:
    return dt.date.fromisoformat(text)


def add_months(day: Date, months: int, anchor_day: int | None = None) -> Date:
    """`months` later, on the same day of the month (or the month's last, for the 31st in a 30-day month)."""
    want = anchor_day or day.day
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    return dt.date(year, month, min(want, calendar.monthrange(year, month)[1]))


def step(day: Date, every: str, n: int = 1, anchor_day: int | None = None) -> Date:
    """The `n`th occurrence after `day` (n may be negative)."""
    if every in DAYS_APART:
        return day + dt.timedelta(days=DAYS_APART[every] * n)
    return add_months(day, MONTHS_APART[every] * n, anchor_day)


def occurrences(anchor: Date, every: str, start: Date, end: Date) -> Iterator[Date]:
    """Each date of a schedule (one happening on `anchor`, then `every` so often) from `start` to `end`, inclusive."""
    if every not in PER_YEAR:
        raise ValueError(f"{every!r} isn't how often something can happen.")
    day = anchor
    n = 0
    if every in DAYS_APART:
        gap = DAYS_APART[every]
        n = (start - anchor).days // gap
        day = anchor + dt.timedelta(days=gap * n)
        while day < start:
            n += 1
            day = anchor + dt.timedelta(days=gap * n)
        while day <= end:
            yield day
            n += 1
            day = anchor + dt.timedelta(days=gap * n)
        return
    gap = MONTHS_APART[every]
    months = (start.year - anchor.year) * 12 + start.month - anchor.month
    n = months // gap - 1
    day = add_months(anchor, gap * n, anchor.day)
    while day < start:
        n += 1
        day = add_months(anchor, gap * n, anchor.day)
    while day <= end:
        yield day
        n += 1
        day = add_months(anchor, gap * n, anchor.day)


def next_on_or_after(anchor: Date, every: str, day: Date) -> Date:
    return next(occurrences(anchor, every, day, day + dt.timedelta(days=400)))


def last_on_or_before(anchor: Date, every: str, day: Date) -> Date | None:
    found = None
    for d in occurrences(anchor, every, day - dt.timedelta(days=400), day):
        found = d
    return found


def short(day: Date) -> str:
    """12 Nov"""
    return f"{day.day} {day.strftime('%b')}"
