"""Loan or invest: what extra a month does on the loan (into the offset, the same saving as a higher repayment but
still reachable) against investing it. Month by month at today's rate, the repayment fixed."""

from __future__ import annotations

import datetime as dt
from typing import Any

from app.core import dates
from app.features.fire.model import Household

MAX_MONTHS = 600


def payoff(loan: float, offset: float, rate: float, repayment: float, offset_growth: float) -> dict[str, float]:
    """Months until the offset matches the loan (when no more interest is charged, and it can be paid out), and the
    interest charged until then. `offset_growth` goes into the offset each month."""
    owed, held, interest = float(loan), float(offset), 0.0
    for month in range(MAX_MONTHS):
        charged = max(owed - held, 0) * rate / 12
        interest += charged
        owed -= repayment - charged
        held += offset_growth
        if owed <= held:
            return {"months": month + 1, "interest": interest}
    return {"months": MAX_MONTHS, "interest": interest}


def compare(h: Household, extra: float, today: dt.date | None = None) -> dict[str, Any]:
    """An extra amount a month into the offset, against as things are: when the loan's gone each way, and the
    interest saved (for sure: no tax, no swings). The month it's gone counts from this month."""
    start = (today or dates.today()).replace(day=1)
    base = payoff(h.loan, h.offset, h.loan_rate, h.repayment, h.spare)
    more = payoff(h.loan, h.offset, h.loan_rate, h.repayment, h.spare + extra)
    return {
        "extra": extra,
        "months": more["months"],
        "gone": dates.add_months(start, int(more["months"])).isoformat()[:7],
        "base_months": base["months"],
        "base_gone": dates.add_months(start, int(base["months"])).isoformat()[:7],
        "interest_saved": base["interest"] - more["interest"],
    }


def race(h: Household, extra: float, into: str, rate_change: float = 0.0, years: int = 19) -> dict[str, Any]:
    """Extra a month into the offset (`into` "off") or ETFs ("inv"), at today's rate moved by `rate_change`: when
    the loan's gone, the interest saved, what's extra in the ETFs by the time the loan would be gone as it is, the
    freedom age, and both paths a quarter at a time (the loan left after the offset, and the ETFs)."""
    from dataclasses import replace

    from app.features.fire.model import THE_PLAN, freedom

    rate = h.loan_rate + rate_change
    base = payoff(h.loan, h.offset, rate, h.repayment, h.spare)
    # ETFs a month, after tax: distributions taxed at the marginal rate, growth half-taxed when sold (as the ladder).
    growth = (1 + (h.super_return - 0.002) * (1 - h.marginal_rate * 0.45)) ** (1 / 12) - 1
    owed, held, etf, interest = float(h.loan), float(h.offset), float(h.etfs), 0.0
    gone: int | None = None
    etf_at_base = None
    loan_path: list[int] = []
    etf_path: list[int] = []
    for month in range(years * 12 + 1):
        if month % 3 == 0:
            loan_path.append(round(max(owed - held, 0) * 100))
            etf_path.append(round(etf * 100))
        if month == int(base["months"]):
            etf_at_base = etf
        if gone is None:
            charged = max(owed - held, 0) * rate / 12
            interest += charged
            owed -= h.repayment - charged
            held += h.spare + (extra if into == "off" else 0)
            if owed <= held:
                gone = month + 1
                etf += held - owed
                owed = held = 0.0
        freed = (h.repayment + h.spare + extra) / 2 if gone is not None else 0.0
        etf = etf * (1 + growth) + h.etf_saving / 12 + (extra if into == "inv" and gone is None else 0) + freed
    # The freedom age with the extra: into the offset while the loan's on, or ETFs; the loan money kept working.
    spare = h.spare + extra
    split = (1.0, 0.0, 0.0) if into == "off" or spare == 0 else (h.spare / spare, extra / spare, 0.0)
    fr = freedom(replace(h, loan_rate=rate), replace(THE_PLAN, spare=spare, split=split))
    base_etf = race_etf_only(h, rate, int(base["months"]), growth)
    return {
        "extra": extra,
        "into": into,
        "rate": rate,
        "months": gone or MAX_MONTHS,
        "base_months": base["months"],
        "interest_saved": max(base["interest"] - interest, 0.0),
        "etf_extra": max((etf_at_base or etf) - base_etf, 0.0),
        "retire_age": fr["retire_age"] if fr else None,
        "loan_path": loan_path,
        "etf_path": etf_path,
    }


def race_etf_only(h: Household, rate: float, months: int, growth: float) -> float:
    """The ETFs at the month the loan would be gone as it is, with no extra: the baseline for "extra in ETFs"."""
    etf = float(h.etfs)
    for _ in range(months):
        etf = etf * (1 + growth) + h.etf_saving / 12
    return etf
