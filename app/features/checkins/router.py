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


def skipped_of(body: dict[str, Any]) -> frozenset[str]:
    """{"skipped": ["4:2026-10-31", ...]}: the moves (from the check-in form) that didn't happen this time."""
    raw = body.get("skipped") or []
    if not isinstance(raw, list) or not all(isinstance(k, str) for k in raw):
        raise HTTPException(status_code=422, detail="Send the skipped moves as a list of their keys.")
    return frozenset(raw)


@router.get("")
async def prepare(svc: ServicesDep):
    """The check-in form: each account's last balance and what the rules say it should hold now."""
    return await run(svc.checkins.prepare)


@router.post("/check")
async def check(svc: ServicesDep, body: JsonBody):
    """What a check-in with these balances would say, without saving it."""
    return await run(svc.checkins.check, balances_of(body), bool(body.get("exact")), skipped_of(body))


@router.post("")
async def save(svc: ServicesDep, body: JsonBody, user: UserDep):
    """Save a check-in: {"balances": {...}, "exact": false, "skipped": [move keys]}."""
    return await run(
        svc.checkins.save, balances_of(body), bool(body.get("exact")), user.id if user else None, skipped_of(body)
    )


@router.delete("/{checkin_id}")
async def undo(svc: ServicesDep, checkin_id: int):
    """Take back the latest check-in (the Undo on its toast)."""
    await run(svc.checkins.undo, checkin_id)
    return {"ok": True}


@router.get("/history")
async def history(svc: ServicesDep):
    return await run(svc.checkins.history)


@router.post("/flags/{flag_id}")
async def act(svc: ServicesDep, flag_id: int, body: JsonBody):
    """Deal with a flag: {"action": "snooze" | "skip" | "resolve"}."""
    return {"flags": await run(svc.checkins.act, flag_id, str(body.get("action") or ""))}
