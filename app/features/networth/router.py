"""Net worth: /api/networth (the picture over time) and /api/networth/assets (things owned, valued by hand, with
anything owed against them)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter

from app.dependencies import JsonBody, ServicesDep, run

router = APIRouter(prefix="/api/networth")

Entries = Literal["values", "owed"]


@router.get("")
async def overview(svc: ServicesDep, range: str = "1y"):
    """Accounts, the loan, shares, super and things owned, now and a month at a time over 1y, 3y or 5y."""
    return await run(svc.networth.overview, range)


@router.get("/assets/{asset_id}")
async def asset(svc: ServicesDep, asset_id: int, range: str = "all"):
    """One thing owned: every value and amount owed, and both a month at a time over 1y, 3y, 5y or all."""
    return await run(svc.networth.asset, asset_id, range)


@router.post("/assets")
async def add_asset(svc: ServicesDep, body: JsonBody):
    """{"name": "Home", "kind": "home", "value": 76000000, "date": "2024-03-01", "note": "What we paid"}"""
    return await run(svc.networth.save_asset, body)


@router.put("/assets/{asset_id}")
async def update_asset(svc: ServicesDep, asset_id: int, body: JsonBody):
    """The name, kind and what's owed against it (owed_name, owed_rate_bp); a value ({"value": 78000000}) or an amount
    owed ({"owed": 1500000}) given here is kept with the old ones."""
    return await run(svc.networth.save_asset, body, asset_id)


@router.delete("/assets/{asset_id}")
async def remove_asset(svc: ServicesDep, asset_id: int):
    """Put aside: POST …/restore brings it back."""
    return {"removed": await run(svc.networth.remove_asset, asset_id)}


@router.post("/assets/{asset_id}/restore")
async def restore_asset(svc: ServicesDep, asset_id: int):
    return await run(svc.networth.restore_asset, asset_id)


@router.post("/assets/{asset_id}/{what}")
async def add_entry(svc: ServicesDep, asset_id: int, what: Entries, body: JsonBody):
    """A value ({"date", "value", "note"}) or an amount owed ({"date", "amount", "note"})."""
    return await run(svc.networth.save_entry, what, asset_id, body)


@router.put("/assets/{asset_id}/{what}/{entry_id}")
async def update_entry(svc: ServicesDep, asset_id: int, what: Entries, entry_id: int, body: JsonBody):
    return await run(svc.networth.save_entry, what, asset_id, body, entry_id)


@router.delete("/assets/{asset_id}/{what}/{entry_id}")
async def remove_entry(svc: ServicesDep, asset_id: int, what: Entries, entry_id: int):
    return await run(svc.networth.remove_entry, what, asset_id, entry_id)
