"""Net worth: /api/networth (the picture over time) and /api/networth/assets (things owned, valued by hand)."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import JsonBody, ServicesDep, run

router = APIRouter(prefix="/api/networth")


@router.get("")
async def overview(svc: ServicesDep, range: str = "1y"):
    """Accounts, the loan, shares, super and things owned, now and a month at a time over 1y, 3y or 5y."""
    return await run(svc.networth.overview, range)


@router.post("/assets")
async def add_asset(svc: ServicesDep, body: JsonBody):
    """{"name": "Home", "kind": "home", "value": 76000000}"""
    return await run(svc.networth.save_asset, body)


@router.put("/assets/{asset_id}")
async def update_asset(svc: ServicesDep, asset_id: int, body: JsonBody):
    """A new value ({"value": 78000000}) is kept with the old ones; the name and kind can change too."""
    return await run(svc.networth.save_asset, body, asset_id)


@router.delete("/assets/{asset_id}")
async def remove_asset(svc: ServicesDep, asset_id: int):
    return {"removed": await run(svc.networth.remove_asset, asset_id)}
