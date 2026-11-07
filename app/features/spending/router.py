"""Spending, categories, merchant rules and transactions: /api/spending, /api/categories, /api/transactions."""

from __future__ import annotations

from fastapi import APIRouter

from app.dependencies import JsonBody, ServicesDep, UserDep, run

router = APIRouter(prefix="/api")


@router.get("/spending")
async def month(svc: ServicesDep):
    """This spending month: what's left, safe to spend, the pace, by category and by day, and recent spending."""
    result = await run(svc.dashboard.spending_month)
    recent = []
    if result:
        recent = await run(svc.spending.transactions, result["account_id"], result["start"], None, 30)
    return {"month": result, "recent": recent, "categories": await run(svc.spending.categories)}


@router.get("/categories")
async def categories(svc: ServicesDep):
    return {
        "categories": await run(svc.spending.categories),
        "merchant_rules": await run(svc.spending.merchant_rules),
    }


@router.post("/categories")
async def add_category(svc: ServicesDep, body: JsonBody):
    return await run(svc.spending.save_category, body)


@router.put("/categories/{category_id}")
async def update_category(svc: ServicesDep, category_id: int, body: JsonBody):
    return await run(svc.spending.save_category, body, category_id)


@router.delete("/categories/{category_id}")
async def remove_category(svc: ServicesDep, category_id: int):
    return {"removed": await run(svc.spending.remove_category, category_id)}


@router.delete("/merchant-rules/{rule_id}")
async def remove_merchant_rule(svc: ServicesDep, rule_id: int):
    return {"removed": await run(svc.spending.remove_merchant_rule, rule_id)}


@router.get("/transactions")
async def transactions(
    svc: ServicesDep,
    account_id: int | None = None,
    start: str | None = None,
    end: str | None = None,
    q: str | None = None,
    limit: int = 200,
):
    return await run(svc.spending.transactions, account_id, start, end, min(max(limit, 1), 2000), None, q)


@router.post("/transactions")
async def add(svc: ServicesDep, body: JsonBody, user: UserDep):
    """Spending typed in: {"amount": -6480, "description": "Woolworths", "account_id": 3, "category_id": 1,
    "cash": false, "note": ""}."""
    return await run(svc.spending.add, body, user.id if user else None)


@router.put("/transactions/{tx_id}")
async def update(svc: ServicesDep, tx_id: int, body: JsonBody):
    """Change its category ({"category_id": 1, "always": true} remembers it for the merchant) or note."""
    return await run(svc.spending.update_transaction, tx_id, body)


@router.delete("/transactions/{tx_id}")
async def remove(svc: ServicesDep, tx_id: int):
    return {"removed": await run(svc.spending.remove_transaction, tx_id)}
