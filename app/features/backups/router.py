"""Backups: /api/backups (Settings → Updates and backups)."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import ServicesDep, run

router = APIRouter(prefix="/api/backups")


@router.get("")
async def backups(svc: ServicesDep):
    return {"backups": await run(svc.backups.all), "folder": "data/backups"}


@router.post("")
async def back_up_now(svc: ServicesDep):
    made = await run(svc.backups.make, "manual")
    return {"made": made, "backups": await run(svc.backups.all), "folder": "data/backups"}
