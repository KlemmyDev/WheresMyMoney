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


@router.put("/{bill_id}")
async def update(svc: ServicesDep, bill_id: int, body: JsonBody):
    await run(svc.bills.update, bill_id, body)
    return await _overview(svc)


@router.delete("/{bill_id}")
async def remove(svc: ServicesDep, bill_id: int):
    await run(svc.bills.remove, bill_id)
    return await _overview(svc)
