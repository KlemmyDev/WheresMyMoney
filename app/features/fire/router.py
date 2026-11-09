"""Early retirement: /api/fire (backend only until the early-retirement pages are built)."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import ServicesDep, run

router = APIRouter(prefix="/api/fire")


@router.get("")
async def overview(svc: ServicesDep):
    """Freedom on today's plan and with the plan, the year-by-year path, the bridge before super opens, where the
    next $100 of pay lands, loan or invest, and the named shocks. Money in cents; ages and years as numbers."""
    return await run(svc.fire.overview)
