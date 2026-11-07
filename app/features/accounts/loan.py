"""
The home loan and what offsets it.

Coverage is the offsetting accounts' total over the loan's balance. Interest is charged on what isn't offset, so each
dollar offsetting saves the loan's rate on it. The date it's fully offset comes from stepping forward a month at a
time: the offsets grow by the monthly pace, interest is charged on the rest, and the repayment pays it and some of the
loan. Estimates at today's rate, for the household's own planning.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from app.core import dates

MAX_MONTHS = 40 * 12


@dataclass(frozen=True)
class Projection:
    months: int | None  # until fully offset (None: not at this pace)
    date: str | None  # YYYY-MM
    interest: int  # cents of interest charged until then (or over 40 years)
    points: list[tuple[str, int, int]]  # (YYYY-MM, loan, offsetting) each month


def daily_interest(offsetting: int, loan: int, rate_bp: int) -> float:
    """Cents of interest a day the offsets save."""
    return min(max(offsetting, 0), max(loan, 0)) * rate_bp / 10000 / 365


def project(
    loan: int, offsetting: int, rate_bp: int, repayment: int, monthly_growth: int, start: dt.date | None = None
) -> Projection:
    start = start or dates.today()
    owed, offset, interest = float(loan), float(offsetting), 0.0
    monthly_rate = rate_bp / 10000 / 12
    points = [(start.strftime("%Y-%m"), round(owed), round(offset))]
    for month in range(1, MAX_MONTHS + 1):
        if offset >= owed:
            day = dates.add_months(start, month - 1)
            return Projection(month - 1, day.strftime("%Y-%m"), round(interest), points)
        charged = max(owed - offset, 0) * monthly_rate
        interest += charged
        owed = max(owed - (repayment - charged), 0)
        offset += monthly_growth
        points.append((dates.add_months(start, month).strftime("%Y-%m"), round(owed), round(offset)))
        if owed <= 0:
            day = dates.add_months(start, month)
            return Projection(month, day.strftime("%Y-%m"), round(interest), points)
    return Projection(None, None, round(interest), points)


def scenarios(
    loan: int, offsetting: int, rate_bp: int, repayment: int, monthly_growth: int, extras: tuple[int, ...]
) -> list[dict[str, object]]:
    """What putting extra into the offset each month does: the date it's fully offset, how much sooner, and the
    interest saved."""
    base = project(loan, offsetting, rate_bp, repayment, monthly_growth)
    out: list[dict[str, object]] = []
    for extra in extras:
        p = project(loan, offsetting, rate_bp, repayment, monthly_growth + extra)
        sooner = base.months - p.months if base.months is not None and p.months is not None else None
        out.append(
            {
                "extra": extra,
                "date": p.date,
                "months": p.months,
                "sooner": sooner,
                "interest_saved": max(base.interest - p.interest, 0) if extra else 0,
            }
        )
    return out
