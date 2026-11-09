"""What could go wrong: named shocks, each replayed through the freedom model on the household's plan."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.features.fire.model import Household, Plan, project
from app.features.fire.tax import income_tax

SHOCKS: dict[str, dict[str, str]] = {
    "rough": {
        "label": "A rough start",
        "what": "Markets fall 20% and then 10% in the two years after you stop, then bounce back 12% and 8%.",
    },
    "inflation": {
        "label": "High inflation",
        "what": "Prices rise faster than expected, so growth after inflation is a point lower every year.",
    },
    "spend": {"label": "Spending $10,000 more", "what": "Once stopped you spend $10,000 a year more than the plan."},
    "income": {
        "label": "An income lost for a year",
        "what": "One of you has no pay for a year, starting next year: no saving, no super from it, and the offset "
        "covers what the pay did.",
    },
}


def shocked(h: Household, plan: Plan, retire_age: int, shock: str) -> dict[str, Any]:
    """The plan's projection with a shock in it. Raises LookupError for a shock that isn't one of ours."""
    if shock == "rough":
        hit = {retire_age: -0.20, retire_age + 1: -0.10, retire_age + 2: 0.12, retire_age + 3: 0.08}
        return project(h, replace(plan, returns={**plan.returns, **hit}), retire_age)
    if shock == "inflation":
        return project(h, replace(plan, growth_change=plan.growth_change - 0.01), retire_age)
    if shock == "spend":
        spend = (plan.spend if plan.spend is not None else h.spend) + 10_000
        return project(h, replace(plan, spend=spend), retire_age)
    if shock == "income":
        # The lower earner's take-home for a year comes out of the offset, so the loan runs longer.
        lower = min(h.people, key=lambda p: p.salary)
        lost = lower.salary - income_tax(lower.salary, h.rules)
        return project(replace(h, offset=max(h.offset - lost, 0)), plan, retire_age)
    raise LookupError("That isn't a shock we know.")


def all_shocks(h: Household, plan: Plan, retire_age: int) -> list[dict[str, Any]]:
    """Each shock: how long the money lasts with it, and whether the plan still works."""
    out = []
    for key, about in SHOCKS.items():
        r = shocked(h, plan, retire_age, key)
        out.append({"key": key, **about, "lasts": r["lasts"], "ok": r["ok"], "gap": r["gap"]})
    return out
