"""Retirement: /api/retirement (each person's super, the estimate's settings, and spending now)."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import JsonBody, ServicesDep, run

router = APIRouter(prefix="/api/retirement")


@router.get("")
async def overview(svc: ServicesDep):
    """{"people": [each person's super], "settings": {the levers}, "spending_now": cents a year, ...}"""
    return await run(svc.retirement.overview)


@router.put("/settings")
async def settings(svc: ServicesDep, body: JsonBody):
    """{"retire_age": 60, "spending": 8000000, "extra": 0, "count_etfs": true, "growth": 0.04, "plan_to": 92}"""
    return await run(svc.retirement.save_settings, body)


@router.post("/people")
async def add_person(svc: ServicesDep, body: JsonBody):
    return await run(svc.retirement.save_person, body)


@router.put("/people/{person_id}")
async def update_person(svc: ServicesDep, person_id: int, body: JsonBody):
    return await run(svc.retirement.save_person, body, person_id)


@router.delete("/people/{person_id}")
async def remove_person(svc: ServicesDep, person_id: int):
    return {"removed": await run(svc.retirement.remove_person, person_id)}
