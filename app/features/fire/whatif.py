"""What-ifs: the scenario page's levers turned into a plan, the result, and what it would take to stop at an age."""

from __future__ import annotations

from typing import Any

from app.features.fire.model import Household, Plan, freedom, project

SPLIT = {"off": (1.0, 0.0, 0.0), "etf": (0.0, 1.0, 0.0), "sup": (0.0, 0.0, 1.0), "mix": (0.0, 0.5, 0.5)}
WHERE = {"off": "the offset", "etf": "ETFs", "sup": "super", "mix": "ETFs and super"}
PART_TIME = 40_000  # a year between you, until super opens
ESSENTIALS = 55_000  # below this a year, spending less isn't a realistic fix on its own


def levers_of(body: dict[str, Any], h: Household) -> dict[str, Any]:
    """The levers, checked, with the household's own numbers where one isn't given. Money in dollars."""
    spend_in = body.get("spend")
    spare_in = body.get("spare")
    try:
        out: dict[str, Any] = {
            "retire_age": int(body.get("retire_age") or 60),
            "spend": float(spend_in) if spend_in is not None else h.spend,
            "spare": float(spare_in) if spare_in is not None else h.spare,
            "where": str(body.get("where") or "off"),
            "keep": bool(body.get("keep", False)),
            "part_time": bool(body.get("part_time", False)),
            "one_off": str(body.get("one_off") or "none"),
            "pension": bool(body.get("pension", False)),
        }
    except (TypeError, ValueError):
        raise ValueError("Those levers aren't numbers we can use.") from None
    if out["where"] not in SPLIT:
        raise ValueError("Say where spare money goes: the offset, ETFs, super or both.")
    if out["one_off"] not in ("none", "car", "inheritance"):
        raise ValueError("A one-off is a car or an inheritance.")
    if not 40 <= out["retire_age"] <= 75:
        raise ValueError("Choose an age to stop between 40 and 75.")
    if out["spend"] < 0 or out["spare"] < 0:
        raise ValueError("Spending and saving can't be below nothing.")
    return out


def plan_of(lv: dict[str, Any], h: Household) -> Plan:
    lead = h.lead.age
    one = None
    if lv["one_off"] == "car":
        one = (max(45, lead + 1), -30_000.0)
    elif lv["one_off"] == "inheritance":
        one = (max(55, lead + 1), 100_000.0)
    opens = h.rules.PRESERVATION_AGE
    return Plan(
        split=SPLIT[lv["where"]],
        keep=lv["keep"],
        spare=lv["spare"],
        spend=lv["spend"],
        part_time=(lv["retire_age"], opens, PART_TIME) if lv["part_time"] and lv["retire_age"] < opens else None,
        pension=lv["pension"],
        one_off=one,
    )


def run(h: Household, lv: dict[str, Any]) -> dict[str, Any]:
    """The levers' projection at their age to stop, and the earliest age they'd work from."""
    plan = plan_of(lv, h)
    at = project(h, plan, lv["retire_age"])
    soonest = freedom(h, plan)
    return {"result": at, "soonest": soonest["retire_age"] if soonest else None}


def seek(h: Household, lv: dict[str, Any], target: int) -> list[dict[str, Any]]:
    """What would it take to stop at `target`: the smallest single change from these levers (put more away a
    month, or spend less a year), and two smaller changes together."""
    base = {**lv, "retire_age": target}

    def works(x: dict[str, Any]) -> bool:
        return bool(project(h, plan_of(x, h), target)["ok"])

    if works(base):
        lasts = project(h, plan_of(base, h), target)["lasts"]
        return [{"kind": "already", "levers": base, "lasts": min(lasts, 100)}]
    out: list[dict[str, Any]] = []
    spare = next((v for v in range(int(lv["spare"]) + 250, 8001, 250) if works({**base, "spare": v})), None)
    out.append(
        {
            "kind": "save",
            "spare": spare,
            "more": spare - lv["spare"] if spare else None,
            "levers": {**base, "spare": spare} if spare else None,
            "where": WHERE[lv["where"]],
        }
    )
    spend = next((v for v in range(int(lv["spend"]) - 1000, 19_999, -1000) if works({**base, "spend": v})), None)
    out.append(
        {
            "kind": "spend",
            "spend": spend,
            "less": lv["spend"] - spend if spend else None,
            "realistic": spend is not None and spend >= ESSENTIALS,
            "levers": {**base, "spend": spend} if spend else None,
        }
    )
    mix_spend = 70_000 if lv["spend"] > 70_000 else lv["spend"] - 10_000
    mix = next((v for v in range(int(lv["spare"]), 8001, 250) if works({**base, "spend": mix_spend, "spare": v})), None)
    if mix is not None:
        out.append(
            {"kind": "mix", "spend": mix_spend, "spare": mix, "levers": {**base, "spend": mix_spend, "spare": mix}}
        )
    return out
