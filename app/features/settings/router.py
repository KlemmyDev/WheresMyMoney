"""The household's settings: /api/settings."""

from __future__ import annotations

from fastapi import APIRouter

from app.core import dates
from app.core.version import about
from app.dependencies import JsonBody, ServicesDep, run

router = APIRouter(prefix="/api/settings")


@router.get("")
async def get(svc: ServicesDep):
    return {"settings": await run(svc.settings.all), "about": about(), "today": dates.today().isoformat()}


@router.put("")
async def put(svc: ServicesDep, body: JsonBody):
    return {"settings": await run(svc.settings.update, body), "about": about(), "today": dates.today().isoformat()}
