"""Settings → Notifications: what's reported, the devices turned on (with a test send), and what was sent. Everything
goes out as web push through the service worker."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from app.dependencies import JsonBody, ServicesDep
from app.features.notifications.message import DeliveryError

router = APIRouter(prefix="/api/notifications")


async def _run(fn: Any, *args: Any) -> Any:
    try:
        return await asyncio.to_thread(fn, *args)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except DeliveryError as e:
        raise HTTPException(status_code=502, detail=f"The test didn't go through: {e}") from e


@router.get("")
async def overview(svc: ServicesDep):
    """The rules and their numbers, the devices turned on, options and recent history."""
    return await _run(svc.notifications.view)


@router.put("/rules/{rule}")
async def save_rule(svc: ServicesDep, rule: str, body: JsonBody):
    """Turn one on or off, or set its numbers: {"enabled": true, "values": {"days": 2}}."""
    await _run(svc.notifications.save_rule, rule, body)
    return await _run(svc.notifications.view)


@router.put("/options")
async def save_options(svc: ServicesDep, body: JsonBody):
    """Quiet hours and the day's limit: {"quiet": {"enabled": true, "start": "22:00", "end": "07:00"}, "daily_cap": 20}."""
    await _run(svc.notifications.save_options, body)
    return await _run(svc.notifications.view)


@router.post("/test")
async def test(svc: ServicesDep, body: JsonBody):
    """Send a test: {"target": "push"} (every device) or a device's id."""
    target = str(body.get("target") or "push")
    result = await _run(svc.notifications.test, target)
    return {**result, **(await _run(svc.notifications.view))}


@router.get("/push")
async def push(svc: ServicesDep):
    """The server's public key, which a browser subscribes with."""
    return {"public_key": svc.notifications.push.keys().public}


@router.post("/push/devices")
async def subscribe(svc: ServicesDep, body: JsonBody):
    """Turn notifications on for a browser: {"subscription": PushSubscription.toJSON(), "name": "Chrome on Mac"}."""
    return await _run(svc.notifications.push.subscribe, body)


@router.delete("/push/devices/{device}")
async def unsubscribe(svc: ServicesDep, device: str):
    return {"removed": await _run(svc.notifications.push.remove, device)}
