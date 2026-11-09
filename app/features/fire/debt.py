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
