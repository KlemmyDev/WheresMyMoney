"""Investments: /api/investments (funds, trades, prices and the portfolio's history)."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import JsonBody, ServicesDep, run

router = APIRouter(prefix="/api/investments")


async def _overview(svc: ServicesDep):
    lo = await run(svc.accounts.loan)
    return await run(svc.investments.overview, lo["rate_bp"] if lo else None)


@router.get("")
async def overview(svc: ServicesDep):
    """The portfolio: each fund's holding, value and gain, the totals, the mix, trades and distributions."""
    return await _overview(svc)


@router.get("/history")
async def history(svc: ServicesDep, range: str = "1y"):
    """The portfolio's value and cost over 1m, 6m, 1y or 5y: [{"date", "value", "cost"}]."""
    return await run(svc.investments.history, range)


@router.post("/funds")
async def add_fund(svc: ServicesDep, body: JsonBody):
    """{"ticker": "VAS", "name": "Australian shares", "group": "aus", "target": 0.5}"""
    return await run(svc.investments.save_fund, body)


@router.put("/funds/{fund_id}")
async def update_fund(svc: ServicesDep, fund_id: int, body: JsonBody):
    return await run(svc.investments.save_fund, body, fund_id)


@router.delete("/funds/{fund_id}")
async def remove_fund(svc: ServicesDep, fund_id: int):
    return {"removed": await run(svc.investments.remove_fund, fund_id)}


@router.post("/trades")
async def add_trade(svc: ServicesDep, body: JsonBody):
    """{"fund_id": 1, "side": "buy", "units": 15, "price": 13120, "fee": 0, "date": "2026-09-01"} (price in cents)."""
    await run(svc.investments.add_trade, body)
    return await _overview(svc)


@router.delete("/trades/{trade_id}")
async def remove_trade(svc: ServicesDep, trade_id: int):
    await run(svc.investments.remove_trade, trade_id)
    return await _overview(svc)


@router.post("/prices")
async def refresh_prices(svc: ServicesDep):
    """Look the prices up now (they're looked up once a day after the market shuts anyway)."""
    return await run(svc.investments.refresh_prices)
