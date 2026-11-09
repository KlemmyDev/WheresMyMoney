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


def fixes(h: Household, plan: Plan, retire_age: int, shock: str) -> list[dict[str, Any]]:
    """The cheapest ways back to the aim with a shock in it: working one to three years longer, or spending less once
    stopped. The two cheapest that reach it; with one, it and the closest that doesn't."""
    spend = plan.spend if plan.spend is not None else h.spend
    tries: list[dict[str, Any]] = [
        {"kind": "later", "age": retire_age + 1, "plan": plan},
        {"kind": "later", "age": retire_age + 2, "plan": plan},
        {"kind": "later", "age": retire_age + 3, "plan": plan},
        {"kind": "spend", "age": retire_age, "spend": round(spend * 0.9), "plan": replace(plan, spend=spend * 0.9)},
        {"kind": "spend", "age": retire_age, "spend": round(spend * 0.85), "plan": replace(plan, spend=spend * 0.85)},
    ]
    out: list[dict[str, Any]] = []
    for t in tries:
        r = shocked(h, t["plan"], t["age"], shock)
        out.append({k: v for k, v in t.items() if k != "plan"} | {"lasts": r["lasts"], "ok": r["ok"]})
    working = [x for x in out if x["ok"]]
    rest = sorted((x for x in out if not x["ok"]), key=lambda x: -int(x["lasts"]))
    # The cheapest that work first; if fewer than two do, the ones that get closest.
    return (working[:1] + rest[:1] if len(working) == 1 else (working or rest))[:2]


def fan(h: Household, plan: Plan, retire_age: int) -> dict[str, Any]:
    """Good, typical and bad years: growth after inflation 1.5 points either side, as put-away money by age."""
    out: dict[str, Any] = {}
    for key, change in (("good", 0.015), ("typical", 0.0), ("bad", -0.015)):
        r = project(h, replace(plan, growth_change=plan.growth_change + change), retire_age)
        out[key] = {
            "lasts": r["lasts"],
            "path": [round((x["super"] + x["etfs"] + x["offset"]) * 100) for x in r["rows"]],
        }
    out["ages"] = [x["age"] for x in project(h, plan, retire_age)["rows"]]
    return out
