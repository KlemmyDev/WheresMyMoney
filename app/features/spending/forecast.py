"""
What the household is likely to spend on each day ahead, learned from how it has spent before.

Nothing is stored: the forecast is worked out afresh from the spending history each time, so it gets better as the
history grows (more weeks to learn each weekday from, more repeats to spot a habit in).

Two parts, so a habit isn't counted twice:

- Habits: a merchant paid again and again at a steady gap (the gym every Monday, the school canteen every week, a
  subscription each month). Its next visits are expected on their days, at its usual amount.
- Everyday spending: everything else, by category, as a recent daily average (recent weeks count most) shaped by the
  weekday (more on Saturdays, less on Tuesdays). A weekday's shape is trusted only as the weeks behind it build up.

Spending marked a one-off (a birthday party, a one-time repair) is left out of both: it won't happen again, so
there's nothing to learn from it.

How far to trust it is measured, not guessed: the same model, given only the history up to four weeks ago, forecasts
those four weeks, and the forecast is checked against what was really spent.

Amounts are cents. Every day here is a date, and `history` holds spending as positive cents (refunds negative).
"""

from __future__ import annotations

import datetime as dt
import itertools
import statistics
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

HALF_LIFE = 42  # days: how fast older spending stops counting
WEEKDAY_PRIOR = 4  # weeks of "an ordinary day" each weekday's shape is pulled toward
LOOKBACK = 365  # days of history the model reads
BACKTEST = 28  # days held back to measure how good the forecast is
MIN_HISTORY = 14  # days of history before there's any forecast at all


@dataclass(frozen=True)
class Spend:
    date: dt.date
    amount: int  # cents spent (a refund is negative)
    category: str  # the category's name, or "Not sorted yet"
    merchant: str
    one_off: bool = False  # won't happen again: not learned from


@dataclass
class Habit:
    merchant: str
    category: str
    every: int  # days between visits
    amount: int
    last: dt.date
    count: int

    def visits(self, start: dt.date, end: dt.date) -> list[dt.date]:
        out: list[dt.date] = []
        d = self.last + dt.timedelta(days=self.every)
        # A visit that's overdue (it didn't happen yet) is still expected, once, from the start of the window.
        if d < start and (start - d).days <= self.every:
            out.append(start)
        while d <= end:
            if d >= start:
                out.append(d)
            d += dt.timedelta(days=self.every)
        return out

    def view(self) -> dict[str, Any]:
        return {
            "merchant": self.merchant,
            "category": self.category,
            "every_days": self.every,
            "amount": self.amount,
            "last": self.last.isoformat(),
            "count": self.count,
        }


def find_habits(history: list[Spend], before: dt.date) -> list[Habit]:
    """Merchants paid at a steady gap, still going (seen within two gaps of `before`)."""
    by_merchant: dict[str, list[Spend]] = defaultdict(list)
    for s in history:
        if s.date < before and s.amount > 0 and s.merchant:
            by_merchant[s.merchant].append(s)
    habits: list[Habit] = []
    for name, spends in by_merchant.items():
        days = sorted({s.date for s in spends})
        if len(days) < 4:
            continue
        gaps = [(b - a).days for a, b in itertools.pairwise(days)][-8:]
        gap = statistics.median(gaps)
        if not 5 <= gap <= 35:
            continue
        # Steady: most gaps within a day or two (or a tenth of the gap) of the usual one.
        slack = max(2, gap * 0.1)
        if sum(abs(g - gap) <= slack for g in gaps) < 0.75 * len(gaps):
            continue
        last = days[-1]
        if (before - last).days > 2 * gap:
            continue  # stopped
        recent = [s.amount for s in spends if s.date >= days[-min(len(days), 6)]]
        habits.append(
            Habit(
                merchant=name,
                category=spends[-1].category,
                every=round(gap),
                amount=round(statistics.median(recent)),
                last=last,
                count=len(days),
            )
        )
    return habits


