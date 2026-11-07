"""Balance check-ins: /api/checkins."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.dependencies import JsonBody, ServicesDep, UserDep, run

router = APIRouter(prefix="/api/checkins")


def balances_of(body: dict[str, Any]) -> dict[int, int]:
    """{"balances": {"1": 10005000, ...}} as account id -> cents (blank ones left out)."""
    raw = body.get("balances") or {}
    if not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail="Send the balances as {account id: cents}.")
    out: dict[int, int] = {}
    for k, v in raw.items():
        if v in (None, ""):
            continue
        try:
            out[int(k)] = int(v)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Each balance should be an amount in cents.") from None
    return out


@router.get("")
async def prepare(svc: ServicesDep):
    """The check-in form: each account's last balance and what the rules say it should hold now."""
    return await run(svc.checkins.prepare)


@router.post("/check")
async def check(svc: ServicesDep, body: JsonBody):
    """What a check-in with these balances would say, without saving it."""
    return await run(svc.checkins.check, balances_of(body), bool(body.get("exact")))


@router.post("")
async def save(svc: ServicesDep, body: JsonBody, user: UserDep):
    """Save a check-in: {"balances": {...}, "exact": false}."""
    return await run(svc.checkins.save, balances_of(body), bool(body.get("exact")), user.id if user else None)


@router.get("/history")
async def history(svc: ServicesDep):
    return await run(svc.checkins.history)


@router.post("/flags/{flag_id}")
async def act(svc: ServicesDep, flag_id: int, body: JsonBody):
    """Deal with a flag: {"action": "snooze" | "skip" | "resolve"}."""
    return {"flags": await run(svc.checkins.act, flag_id, str(body.get("action") or ""))}
