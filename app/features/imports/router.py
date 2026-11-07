"""Statement imports: /api/imports. The file is the request's body (no multipart form), its name in `filename`."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request

from app.dependencies import JsonBody, ServicesDep, UserDep, run
from app.features.imports.statement import MAX_BYTES, StatementError

router = APIRouter(prefix="/api/imports")


@router.post("")
async def open_file(request: Request, svc: ServicesDep, user: UserDep, filename: str = "", columns: str = ""):
    """Read a statement. With `columns` (JSON: {"date": 0, "description": 1, "amount": 2, "balance": 3}) for a bank
    whose columns aren't known yet."""
    raw = await request.body()
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="That file is too big for a statement (5 MB at most).")
    try:
        cols = json.loads(columns) if columns else None
    except ValueError:
        raise HTTPException(status_code=422, detail="The columns aren't readable.") from None
    try:
        return await run(svc.imports.open, filename or "statement.csv", raw, user.id if user else None, cols)
    except HTTPException:
        raise
    except StatementError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.get("")
async def history(svc: ServicesDep):
    return await run(svc.imports.history)


@router.post("/{token}/analyse")
async def analyse(svc: ServicesDep, token: str, body: JsonBody):
    """What importing it into an account would do: {"account_id": 3}."""
    try:
        account_id = int(body.get("account_id"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Choose which account the statement is from.") from None
    return await run(svc.imports.analyse, token, account_id)


@router.post("/{token}/commit")
async def commit(svc: ServicesDep, token: str, body: JsonBody):
    """Import it: {"account_id": 3, "categories": {"12": 4}, "always": [12], "opening": false}."""
    try:
        account_id = int(body.get("account_id"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Choose which account the statement is from.") from None
    return await run(svc.imports.commit, token, account_id, body)
