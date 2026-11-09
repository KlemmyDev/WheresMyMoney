"""Bills: /api/bills."""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter

from app.core import dates
from app.dependencies import JsonBody, ServicesDep, UserDep, run

router = APIRouter(prefix="/api/bills")


async def _overview(svc: ServicesDep):
    ov = await run(svc.accounts.overview)
    acct = next((a for a in ov["accounts"] if a["role"] == "bills"), None)
    out = await run(svc.bills.overview, acct)
    # What the rules move into the bills account in a usual month, to set against what the bills come to.
    if acct:
        rules = await run(svc.rules.all)
        into = [r for r in rules if r.enabled and r.kind == "transfer" and r.to_account == acct["id"]]
        out["into_account"] = round(sum(r.amount * dates.PER_YEAR[r.every] / 12 for r in into))
        out["before_pay"] = await run(_before_pay, svc, acct, into)
    return out


def _before_pay(svc: ServicesDep, acct: dict, into: list) -> dict | None:
    """What's due from the bills account before money next comes in (the next run of a rule moving money into it,
    after today): the bills still to pay until then (late ones from the last fortnight included), what they come to, and whether the balance covers them."""
    today = dates.today()
    tomorrow = today + dt.timedelta(days=1)
    if not into:
        return None
    pay = min(r.next_run(tomorrow) for r in into)
    moves_in = sum(r.amount for r in into if r.next_run(tomorrow) == pay)
    items = [d for d in svc.bills.due(today - dt.timedelta(days=14), pay - dt.timedelta(days=1)) if d["paid"] is None]
    total = sum(int(d["amount"]) for d in items)
    balance = int(acct.get("balance") or 0)
    return {
        "pay_day": pay.isoformat(),
        "moves_in": moves_in,
        "items": items,
        "total": total,
        "covered": balance >= total,
        "leaves": balance - total,
    }


@router.get("")
async def overview(svc: ServicesDep):
    """Every bill, what they come to a month and a year, the next 30 days, the months ahead, and the bills account."""
    return await _overview(svc)


@router.post("")
async def add(svc: ServicesDep, body: JsonBody):
    """{"name": "Internet", "amount": 8900, "every": "monthly", "next_due": "2026-11-12", "account_id": 2,
    "how": "auto"}. With "transaction_id", that payment (and the same merchant's others like it) become part of the
    new bill. The overview comes back with the new bill as "added" and how many payments were "linked"."""
    bill = await run(svc.bills.add, body)
    linked = 0
    if body.get("transaction_id") not in (None, ""):
        linked = await run(svc.bills.link, bill.id, int(body["transaction_id"]))
    return {**(await _overview(svc)), "added": bill.view(), "linked": linked}


@router.get("/spotted")
async def spotted(svc: ServicesDep):
    """Bills spotted in the imported statements (regular payments to the same merchant) and bills whose price has
    moved: {"suggestions": [...], "updates": [...]}."""
    return await run(svc.bills.spotted)


@router.post("/spotted/accept")
async def accept(svc: ServicesDep, body: JsonBody):
    """Add a spotted bill: {"key": "NETFLIX|monthly|3", "changes": {"name": "Netflix"}}."""
    await run(svc.bills.accept, str(body.get("key") or ""), body.get("changes") or {})
    return await _overview(svc)


@router.post("/spotted/dismiss")
async def dismiss(svc: ServicesDep, body: JsonBody):
    """Stop suggesting a spotted bill or an update: {"key": "..."}."""
    await run(svc.bills.dismiss, body.get("key"))
    return {"dismissed": True}


@router.get("/{bill_id}/candidates")
async def candidates(svc: ServicesDep, bill_id: int):
    """Payments not part of any bill that look like this one (how it shows up, about its amount), newest first."""
    return await run(svc.bills.candidates, bill_id)


@router.post("/{bill_id}/link")
async def link(svc: ServicesDep, bill_id: int, body: JsonBody):
    """Make payments part of this bill: {"transaction_ids": [12, 15]} exactly those, or {"transaction_id": 12} that
    one and the payments that look the same. Learns how the bill shows up for later imports."""
    if body.get("transaction_ids") is not None:
        linked = await run(svc.bills.link_many, bill_id, [int(i) for i in body.get("transaction_ids") or []])
    else:
        linked = await run(svc.bills.link, bill_id, int(body.get("transaction_id") or 0))
    return {"linked": linked}


@router.post("/{bill_id}/pay")
async def pay(svc: ServicesDep, bill_id: int, body: JsonBody, user: UserDep):
    """Mark it paid by hand: {"amount": 21500, "date": "2026-11-10"}, both optional (its amount, today). Undo with
    DELETE /api/transactions/{transaction_id}."""
    amount = body.get("amount")
    return await run(
        svc.bills.pay,
        bill_id,
        int(amount) if amount not in (None, "") else None,
        str(body["date"]) if body.get("date") else None,
        user.id if user else None,
    )


@router.get("/{bill_id}")
async def detail(svc: ServicesDep, bill_id: int):
    """One bill: its payments, what they add up to, its price changes and what's ahead, with the payments as
    transactions (newest first) to open."""
    d = await run(svc.bills.detail, bill_id)
    ids = [int(p["id"]) for p in d["payments"]]
    d["transactions"] = await run(svc.spending.transactions, None, None, None, max(len(ids), 1), ids) if ids else []
    d["due"] = await run(svc.bills.due_now, bill_id)
    return d


@router.put("/{bill_id}")
async def update(svc: ServicesDep, bill_id: int, body: JsonBody):
    await run(svc.bills.update, bill_id, body)
    return await _overview(svc)


@router.post("/{bill_id}/restore")
async def restore(svc: ServicesDep, bill_id: int):
    """Undo removing a bill."""
    await run(svc.bills.restore, bill_id)
    return await _overview(svc)


@router.delete("/{bill_id}")
async def remove(svc: ServicesDep, bill_id: int):
    await run(svc.bills.remove, bill_id)
    return await _overview(svc)
