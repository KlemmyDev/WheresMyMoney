"""Early retirement: /api/fire (backend only until the early-retirement pages are built)."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import JsonBody, ServicesDep, run

router = APIRouter(prefix="/api/fire")


@router.get("")
async def overview(svc: ServicesDep):
    """Freedom on today's plan and with the plan, the year-by-year path, the bridge before super opens, where the
    next $100 of pay lands, loan or invest, and the named shocks. Money in cents; ages and years as numbers."""
    return await run(svc.fire.overview)


@router.post("/plan")
async def save_plan(svc: ServicesDep):
    """Make the suggested plan the household's. Returns the saved plan and the rule changes it implies (to offer)."""
    return await run(svc.fire.save_plan)


@router.delete("/plan")
async def unsave_plan(svc: ServicesDep):
    """Undo making it the plan."""
    await run(svc.fire.unsave_plan)
    return {"saved": None}


@router.post("/whatif")
async def what_if(svc: ServicesDep, body: JsonBody):
    """{"levers": {"retire_age": 57, "spend": 8000000, "spare": 100000, "where": "off", "keep": true, ...},
    "target": 52}: the result, the soonest it works, and (with a target) what it would take. Money in cents."""
    levers = body.get("levers") or {}
    for key in ("spend", "spare"):
        if levers.get(key) is not None:
            levers[key] = levers[key] / 100
    return await run(svc.fire.what_if, {**body, "levers": levers})


@router.get("/scenarios")
async def scenarios(svc: ServicesDep):
    return await run(svc.fire.scenarios_saved)


@router.post("/scenarios")
async def save_scenario(svc: ServicesDep, body: JsonBody):
    """{"name": "Retire at 52", "levers": {...}} (money in cents). Returns the saved scenarios."""
    levers = body.get("levers") or {}
    for key in ("spend", "spare"):
        if levers.get(key) is not None:
            levers[key] = levers[key] / 100
    return await run(svc.fire.save_scenario, {**body, "levers": levers})


@router.delete("/scenarios/{scenario_id}")
async def remove_scenario(svc: ServicesDep, scenario_id: int):
    return await run(svc.fire.remove_scenario, scenario_id)


@router.post("/debt")
async def debt_race(svc: ServicesDep, body: JsonBody):
    """{"extra": 50000, "into": "off" | "inv", "rate_change": 0.005}: the race (money in cents)."""
    try:
        extra = float(body.get("extra") or 0) / 100
        rate_change = float(body.get("rate_change") or 0)
    except (TypeError, ValueError):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="Enter an amount.") from None
    return await run(svc.fire.debt_race, extra, str(body.get("into") or "off"), rate_change)


@router.post("/stress")
async def stress(svc: ServicesDep, body: JsonBody):
    """{"shock": "rough" | "inflation" | "spend" | "income" | null}: the plan against bad luck, and the fixes."""
    return await run(svc.fire.stress, body.get("shock") or None)
