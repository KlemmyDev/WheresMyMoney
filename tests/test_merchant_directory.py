"""The merchants: grouped by what they'd be remembered by, mapped and named by the household, month by month."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.features.spending.directory import key_of, pretty
from tests.conftest import ok


def spend(client: TestClient, account: int, amount: int, description: str, date: str = "2026-10-20") -> dict:
    return ok(
        client.post(
            "/api/transactions",
            json={"account_id": account, "amount": -amount, "description": description, "date": date},
        )
    )


def test_names_and_keys() -> None:
    assert key_of("Domino's Pizza") == "DOMINOS PIZZA"
    assert pretty("BP MITCHELTON") == "BP Mitchelton"
    assert pretty("WOOLWORTHS") == "Woolworths"


def test_merchants_group_map_and_rename(client: TestClient, household: dict) -> None:
    acc = household["Spending"]
    spend(client, acc, 4500, "WOOLWORTHS MITCHELTON", "2026-10-02")
    spend(client, acc, 5500, "WOOLWORTHS REDBANK PLAINS", "2026-10-09")
    party = spend(client, acc, 12000, "DPE KEPERRA 4054", "2026-10-25")
    listed = {m["key"]: m for m in ok(client.get("/api/merchants/directory"))}
    # Two stores, one merchant.
    assert listed["WOOLWORTHS"]["count"] == 2 and listed["WOOLWORTHS"]["spent"] == 10000
    assert listed["WOOLWORTHS"]["names"] == 2

    # The pizza place shows up under a cryptic statement name: map it to a new merchant.
    ok(client.post("/api/merchants/assign", json={"text": party["merchant"], "name": "Domino's"}))
    d = ok(client.get("/api/merchants/directory/DOMINOS"))
    assert d["name"] == "Domino's" and d["spent"] == 12000
    assert d["names"][0]["text"] == party["merchant"] and d["names"][0]["mapped"] is True
    assert [t["id"] for t in d["transactions"]] == [party["id"]]
    tx = next(t for t in ok(client.get("/api/transactions")) if t["id"] == party["id"])
    assert tx["merchant_key"] == "DOMINOS" and tx["merchant_name"] == "Domino's"

    # Rename, then undo the mapping.
    ok(client.put("/api/merchants/directory/WOOLWORTHS", json={"name": "Woolies"}))
    assert ok(client.get("/api/merchants/directory/WOOLWORTHS"))["name"] == "Woolies"
    ok(client.post("/api/merchants/forget", json={"text": party["merchant"]}))
    assert client.get("/api/merchants/directory/DOMINOS").status_code == 404


def test_transfers_arent_merchants(client: TestClient, household: dict) -> None:
    keys = {m["key"] for m in ok(client.get("/api/merchants/directory"))}
    assert not any("TRANSFER" in k for k in keys)


def test_unknown_merchants_go_by_two_words() -> None:
    from app.features.spending.directory import auto_key

    assert auto_key("HOME LOAN REPAYMENT") == "HOME LOAN"
    assert auto_key("HOME INSURANCE PAYMENT") == "HOME INSURANCE"
    assert auto_key("WOOLWORTHS REDBANK PLAINS") == "WOOLWORTHS"
