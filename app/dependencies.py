"""FastAPI dependencies shared by every router."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import Body, Depends, HTTPException, Request

from app.container import Services
from app.features.auth.service import COOKIE, User


def get_services(request: Request) -> Services:
    services: Services = request.app.state.services
    return services


ServicesDep = Annotated[Services, Depends(get_services)]
# A required JSON object body, validated by the feature itself (so errors keep their readable messages).
JsonBody = Annotated[dict[str, Any], Body()]


async def current_user(request: Request, svc: ServicesDep) -> User | None:
    """Who's signed in (None with sign-in turned off): who added a transaction or saved a check-in."""
    if not svc.auth.enabled:
        return None
    return await asyncio.to_thread(svc.auth.session_user, request.cookies.get(COOKIE))


UserDep = Annotated[User | None, Depends(current_user)]


async def run[T](fn: Callable[..., T], *args: Any) -> T:
    """Run a blocking service call in a thread, its ValueError as a 422 and LookupError as a 404 (both in words)."""
    try:
        return await asyncio.to_thread(fn, *args)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e).strip("'\"")) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


async def run_async[T](fn: Callable[..., Awaitable[T]], *args: Any) -> T:
    try:
        return await fn(*args)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e).strip("'\"")) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
