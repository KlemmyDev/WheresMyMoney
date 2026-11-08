"""Bills: /api/bills."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import JsonBody, ServicesDep, run

router = APIRouter(prefix="/api/bills")


async def _overview(svc: ServicesDep):
    ov = await run(svc.accounts.overview)
    acct = next((a for a in ov["accounts"] if a["role"] == "bills"), None)
    return await run(svc.bills.overview, acct)


@router.get("")
async def overview(svc: ServicesDep):
    """Every bill, what they come to a month and a year, the next 30 days, the months ahead, and the bills account."""
    return await _overview(svc)


@router.post("")
async def add(svc: ServicesDep, body: JsonBody):
    """{"name": "Internet", "amount": 8900, "every": "monthly", "next_due": "2026-11-12", "account_id": 2,
    "how": "auto"}"""
    await run(svc.bills.add, body)
    return await _overview(svc)


@router.get("/spotted")
async def spotted(svc: ServicesDep):
    """Bills spotted in the imported statements (regular payments to the same merchant) and bills whose price has
    moved: {"suggestions": [...], "updates": [...]}."""
    return await run(svc.bills.spotted)


@router.post("/spotted/accept")
async def accept(svc: ServicesDep, body: JsonBody):
    """Add a spotted bill: {"key": "NETFLIX|monthly|3", "changes": {"name": "Netflix"}}."""
    await run(svc.bills.accept, str(body.get("key") or ""), body.get("changes") or {})
    return await _overview(svc)


@router.post("/spotted/dismiss")
async def dismiss(svc: ServicesDep, body: JsonBody):
    """Stop suggesting a spotted bill or an update: {"key": "..."}."""
    await run(svc.bills.dismiss, body.get("key"))
    return {"dismissed": True}


@router.get("/{bill_id}")
async def detail(svc: ServicesDep, bill_id: int):
    """One bill: its payments, what they add up to, its price changes and what's ahead, with the payments as
    transactions (newest first) to open."""
    d = await run(svc.bills.detail, bill_id)
    ids = [int(p["id"]) for p in d["payments"]]
    d["transactions"] = await run(svc.spending.transactions, None, None, None, max(len(ids), 1), ids) if ids else []
    return d


@router.put("/{bill_id}")
async def update(svc: ServicesDep, bill_id: int, body: JsonBody):
    await run(svc.bills.update, bill_id, body)
    return await _overview(svc)


@router.delete("/{bill_id}")
async def remove(svc: ServicesDep, bill_id: int):
    await run(svc.bills.remove, bill_id)
    return await _overview(svc)
