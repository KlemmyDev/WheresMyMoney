"""The set-up guide: /api/setup. A checklist done in any order; each step saves through the features' own routes,
and this says which are done. It stays until finished or put off ("Go to your overview")."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter

from app.dependencies import JsonBody, ServicesDep, run

router = APIRouter(prefix="/api/setup")


async def _state(svc: ServicesDep):
    ov = await run(svc.accounts.overview)
    bills = await run(svc.bills.all)
    rules = await run(svc.rules.all)
    settings = await run(svc.settings.all)
    last_checkin = await run(svc.checkins.last)
    imported = await run(svc.imports.history, 1)
    return {
        "done": bool(settings["setup_done"]),
        # Shown to a new household until it's finished or put off, and never once there are accounts from before.
        "show": not settings["setup_done"] and not ov["accounts"],
        "steps": {
            "accounts": len(ov["accounts"]) > 0,
            "loan": ov["loan"] is not None,
            "bills": len(bills) > 0,
            "pay": any(r.kind == "pay" for r in rules),
            "current": bool(settings["setup_done"]),
            "checkin": last_checkin is not None,
            "import": len(imported) > 0,
            "reminders": bool(settings["reminders_set"]),
        },
        "settings": settings,
    }


@router.get("")
async def state(svc: ServicesDep):
    return await _state(svc)


@router.post("/reminders")
async def reminders(svc: ServicesDep, body: JsonBody):
    """The reminders step: {"reminder": "payday", "detail": "statements"}. Ticks it off without finishing the guide."""
    values = {k: body[k] for k in ("reminder", "detail") if k in body}
    await run(svc.settings.update, {**values, "reminders_set": True})
    return await _state(svc)


@router.post("/finish")
async def finish(svc: ServicesDep, body: JsonBody):
    """Finish (or put off) the guide, saving the last step's choices: {"reminder": "payday", "detail": "statements"}."""
    values = {k: body[k] for k in ("reminder", "detail") if k in body}
    await run(svc.settings.update, {**values, "setup_done": True})
    await asyncio.to_thread(svc.spending.seed)
    return await _state(svc)
