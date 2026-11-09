"""Accounts and the home loan: /api/accounts, /api/loan, /api/goals."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import JsonBody, ServicesDep, UserDep, run

router = APIRouter(prefix="/api")


@router.get("/accounts")
async def overview(svc: ServicesDep):
    """Every account with its balance, ledger, target and how it's tracking; the loan; the offsetting total."""
    return await run(svc.accounts.overview)


@router.post("/accounts")
async def add(svc: ServicesDep, body: JsonBody, user: UserDep):
    """Add an account: {"name": "Offset", "role": "offset", "last4": "2210", "balance": 9460000}; or the loan, with
    "kind": "loan", "rate_bp", "repayment" and "repay_from"."""
    return await run(svc.accounts.add, body, user.id if user else None)


@router.get("/accounts/archived")
async def archived(svc: ServicesDep):
    """The accounts that were removed, to bring back."""
    return await run(svc.accounts.archived)


@router.post("/accounts/{account_id}/restore")
async def restore(svc: ServicesDep, account_id: int):
    """Bring a removed account back, with its history."""
    return await run(svc.accounts.restore, account_id)


@router.get("/accounts/{account_id}")
async def one(svc: ServicesDep, account_id: int):
    account = await run(svc.accounts.view, account_id)
    history = await run(svc.accounts.history, account_id, 180)
    if account["kind"] == "loan":
        return {**account, "history": history, "changes": await run(svc.accounts.loan_changes, account_id)}
    return {**account, "history": history}


@router.get("/accounts/{account_id}/activity")
async def activity(svc: ServicesDep, account_id: int, days: int = 365):
    """Up to a year a day at a time: {"start", "end", "estimated", "days": [{"date", "balance", "in", "out"}]}. The
    loan is estimated (interest and repayments) until one of its statements is imported."""
    return await run(svc.accounts.activity, account_id, days)


@router.put("/accounts/{account_id}")
async def update(svc: ServicesDep, account_id: int, body: JsonBody):
    return await run(svc.accounts.update, account_id, body)


@router.delete("/accounts/{account_id}")
async def archive(svc: ServicesDep, account_id: int):
    """Archive an account: it's hidden, with its history kept."""
    return {"archived": await run(svc.accounts.archive, account_id)}


@router.put("/accounts/{account_id}/balance")
async def set_balance(svc: ServicesDep, account_id: int, body: JsonBody, user: UserDep):
    """Set the balance: {"balance": 2285000, "exact": true, "when": "opening"}. An exact one adds a balance
    adjustment for the difference from the ledger, dated today or as an opening balance."""
    try:
        balance = int(body.get("balance"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        balance = None
    if balance is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="Enter the balance.")
    return await run(
        svc.accounts.set_balance,
        account_id,
        balance,
        bool(body.get("exact")),
        str(body.get("when") or "today"),
        user.id if user else None,
    )


@router.post("/accounts/{account_id}/opening")
async def add_opening(svc: ServicesDep, account_id: int, body: JsonBody, user: UserDep):
    """Add to the opening balance: {"amount": 29275} (the gap an import showed)."""
    try:
        amount = int(body.get("amount"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="Enter the amount.") from None
    return await run(svc.accounts.add_opening, account_id, amount, user.id if user else None)


@router.get("/loan")
async def loan(svc: ServicesDep):
    ov = await run(svc.accounts.overview)
    recent, planned = await run(svc.dashboard.growth, ov)
    return await run(svc.accounts.loan_view, recent, planned)


@router.post("/goals")
async def add_goal(svc: ServicesDep, body: JsonBody):
    return await run(svc.accounts.save_goal, body)


@router.put("/goals/{goal_id}")
async def update_goal(svc: ServicesDep, goal_id: int, body: JsonBody):
    return await run(svc.accounts.save_goal, body, goal_id)


@router.delete("/goals/{goal_id}")
async def remove_goal(svc: ServicesDep, goal_id: int):
    return {"removed": await run(svc.accounts.remove_goal, goal_id)}


@router.post("/goals/{goal_id}/restore")
async def restore_goal(svc: ServicesDep, goal_id: int):
    """Undo removing a goal."""
    return await run(svc.accounts.restore_goal, goal_id)


@router.post("/goals/{goal_id}/reached")
async def reach_goal(svc: ServicesDep, goal_id: int, body: JsonBody):
    """The goal is reached: {"outcome": "kept" | "spent" | "offset"}; {"outcome": null} undoes it."""
    outcome = body.get("outcome")
    return await run(svc.accounts.reach_goal, goal_id, str(outcome) if outcome else None)


@router.post("/goals/{goal_id}/top_up")
async def top_up_goal(svc: ServicesDep, goal_id: int, body: JsonBody):
    """Add to what a goal has saved: {"amount": 10000}; with "moved": false it's planned, counted once moved."""
    try:
        amount = int(body.get("amount"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="Enter how much.") from None
    return await run(svc.accounts.top_up_goal, goal_id, amount, body.get("moved", True) is not False)


@router.post("/goals/moves/{move_id}")
async def settle_move(svc: ServicesDep, move_id: int, body: JsonBody):
    """A planned top-up: {"moved": true} once it's moved, {"moved": false} if it isn't happening."""
    return await run(svc.accounts.settle_move, move_id, bool(body.get("moved")))


@router.post("/loan/change")
async def change_loan(svc: ServicesDep, body: JsonBody):
    """Change the loan: the repayment, a lump sum paid in, or a refinance (see the service). Returns the loan and an
    `undo` to send to /loan/change/undo."""
    return await run(svc.accounts.change_loan, body)


@router.post("/loan/change/undo")
async def undo_loan_change(svc: ServicesDep, body: JsonBody):
    return await run(svc.accounts.undo_loan_change, body.get("undo"))


@router.post("/loan/rate")
async def change_rate(svc: ServicesDep, body: JsonBody):
    """The rate changed: {"rate_bp": 637, "repayment": 324000, "since": "2026-11-01"}. The repayment is optional."""
    try:
        rate_bp = int(body.get("rate_bp"))  # type: ignore[arg-type]
        repayment = int(body["repayment"]) if body.get("repayment") not in (None, "") else None
    except (TypeError, ValueError):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="Enter the new rate.") from None
    since = str(body.get("since") or "")
    return await run(svc.accounts.change_rate, rate_bp, repayment, since)
