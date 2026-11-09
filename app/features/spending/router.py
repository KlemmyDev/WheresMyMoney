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


@router.get("/categories/suggestions")
async def budget_suggestions(svc: ServicesDep):
    """A budget for each spending category from the last six whole months on the spending accounts, and the
    budgets that don't match what's spent: {"months": 6, "from": "2026-05-01", "categories": [...]}."""
    ov = await run(svc.accounts.overview)
    spend = [a["id"] for a in ov["accounts"] if a["role"] == "spending"]
    return await run(svc.spending.budget_suggestions, spend)


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


@router.post("/transactions/sort")
async def sort_many(svc: ServicesDep, body: JsonBody):
    """Sort several at once: {"ids": [4, 9], "category_id": 2, "always": true} (always remembers their merchants).
    Returns how many were sorted and an `undo` to send to /transactions/sort/undo."""
    return await run(svc.spending.sort_many, body.get("ids") or [], body.get("category_id"), bool(body.get("always")))


@router.post("/transactions/sort/undo")
async def unsort_many(svc: ServicesDep, body: JsonBody):
    """Undo sorting several at once: send back the `undo` that POST /transactions/sort returned."""
    return await run(svc.spending.unsort_many, body.get("undo"))


@router.put("/transactions/{tx_id}")
async def update(svc: ServicesDep, tx_id: int, body: JsonBody):
    """Change its category ({"category_id": 1, "always": true} remembers it for the merchant) or note."""
    return await run(svc.spending.update_transaction, tx_id, body)


@router.delete("/transactions/{tx_id}")
async def remove(svc: ServicesDep, tx_id: int):
    return {"removed": await run(svc.spending.remove_transaction, tx_id)}


@router.get("/merchants")
async def merchants(svc: ServicesDep, all: bool = False, limit: int = 200):
    """Transactions grouped by merchant, the ones with something to sort first (all=true for every merchant)."""
    return await run(svc.spending.merchant_groups, not all, min(max(limit, 1), 1000))


@router.get("/merchants/directory")
async def merchant_directory(svc: ServicesDep):
    """Every merchant with money out: the last year by month, the most spent at first."""
    return await run(svc.spending.merchant_directory)


@router.post("/merchants/assign")
async def assign_merchant(svc: ServicesDep, body: JsonBody):
    """Map a statement name to a merchant: {"text": "DOMINOS KEPERRA", "key": "DOMINOS"} or {"text", "name": "New"}.
    For a payment that doesn't say who it was to (BPAY): {"transaction_id": 9, "scope": "this" | "amount", "key"}."""
    return await run(svc.spending.assign_merchant, body)


@router.post("/merchants/merge")
async def merge_merchants(svc: ServicesDep, body: JsonBody):
    """Fold merchants into one: {"from": ["STAGE 1", "STAGE 2"], "into": "LA VIDA"} or {"from": [...], "name": "New"}."""
    return await run(svc.spending.merge_merchants, body)


@router.post("/merchants/unmerge")
async def unmerge_merchant(svc: ServicesDep, body: JsonBody):
    """Undo what was put into a merchant by hand: {"key": "LA VIDA POOLS"}."""
    return await run(svc.spending.unmerge_merchant, str(body.get("key") or ""))


@router.get("/businesses")
async def businesses(svc: ServicesDep):
    """The businesses the app knows (key, name, usual category), for picking when naming a merchant."""
    return await run(svc.spending.businesses)


@router.post("/merchants/sort/undo")
async def unsort_merchant(svc: ServicesDep, body: JsonBody):
    """Undo sorting a merchant: send back the `undo` that POST /merchants/sort returned."""
    return await run(svc.spending.unsort_merchant, body.get("undo"))


@router.post("/merchants/forget")
async def forget_merchant(svc: ServicesDep, body: JsonBody):
    """Undo a mapping: {"text": "DOMINOS KEPERRA"} goes back to the merchant it gets by itself."""
    return await run(svc.spending.forget_merchant, str(body.get("text") or ""), body.get("amount"))


@router.get("/merchants/suggestions")
async def merge_suggestions(svc: ServicesDep):
    """Merchants that look like the same place under different names, each with the one to merge into."""
    return await run(svc.spending.merge_suggestions)


@router.post("/merchants/suggestions/dismiss")
async def dismiss_merge_suggestion(svc: ServicesDep, body: JsonBody):
    """They aren't the same: {"keys": ["BUNNINGS KEPERRA", "BUNNINGS WAREHOUSE"]} isn't suggested again."""
    return await run(svc.spending.dismiss_merge_suggestion, [str(k) for k in body.get("keys") or []])


@router.get("/merchants/directory/{key:path}")
async def merchant_detail(svc: ServicesDep, key: str):
    """One merchant: its months, the statement names mapped to it, and its transactions."""
    return await run(svc.spending.merchant_detail, key)


@router.put("/merchants/settings/{key:path}")
async def merchant_settings(svc: ServicesDep, key: str, body: JsonBody):
    """A merchant's sorting: {"category_id": 4, "rules": [{"over": true, "amount": 3000, "category_id": 7}]}. Its
    transactions not sorted by hand are re-sorted."""
    return await run(svc.spending.save_merchant_settings, key, body)


@router.put("/merchants/directory/{key:path}")
async def rename_merchant(svc: ServicesDep, key: str, body: JsonBody):
    """Give a merchant a name: {"name": "Domino's"} (empty goes back to the one it gets by itself)."""
    return await run(svc.spending.rename_merchant, key, str(body.get("name") or ""))


@router.post("/merchants/sort")
async def sort_merchant(svc: ServicesDep, body: JsonBody):
    """Remember a merchant's category and sort its transactions: {"transaction_id": 12, "category_id": 3}."""
    return await run(svc.spending.sort_merchant, body.get("transaction_id"), body.get("category_id"))


@router.get("/categories/{category_id}/insights")
async def category_insights(svc: ServicesDep, category_id: int, months: int = 3):
    """One category: its months, this month's likely finish and next month's, its merchants, weekdays and regular
    payments, and its transactions over the timeframe (months=1 this month, or 3, 6, 12 with this one)."""
    return await run(svc.spending.category_insights, category_id, months)
