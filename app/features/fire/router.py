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


@router.get("/track")
async def track(svc: ServicesDep):
    """Are we on track: the goal, today's pace, each year's need for super, outside super and the loan, today's
    three parts and what would close the gap. Money in cents."""
    return await run(svc.fire.on_track)


@router.post("/track")
async def track_try(svc: ServicesDep, body: JsonBody):
    """The same with other levers tried, nothing saved: {"goal": 55, "spend": cents, "extra_super": cents a month,
    "extra_etfs": ..., "extra_loan": ..., "keep": true, "supers": {name: cents}, "etfs": cents, "loan": cents}."""
    return await run(svc.fire.on_track, body)


@router.put("/goal")
async def save_goal(svc: ServicesDep, body: JsonBody):
    """Set the goal: {"age": 55, "spend": cents a year, "plan_to": 92}. Returns the on-track answer."""
    return await run(svc.fire.save_goal, body)


@router.put("/extras")
async def save_extras(svc: ServicesDep, body: JsonBody):
    """Make extra a month part of the plan (Close the gap): {"extra_super": cents, "extra_etfs": cents,
    "extra_loan": cents}. Returns {"was": ..., "track": ...}; PUT "was" back to undo."""
    return await run(svc.fire.save_extras, body)


@router.get("/checkpoint")
async def checkpoint(svc: ServicesDep):
    """Today's checkpoint: where each part is against its need now, and against the last check-in."""
    return await run(svc.fire.checkpoint)


@router.post("/checkpoint")
async def checkpoint_save(svc: ServicesDep, body: JsonBody):
    """{"save": true}: record today's checkpoint for next time (after updating any balances)."""
    return await run(svc.fire.checkpoint, body)


@router.get("/sensitivity")
async def sensitivity(svc: ServicesDep):
    """How sure is the date: the earliest age to stop, and with each guess changed one at a time."""
    return await run(svc.fire.sensitivity)


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


@router.post("/drawdown")
async def drawdown(svc: ServicesDep, body: JsonBody):
    """{"buffer_years": 1, "pension": false}: once stopped, which pot pays each year, and how long it lasts."""
    try:
        years = float(body.get("buffer_years") or 0)
    except (TypeError, ValueError):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="Enter a number of years.") from None
    return await run(svc.fire.drawdown, years, bool(body.get("pension")))


@router.post("/assume")
async def assume(svc: ServicesDep, body: JsonBody):
    """{"super_return": 0.07, "super_fee": 0.006, "inflation": 0.03, "plan_to": 92}: the dates with these guesses."""
    return await run(svc.fire.assume, body)


@router.post("/goal")
async def goal(svc: ServicesDep, body: JsonBody):
    """{"spend": 8000000, "supers": {"Alex": 18640000}}: Set your goal's dates as you answer, before saving."""
    return await run(svc.fire.goal, body)
