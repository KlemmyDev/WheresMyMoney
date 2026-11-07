"""Splitting a transaction across categories, and marking one as someone paying us back."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok
from tests.test_spending import cat


def costco(client: TestClient, household: dict) -> dict:
    return ok(
        client.post(
            "/api/transactions",
            json={
                "account_id": household["Spending"],
                "amount": -dollars(172.40),
                "description": "Costco",
                "category_id": cat(client, "Groceries"),
                "date": "2026-11-03",
            },
        )
    )


def spent_in(m: dict, name: str) -> int:
    return next((c["spent"] for c in m["categories"] if c["name"] == name), 0)


def test_a_split_counts_each_part_in_its_category(client: TestClient, household: dict) -> None:
    tx = costco(client, household)
    groceries, shopping = cat(client, "Groceries"), cat(client, "Shopping")
    tx = ok(
        client.put(
            f"/api/transactions/{tx['id']}",
            json={
                "splits": [
                    {"category_id": groceries, "amount": dollars(120)},
                    {"category_id": shopping, "amount": dollars(52.40)},
                ]
            },
        )
    )
    assert tx["category_by"] == "split" and tx["category_id"] == groceries
    assert [p["amount"] for p in tx["splits"]] == [dollars(120), dollars(52.40)]
    m = ok(client.get("/api/spending"))["month"]
    assert spent_in(m, "Groceries") == dollars(120) and spent_in(m, "Shopping") == dollars(52.40)
    assert m["spent"] == dollars(172.40)
    # Choosing one category again undoes the split.
    tx = ok(client.put(f"/api/transactions/{tx['id']}", json={"category_id": shopping}))
    assert tx["splits"] == [] and tx["category_by"] == "you"


def test_a_split_must_add_up(client: TestClient, household: dict) -> None:
    tx = costco(client, household)
    r = client.put(
        f"/api/transactions/{tx['id']}",
        json={
            "splits": [
                {"category_id": cat(client, "Groceries"), "amount": dollars(100)},
                {"category_id": cat(client, "Shopping"), "amount": dollars(50)},
            ]
        },
    )
    assert r.status_code == 422 and "172.40" in r.text


def test_paid_back_isnt_spending_and_counts_as_coming_back(client: TestClient, household: dict) -> None:
    before = ok(client.get("/api/spending"))["month"]
    tx = costco(client, household)
    tx = ok(client.put(f"/api/transactions/{tx['id']}", json={"excluded": True}))
    assert tx["excluded"] is True
    m = ok(client.get("/api/spending"))["month"]
    assert m["spent"] == before["spent"] and m["owed_back"] == dollars(172.40)
    assert m["left"] == before["left"]  # the balance went down, but it's coming back
    # When they pay it back, that's marked the same way and nothing's owed.
    back = ok(
        client.post(
            "/api/transactions",
            json={"account_id": household["Spending"], "amount": dollars(172.40), "description": "Sam paid back"},
        )
    )
    ok(client.put(f"/api/transactions/{back['id']}", json={"excluded": True}))
    m = ok(client.get("/api/spending"))["month"]
    assert m["owed_back"] == 0 and m["left"] == before["left"] and m["spent"] == before["spent"]
