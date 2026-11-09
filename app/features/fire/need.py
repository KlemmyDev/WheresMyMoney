"""
On track: where each part of the plan has to be every year to stop at the goal age, against where today's pace has
it. Three parts, each with its own job:

- Super has to last from when it opens (60) to the plan-to age on its own.
- Outside super (the ETFs) has to pay for the years from stopping until super opens.
- The loan has to be gone by the year you stop.

Each "need" is worked backwards from the end, through the same year-by-year flows the freedom model uses (the money
going in while working, the offset's leftovers joining the ETFs when the loan goes, each year's growth and each
retired year's spending), so a balance on its need line, with the plan's contributions, gets there exactly. Anything outside super beyond the
bridge carries on paying after 60, so the two together decide: the goal works when what's put away is on or above
their combined need, whichever part it sits in.

Money in dollars (today's), the loan in dollars of the day; the service converts to cents.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.features.fire.model import Household, Plan, freedom, project


def checkpoints(h: Household, plan: Plan, goal: int) -> dict[str, Any]:
    """The projection at the goal age with the needs added to each year's row, and today's three parts."""
    r = project(h, plan, goal)
    rows = r["rows"]
    opens = h.rules.PRESERVATION_AGE
    end = h.plan_to
    by_age = {x["age"]: x for x in rows}
    last = min(end, rows[-1]["age"])
    sup_need: dict[int, float] = {last: 0.0}
    out_need: dict[int, float] = {}
    for age in range(last - 1, h.lead.age - 1, -1):
        x = by_age[age]
        g = 1 + x["growth"]
        nxt = sup_need[age + 1]
        if age >= goal and age >= opens:
            sup_need[age] = (nxt + x.get("need", 0.0)) / g
        elif age >= goal:
            sup_need[age] = nxt / g
        else:
            sup_need[age] = (nxt - x["in"]["super"]) / g
    for age in range(max(opens, h.lead.age), last + 1):
        out_need[age] = 0.0
    for age in range(min(opens, last + 1) - 1, h.lead.age - 1, -1):
        x = by_age[age]
        g = 1 + x["growth"]
        nxt = out_need[age + 1]
        if age >= goal:
            out_need[age] = (nxt + x.get("need", 0.0)) / g - x["in"]["lump"]
        else:
            out_need[age] = (nxt - x["in"]["etfs"]) / g - x["in"]["lump"]
    # The most that can be owed past the offset at the start of each year and still be clear by the goal, on the
    # repayments and the offset's top-ups: walked back a month at a time.
    monthly = h.loan_rate / 12
    pay = h.repayment + plan.extra_loan
    owe_max: dict[int, float] = {}
    m = 0.0
    for age in range(goal - 1, h.lead.age - 1, -1):
        top_up = by_age[age]["in"]["offset"] / 12 if age in by_age else 0.0
        for _ in range(12):
            m = (m + pay + top_up) / (1 + monthly)
        owe_max[age] = m
    owe_max[goal] = 0.0
    years = []
    for x in rows:
        age = x["age"]
        if age > last:
            break
        years.append(
            {
                "age": age,
                "year": x["year"],
                "super": x["super"],
                "etfs": x["etfs"] + x.get("cash", 0.0),
                "owed": x["owed"],
                # Outside super's future savings beyond the bridge carry on into the super years, so they come off
                # super's need; outside super itself never needs less than nothing.
                "super_need": sup_need.get(age, 0.0) + min(out_need.get(age, 0.0), 0.0),
                "outside_need": max(out_need.get(age, 0.0), 0.0),
                "owe_max": owe_max.get(age) if age <= goal else None,
                "short": (x.get("paid") or {}).get("short", 0.0),
                "paid": x.get("paid"),
            }
        )
    now = years[0]
    parts = {
        "loan": {"need": now["owe_max"] or 0.0, "have": now["owed"], "ahead": (now["owe_max"] or 0.0) - now["owed"]},
        "outside": {"need": now["outside_need"], "have": now["etfs"], "ahead": now["etfs"] - now["outside_need"]},
        "super": {"need": now["super_need"], "have": now["super"], "ahead": now["super"] - now["super_need"]},
    }
    return {"result": r, "years": years, "parts": parts}


def closers(h: Household, plan: Plan, goal: int) -> list[dict[str, Any]]:
    """The smallest single change that gets the goal working on its own: more into super a month (salary
    sacrifice, before tax), more into the ETFs a month, keeping the loan money working once it's gone, spending
    less once stopped, or stopping later. Empty when it already works."""

    def works(p: Plan, age: int = goal) -> bool:
        return bool(project(h, p, age)["ok"])

    if works(plan):
        return []
    out: list[dict[str, Any]] = []
    sup = next((v for v in range(50, 5001, 50) if works(replace(plan, extra_super=plan.extra_super + v))), None)
    if sup is not None:
        out.append({"key": "super", "amount": sup, "plan": {"extra_super": plan.extra_super + sup}})
    etf = next((v for v in range(50, 5001, 50) if works(replace(plan, extra_etfs=plan.extra_etfs + v))), None)
    if etf is not None:
        out.append({"key": "etfs", "amount": etf, "plan": {"extra_etfs": plan.extra_etfs + etf}})
    if not plan.keep and works(replace(plan, keep=True)):
        out.append({"key": "keep", "amount": 0, "plan": {"keep": True}})
    spend = plan.spend if plan.spend is not None else h.spend
    less = next((v for v in range(1000, int(spend) - 19_999, 1000) if works(replace(plan, spend=spend - v))), None)
    if less is not None:
        out.append({"key": "spend", "amount": less, "plan": {"spend": spend - less}})
    later = freedom(h, plan)
    if later is not None and later["retire_age"] > goal:
        out.append({"key": "later", "amount": later["retire_age"] - goal, "plan": {"goal": later["retire_age"]}})
    return out
