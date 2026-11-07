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
