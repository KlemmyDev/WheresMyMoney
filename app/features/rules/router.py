"""Rules (the household's plan for moving money): /api/rules."""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter

from app.core import dates
from app.dependencies import JsonBody, ServicesDep, run

router = APIRouter(prefix="/api/rules")


async def _overview(svc: ServicesDep):
    rules = await run(svc.rules.all)
    ov = await run(svc.accounts.overview)
    spend = next((a for a in ov["accounts"] if a["role"] == "spending"), None)
    lo = ov["loan"]
    month = await run(
        svc.rules.month,
        await run(svc.bills.per_month),
        (spend or {}).get("allowance") or 0,
        (lo or {}).get("repayment") or 0,
    )
    # What the next payday does to each account.
    pay = next((r for r in rules if r.kind == "pay" and r.enabled), None)
    preview = None
    if pay:
        day = pay.next_run()
        balances = {a["id"]: float(a["balance"]) for a in ov["accounts"]}
        per_month = {a["id"]: await run(svc.bills.per_month, a["id"]) for a in ov["accounts"] if a["role"] == "bills"}
        sim = await run(svc.rules.simulate, balances, day - dt.timedelta(days=1), day, [], per_month, None)
        preview = {
            "date": day.isoformat(),
            "events": sim.events,
            "after": {k: round(v) for k, v in sim.balances.items()},
        }
    # The month's top-up and sweep, as they'd go from today's balances.
    return {
        "rules": [r.view() for r in rules],
        "month": month,
        "payday": preview,
        "today": dates.today().isoformat(),
    }


@router.get("")
async def overview(svc: ServicesDep):
    return await _overview(svc)


@router.post("")
async def add(svc: ServicesDep, body: JsonBody):
    """{"kind": "transfer", "from_account": 1, "to_account": 2, "amount": 120000, "every": "fortnightly",
    "anchor": "2026-11-12", "label": "Payday to Bills"}"""
    await run(svc.rules.add, body)
    return await _overview(svc)


@router.put("/{rule_id}")
async def update(svc: ServicesDep, rule_id: int, body: JsonBody):
    await run(svc.rules.update, rule_id, body)
    return await _overview(svc)


@router.delete("/{rule_id}")
async def remove(svc: ServicesDep, rule_id: int):
    await run(svc.rules.remove, rule_id)
    return await _overview(svc)
