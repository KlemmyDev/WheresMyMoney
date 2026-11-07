"""
What a home loan's statement says besides its transactions: the interest rate, and the repayment.

uBank writes rate changes into the statement as rows of $0.00:
- "Original Rate: 5.290000 %" when the loan starts;
- "Rate Change: 5.2900% To 5.5400%" when it changes.
The repayment is the scheduled payment ("Schedule Pmt - Deposit - Auto Split"): a different amount from the one before
is a repayment change. A $0.00 row naming a repayment and a dollar amount counts too.

The rows here are as the loan sees them: what's owed is positive, so a repayment is negative.
"""

from __future__ import annotations

import re
from typing import Any

from app.features.imports.statement import Row, cents

PERCENT = re.compile(r"(\d{1,2}(?:\.\d+)?)\s*%")
DOLLARS = re.compile(r"\$\s?[\d,]+(?:\.\d{1,2})?")
SCHEDULED = ("SCHEDULE PMT", "SCHEDULED PMT", "SCHEDULED PAYMENT", "SCHEDULED REPAYMENT", "LOAN REPAYMENT")


def rate(description: str) -> tuple[int, int | None] | None:
    """(the rate now, the rate before) in basis points, from a row about the rate; None for any other row."""
    if "RATE" not in description.upper():
        return None
    found = [round(float(p) * 100) for p in PERCENT.findall(description)]
    found = [bp for bp in found if 0 <= bp <= 3000]
    if not found:
        return None
    return found[-1], (found[0] if len(found) > 1 else None)


def scheduled(description: str) -> bool:
    d = " ".join(description.upper().split())
    return d.startswith(SCHEDULED) or " SCHEDULE PMT" in d


def is_note(r: Row) -> bool:
    """A row of $0.00 that only says something (a rate change): kept out of the ledger."""
    return r.amount == 0


def changes(rows: list[Row]) -> list[dict[str, Any]]:
    """Every rate and repayment the statement shows, oldest first: {date, field, value, was, description, index}.
    `was` is the one before, when the statement says (a repayment's comes from the payment before it)."""
    out: list[dict[str, Any]] = []
    last_payment: int | None = None
    for r in rows:
        if r.amount == 0:
            found = rate(r.description)
            if found:
                out.append(_change(r, "rate", found[0], found[1]))
                continue
            if "REPAYMENT" in r.description.upper() or "INSTALMENT" in r.description.upper():
                amounts = DOLLARS.findall(r.description)
                value = cents(amounts[-1]) if amounts else None
                if value:
                    was = cents(amounts[0]) if len(amounts) > 1 else last_payment
                    out.append(_change(r, "repayment", value, was))
                    last_payment = value
            continue
        if r.amount < 0 and scheduled(r.description):
            paid = -r.amount
            if paid != last_payment:
                out.append(_change(r, "repayment", paid, last_payment))
            last_payment = paid
    return out


def _change(r: Row, field: str, value: int, was: int | None) -> dict[str, Any]:
    return {"date": r.date, "field": field, "value": value, "was": was, "description": r.description, "index": r.index}


def why(r: Row) -> str:
    """What a loan's row is, for the review."""
    d = r.description.upper()
    if r.amount == 0:
        return "note"
    if "INTEREST" in d:
        return "interest"
    if "PROCEEDS" in d or "DRAWDOWN" in d or "ADVANCE" in d:
        return "drawdown"
    if "FEE" in d:
        return "fee"
    if r.amount < 0:
        return "repayment"
    return "loan"