class Model:
    """Learned from the spending before `before`; forecasts any day from then on."""

    def __init__(self, history: list[Spend], before: dt.date):
        past = [s for s in history if s.date < before and (before - s.date).days <= LOOKBACK and not s.one_off]
        self.before = before
        self.first = min((s.date for s in past), default=None)
        self.days = (before - self.first).days if self.first else 0
        self.habits = find_habits(past, before) if self.days >= MIN_HISTORY else []
        habit_merchants = {h.merchant for h in self.habits}
        # Everyday spending by category: a decayed daily average, and each weekday's decayed average.
        self.rate: dict[str, float] = {}
        self.weekday: dict[str, list[float]] = {}
        if self.first is None or self.days < MIN_HISTORY:
            return
        first = self.first
        daily: dict[str, dict[dt.date, int]] = defaultdict(lambda: defaultdict(int))
        for s in past:
            if s.merchant not in habit_merchants:
                daily[s.category][s.date] += s.amount
        weights = [0.5 ** ((self.days - i) / HALF_LIFE) for i in range(self.days)]
        dates = [first + dt.timedelta(days=i) for i in range(self.days)]
        for cat, by_day in daily.items():
            values = [by_day.get(d, 0) for d in dates]
            total_w = sum(weights)
            rate = sum(v * w for v, w in zip(values, weights, strict=True)) / total_w
            if rate <= 0:
                continue
            shape = []
            for wd in range(7):
                ws = [(v, w) for v, w, d in zip(values, weights, dates, strict=True) if d.weekday() == wd]
                sw = sum(w for _, w in ws)
                raw = (sum(v * w for v, w in ws) / sw / rate) if sw else 1.0
                n = len(ws)  # weeks of this weekday seen
                shape.append((n * raw + WEEKDAY_PRIOR) / (n + WEEKDAY_PRIOR))
            # Keep the week's total what the average says it is.
            mean = sum(shape) / 7
            self.rate[cat] = rate
            self.weekday[cat] = [x / mean for x in shape]

    @property
    def ready(self) -> bool:
        return self.days >= MIN_HISTORY

    def usual(self, day: dt.date) -> dict[str, float]:
        """Everyday spending expected on `day`, by category."""
        return {cat: rate * self.weekday[cat][day.weekday()] for cat, rate in self.rate.items()}

    def days_ahead(self, start: dt.date, end: dt.date) -> list[dict[str, Any]]:
        """Each day from `start` to `end`: what's expected, and what makes it up (biggest first)."""
        n = (end - start).days + 1
        out = []
        habit_days: dict[dt.date, list[Habit]] = defaultdict(list)
        for h in self.habits:
            for d in h.visits(start, end):
                habit_days[d].append(h)
        for i in range(n):
            day = start + dt.timedelta(days=i)
            items: list[dict[str, Any]] = [
                {"name": cat, "amount": round(v), "kind": "usual"} for cat, v in self.usual(day).items()
            ]
            items += [
                {
                    "name": h.merchant.title(),
                    "amount": h.amount,
                    "kind": "habit",
                    "category": h.category,
                    "every_days": h.every,
                }
                for h in habit_days.get(day, [])
            ]
            items = sorted((x for x in items if x["amount"] > 0), key=lambda x: -x["amount"])
            out.append({"date": day.isoformat(), "expected": sum(x["amount"] for x in items), "items": items})
        return out


def accuracy(history: list[Spend], today: dt.date) -> float | None:
    """How close the forecast came over the last four weeks, given only the history before them (0 to 1)."""
    cutoff = today - dt.timedelta(days=BACKTEST)
    model = Model(history, cutoff)
    if not model.ready:
        return None
    predicted = model.days_ahead(cutoff, today - dt.timedelta(days=1))
    actual: dict[dt.date, int] = defaultdict(int)
    for s in history:
        if cutoff <= s.date < today and not s.one_off:
            actual[s.date] += s.amount
    # Week by week: a forecast isn't wrong for putting Saturday's shop on Sunday.
    err = total = 0
    for w in range(BACKTEST // 7):
        days = [cutoff + dt.timedelta(days=w * 7 + k) for k in range(7)]
        p = sum(predicted[w * 7 + k]["expected"] for k in range(7))
        a = sum(actual.get(d, 0) for d in days)
        err += abs(p - a)
        total += a
    if total <= 0:
        return None
    return max(0.0, 1 - err / total)


def forecast(history: list[Spend], today: dt.date, end: dt.date, spent_today: int) -> dict[str, Any]:
    """The days from today to `end`: what's likely to go, with a range, and how much to trust it."""
    model = Model(history, today)
    acc = accuracy(history, today) if model.ready else None
    if not model.ready:
        return {
            "ready": False,
            "history_days": model.days,
            "needs_days": MIN_HISTORY,
            "accuracy": None,
            "days": [],
            "rest": 0,
            "low": 0,
            "high": 0,
            "habits": [],
        }
    days = model.days_ahead(today, end)
    # Today: only what's still likely on top of what's already gone.
    if days:
        days[0]["expected"] = max(days[0]["expected"] - spent_today, 0)
    rest = sum(d["expected"] for d in days)
    # The range: as wide as the forecast was wrong over the last four weeks (a fair guess until then).
    spread = 1 - acc if acc is not None else 0.35
    spread = min(max(spread, 0.08), 0.6)
    return {
        "ready": True,
        "history_days": model.days,
        "needs_days": MIN_HISTORY,
        "accuracy": acc,
        "days": days,
        "rest": rest,
        "low": round(rest * (1 - spread)),
        "high": round(rest * (1 + spread)),
        "habits": [h.view() for h in sorted(model.habits, key=lambda h: -h.amount * 30 / h.every)],
    }


def usual_on(history: list[Spend], before: dt.date, days: list[dt.date]) -> list[int | None]:
    """A typical day's spending on each of `days`, habits spread evenly (to compare a day that's gone with)."""
    model = Model(history, before)
    if not model.ready:
        return [None] * len(days)
    habits = sum(h.amount / h.every for h in model.habits)
    return [round(sum(model.usual(d).values()) + habits) for d in days]
