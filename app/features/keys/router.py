"""Making and removing API keys (signed in only), and the /api/v1 that a key opens.

/api/v1 sits outside the app's sign-in (see AuthMiddleware.OPEN): an app has no session cookie, so each route asks for
a key instead, and one with the permission the route needs. Every route only reads, but one: sending a check-in, with
`checkin:write`.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse

from app.dependencies import JsonBody, ServicesDep, run
from app.features.checkins.router import balances_of
from app.features.keys.service import DEFAULT_SCOPES, SCOPES, ApiKey

router = APIRouter(prefix="/api")
v1 = APIRouter(prefix="/api/v1")


# --- making and removing keys (the app's own, so behind its sign-in)


@router.get("/keys")
async def list_keys(svc: ServicesDep):
    """The keys made so far (never the keys themselves), and the permissions a key can be given."""
    keys = await asyncio.to_thread(svc.keys.all)
    return {
        "keys": [k.public() for k in keys],
        "scopes": [{"id": s, "name": n, "about": a, "default": s in DEFAULT_SCOPES} for s, (n, a) in SCOPES.items()],
    }


@router.post("/keys")
async def make_key(svc: ServicesDep, body: JsonBody):
    """Make a key. The whole key is in this answer only: it can't be shown again."""
    scopes = body.get("scopes")
    if scopes is not None and not (isinstance(scopes, list) and all(isinstance(s, str) for s in scopes)):
        raise HTTPException(status_code=422, detail="Permissions should be a list.")
    try:
        made, key = await asyncio.to_thread(svc.keys.make, str(body.get("name") or ""), scopes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return JSONResponse({**made.public(), "key": key}, headers={"Cache-Control": "no-store"})


@router.delete("/keys/{key_id}")
async def remove_key(svc: ServicesDep, key_id: str):
    if not await asyncio.to_thread(svc.keys.remove, key_id):
        raise HTTPException(status_code=404, detail="That key has gone already.")
    return {"ok": True}


# --- the API a key opens


def _key(svc: ServicesDep, authorization: Annotated[str | None, Header()] = None) -> ApiKey:
    word, _, token = (authorization or "").partition(" ")
    found = svc.keys.check(token.strip()) if word.lower() == "bearer" else None
    if found is None:
        raise HTTPException(
            status_code=401,
            detail="Send a key as: Authorization: Bearer wmm_...",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return found


KeyDep = Annotated[ApiKey, Depends(_key)]


def scoped(scope: str) -> Callable[[ApiKey], ApiKey]:
    """A route's check that the key has `scope`."""

    def check(key: KeyDep) -> ApiKey:
        if scope not in key.scopes:
            raise HTTPException(
                status_code=403,
                detail=f"This key can't use {SCOPES[scope][0].lower()}. Make a key with that permission.",
            )
        return key

    return check


@v1.get("/ping")
async def ping(svc: ServicesDep, key: KeyDep):
    """Who the key is and what it may do."""
    return {
        "app": "WheresMyMoney",
        "household": svc.settings.get("household"),
        "key": {"name": key.name, "scopes": list(key.scopes)},
        "now": int(time.time()),
    }


@v1.get("/accounts")
async def accounts(svc: ServicesDep, key: Annotated[ApiKey, Depends(scoped("accounts:read"))]):
    """Each account (balance, role, target), the offsetting total, and the latest check-in."""
    ov = await run(svc.accounts.overview)
    keep = ("id", "name", "role", "colour", "last4", "balance", "offsets_loan", "target", "change_30d", "known")
    return {
        "accounts": [{k: a[k] for k in keep} for a in ov["accounts"]],
        "offsetting": ov["offsetting"],
        "total": ov["total"],
        "last_checkin": await run(svc.checkins.last),
        "goals": ov["goals"],
    }


@v1.get("/bills")
async def bills(svc: ServicesDep, key: Annotated[ApiKey, Depends(scoped("bills:read"))]):
    ov = await run(svc.accounts.overview)
    acct = next((a for a in ov["accounts"] if a["role"] == "bills"), None)
    return await run(svc.bills.overview, acct)


@v1.get("/spending")
async def spending(svc: ServicesDep, key: Annotated[ApiKey, Depends(scoped("spending:read"))]):
    return {"month": await run(svc.dashboard.spending_month)}


@v1.get("/loan")
async def loan(svc: ServicesDep, key: Annotated[ApiKey, Depends(scoped("loan:read"))]):
    ov = await run(svc.accounts.overview)
    recent, planned = await run(svc.dashboard.growth, ov)
    view = await run(svc.accounts.loan_view, recent, planned)
    if view:
        view = {k: v for k, v in view.items() if k not in ("recent", "planned")} | {
            "fully_offset": view["recent"]["date"],
            "fully_offset_planned": view["planned"]["date"],
        }
    return {"loan": view}


@v1.get("/retirement")
async def retirement(svc: ServicesDep, key: Annotated[ApiKey, Depends(scoped("retirement:read"))]):
    """The retirement plan (coming in a later version: empty until then)."""
    return {"plan": None}


@v1.get("/checkin")
async def checkin_form(svc: ServicesDep, key: Annotated[ApiKey, Depends(scoped("checkin:write"))]):
    """What a check-in expects of each account now."""
    return await run(svc.checkins.prepare)


@v1.post("/checkin")
async def checkin(svc: ServicesDep, body: JsonBody, key: Annotated[ApiKey, Depends(scoped("checkin:write"))]):
    """Send a rough check-in: {"balances": {"1": 10005000}}. Never exact, so it never adds an adjustment."""
    return await run(svc.checkins.save, balances_of(body), False, None)


__all__ = ["router", "v1"]
