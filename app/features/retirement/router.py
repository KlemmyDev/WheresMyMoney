"""Retirement: /api/retirement (each person's super, the estimate's settings, and spending now)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

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


@router.post("/people/{person_id}/statement")
async def read_statement(svc: ServicesDep, person_id: int, request: Request):
    """Read a super statement (the PDF as the body) for its balance, fees and investment options. Nothing is saved:
    what's found comes back to be checked, then saved with PUT /people/{id}. A statement from a fund whose fees are
    known (by the person's fund, or the statement's own heading) gives the fund's published fees, which grow with the
    balance, in place of the year's dollars; insurance is the statement's."""
    from app.features.retirement import funds, statements

    raw = await request.body()
    person = next((p for p in await run(svc.retirement.people) if p["id"] == person_id), None)
    if person is None:
        raise HTTPException(status_code=404, detail="That person's super has gone.")
    text = await run(statements.read_text, raw)
    found = await run(statements.parse, text)
    fund = funds.find(person["fund"]) or funds.in_statement(text)
    return funds.apply(fund, found) if fund else {**found, "fund": None}
