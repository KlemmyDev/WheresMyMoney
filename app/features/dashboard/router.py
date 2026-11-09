"""The dashboard: /api/dashboard."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import ServicesDep, run

router = APIRouter(prefix="/api/dashboard")


@router.get("")
async def dashboard(svc: ServicesDep, period: str = "6m"):
    """Everything on the dashboard; `period` (30d, 3m, 6m, 1y, all) sets the cash flow and the trends."""
    return await run(svc.dashboard.build, period)
