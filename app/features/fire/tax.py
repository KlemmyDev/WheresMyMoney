"""Income tax and where a dollar of pay lands: in hand, or in super."""

from __future__ import annotations

from types import ModuleType


def income_tax(salary: float, rules: ModuleType) -> float:
    """Tax on a year's salary, with the Medicare levy (dollars)."""
    tax = 0.0
    brackets = rules.BRACKETS
    for i, (start, rate) in enumerate(brackets):
        end = brackets[i + 1][0] if i + 1 < len(brackets) else float("inf")
        if salary > start:
            tax += (min(salary, end) - start) * rate
    return tax + max(salary, 0) * rules.MEDICARE


def marginal_rate(salary: float, rules: ModuleType) -> float:
    """The tax on the next dollar of pay, Medicare included (0.32 for $120,000 in 2026-27)."""
    rate = next(r for start, r in reversed(rules.BRACKETS) if salary > start) if salary > 0 else 0.0
    return rate + rules.MEDICARE


def next_dollar(salary: float, rules: ModuleType) -> dict[str, float]:
    """Where $100 more pay lands: in hand after tax, or in super after the 15% going in (salary sacrifice)."""
    mtr = marginal_rate(salary, rules)
    return {
        "rate": mtr,
        "in_hand": round(100 * (1 - mtr), 2),
        "into_super": round(100 * (1 - rules.CONTRIBUTIONS_TAX), 2),
    }
