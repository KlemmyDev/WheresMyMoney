"""A category looked at closely: its months, timeframe, merchants, weekdays and what's likely next."""

from __future__ import annotations

import datetime as dt

from fastapi.testclient import TestClient

from tests.conftest import TODAY, dollars, ok
from tests.test_spending import cat


def spend(client: TestClient, account: int, day: dt.date, amount: float, what: str, category: int) -> dict:
    return ok(
        client.post(
            "/api/transactions",
            json={
                "account_id": account,
                "amount": -dollars(amount),
                "description": what,
                "category_id": category,
                "date": day.isoformat(),
            },
        )
    )


def test_a_category_by_month_merchant_and_whats_likely(client: TestClient, household: dict) -> None:
    groceries = cat(client, "Groceries")
    today = TODAY
    # A shop every Saturday for 20 weeks, and a top-up at Aldi now and then.
    sat = today - dt.timedelta(days=(today.weekday() - 5) % 7)
    for w in range(20):
        spend(client, household["Spending"], sat - dt.timedelta(weeks=w), 200, "WOOLWORTHS KEPERRA", groceries)
    spend(client, household["Spending"], today - dt.timedelta(days=3), 40, "ALDI STAFFORD", groceries)
    spend(client, household["Spending"], today, 15, "Something else", cat(client, "Coffee"))

    d = ok(client.get(f"/api/categories/{groceries}/insights", params={"months": 1}))
    assert d["name"] == "Groceries" and d["budget"] == dollars(1200)
    assert d["months"][-1]["month"] == "2026-11"
    this = sum(200 for w in range(20) if (sat - dt.timedelta(weeks=w)).month == 11) + 40
    assert d["this_month"] == dollars(this) and d["range"]["spent"] == dollars(this)
    assert d["merchants"][0]["spent"] > d["merchants"][1]["spent"] > 0
    assert d["weekdays"][5] == dollars(this - 40)
    assert all(t["category"] == "Groceries" for t in d["transactions"])
    assert d["average"] > 0 and d["suggested"] is not None

    likely = d["likely"]
    assert likely["ready"]
    assert likely["month_total"] >= d["this_month"]
    assert likely["next"] > 0 and likely["next_low"] <= likely["next"] <= likely["next_high"]
    assert any(h["every_days"] == 7 for h in likely["habits"])

    three = ok(client.get(f"/api/categories/{groceries}/insights", params={"months": 3}))
    # Twenty weeks back don't cover the three months before September, so there's nothing fair to compare with.
    assert three["range"]["start"] == "2026-09-01" and three["range"]["previous"] is None
    assert d["range"]["previous"] is not None  # the start of October is covered


def test_a_split_counts_its_part(client: TestClient, household: dict) -> None:
    groceries, home = cat(client, "Groceries"), cat(client, "Home")
    tx = spend(client, household["Spending"], dt.date(2026, 11, 10), 100, "BIG W", groceries)
    ok(
        client.put(
            f"/api/transactions/{tx['id']}",
            json={
                "splits": [
                    {"category_id": groceries, "amount": dollars(30)},
                    {"category_id": home, "amount": dollars(70)},
                ]
            },
        )
    )
    assert ok(client.get(f"/api/categories/{groceries}/insights"))["this_month"] == dollars(30)
    assert ok(client.get(f"/api/categories/{home}/insights"))["this_month"] == dollars(70)


def test_only_money_out_categories(client: TestClient, household: dict) -> None:
    assert client.get(f"/api/categories/{cat(client, 'Pay')}/insights").status_code == 404
    assert client.get("/api/categories/99999/insights").status_code == 404
