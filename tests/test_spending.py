"""The spending month: top-up to top-up, the pace, safe to spend, budgets by category, and learned categories."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok


def cat(client: TestClient, name: str) -> int:
    return next(c["id"] for c in ok(client.get("/api/categories"))["categories"] if c["name"] == name)


def test_the_month_runs_from_top_up_to_top_up(client: TestClient, household: dict) -> None:
    m = ok(client.get("/api/spending"))["month"]
    assert m["start"] == "2026-10-25" and m["end"] == "2026-11-24" and m["days"] == 31 and m["day"] == 19


def test_pace_and_safe_to_spend(client: TestClient, household: dict) -> None:
    ids = household
    ok(
        client.post(
            "/api/transactions",
            json={
                "account_id": ids["Spending"],
                "amount": -dollars(500),
                "description": "Woolworths",
                "category_id": cat(client, "Groceries"),
                "date": "2026-11-01",
            },
        )
    )
    m = ok(client.get("/api/spending"))["month"]
    assert m["spent"] == dollars(500) and m["left"] == dollars(1460)
    assert m["safe_per_day"] == round(dollars(1460) / 12)
    assert m["vs_pace"] == round(dollars(500) - dollars(3200) * 19 / 31)
    groceries = next(c for c in m["categories"] if c["name"] == "Groceries")
    assert groceries["spent"] == dollars(500) and groceries["budget"] == dollars(1200)


def test_transfers_arent_spending(client: TestClient, household: dict) -> None:
    ids = household
    ok(
        client.post(
            "/api/transactions",
            json={
                "account_id": ids["Spending"],
                "amount": -dollars(100),
                "description": "Transfer",
                "category_id": cat(client, "Transfer"),
            },
        )
    )
    assert ok(client.get("/api/spending"))["month"]["spent"] == 0


def test_always_remembers_a_merchant_and_sorts_its_earlier_ones(client: TestClient, household: dict) -> None:
    ids = household
    a = ok(
        client.post(
            "/api/transactions",
            json={"account_id": ids["Spending"], "amount": -500, "description": "BP MITCHELTON", "date": "2026-11-01"},
        )
    )
    b = ok(
        client.post(
            "/api/transactions",
            json={"account_id": ids["Spending"], "amount": -600, "description": "BP MITCHELTON", "date": "2026-11-02"},
        )
    )
    ok(client.put(f"/api/transactions/{b['id']}", json={"category_id": cat(client, "Fuel"), "always": True}))
    rows = {t["id"]: t for t in ok(client.get(f"/api/transactions?account_id={ids['Spending']}"))}
    assert rows[a["id"]]["category"] == "Fuel"
    c = ok(
        client.post(
            "/api/transactions", json={"account_id": ids["Spending"], "amount": -700, "description": "BP MITCHELTON"}
        )
    )
    assert c["category"] == "Fuel"


def test_spending_cant_be_in_the_future(client: TestClient, household: dict) -> None:
    r = client.post(
        "/api/transactions",
        json={"account_id": household["Spending"], "amount": -100, "description": "X", "date": "2026-12-01"},
    )
    assert r.status_code == 422
