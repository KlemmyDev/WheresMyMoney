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


def test_merging_merchants(client: TestClient, household: dict) -> None:
    acc = household["Spending"]
    # The pool build, paid in stages (numbers are dropped from statement names, so the stages are one merchant) and
    # an excavation bill under another name.
    spend(client, acc, 150000, "STAGE 1 PAYMENT", "2026-10-11")
    spend(client, acc, 220000, "STAGE 2 PAYMENT", "2026-10-12")
    spend(client, acc, 90000, "POOL EXCAVATION", "2026-10-13")
    keys = {m["key"] for m in ok(client.get("/api/merchants/directory"))}
    assert {"STAGE PAYMENT", "POOL EXCAVATION"} <= keys
    out = ok(
        client.post(
            "/api/merchants/merge", json={"from": ["STAGE PAYMENT", "POOL EXCAVATION"], "name": "La Vida Pools"}
        )
    )
    assert out == {"key": "LA VIDA POOLS", "moved": 2}
    listed = {m["key"]: m for m in ok(client.get("/api/merchants/directory"))}
    assert not {"STAGE PAYMENT", "POOL EXCAVATION"} & listed.keys()
    pools = listed["LA VIDA POOLS"]
    assert pools["name"] == "La Vida Pools" and pools["count"] == 3 and pools["spent"] == 460000
    # Merging into an existing merchant works the same way.
    spend(client, acc, 5000, "LAVIDA POOL SUPPLIES", "2026-10-20")
    ok(client.post("/api/merchants/merge", json={"from": "LAVIDA POOL", "into": "LA VIDA POOLS"}))
    assert ok(client.get("/api/merchants/directory/LA VIDA POOLS"))["count"] == 4
    assert client.post("/api/merchants/merge", json={"from": []}).status_code == 422


def test_a_merchants_own_sorting_by_amount(client: TestClient, household: dict) -> None:
    acc = household["Spending"]
    cats = {c["name"]: c["id"] for c in ok(client.get("/api/categories"))["categories"]}
    fuel, eating = cats["Fuel"], cats["Eating out"]
    small = spend(client, acc, 650, "7-ELEVEN 2201 KEPERRA", "2026-10-03")
    big = spend(client, acc, 7200, "7-ELEVEN 2201 KEPERRA", "2026-10-04")
    mine = spend(client, acc, 4100, "7-ELEVEN 2201 KEPERRA", "2026-10-05")
    groceries = cats["Groceries"]
    ok(client.put(f"/api/transactions/{mine['id']}", json={"category_id": groceries}))  # chosen by hand
    key = small["merchant_key"]
    out = ok(
        client.put(
            f"/api/merchants/settings/{key}",
            json={"category_id": eating, "rules": [{"over": True, "amount": 3000, "category_id": fuel}]},
        )
    )
    assert (
        out["note"] == ""
        and out["category_id"] == eating
        and out["rules"] == [{"over": True, "amount": 3000, "category_id": fuel}]
    )
    assert out["changed"] == 2
    by_id = {t["id"]: t for t in ok(client.get("/api/transactions"))}
    assert by_id[small["id"]]["category_id"] == eating  # a drink and a pie
    assert by_id[big["id"]]["category_id"] == fuel  # filled up
    assert by_id[mine["id"]]["category_id"] == groceries  # left as chosen
    # New spending there is sorted the same way.
    later = spend(client, acc, 5500, "7-ELEVEN 2201 KEPERRA", "2026-10-09")
    assert later["category_id"] == fuel
    assert ok(client.get(f"/api/merchants/directory/{key}"))["settings"]["category_id"] == eating
    bad = client.put(
        f"/api/merchants/settings/{key}", json={"rules": [{"over": True, "amount": 0, "category_id": fuel}]}
    )
    assert bad.status_code == 422


def test_a_merchant_note(client: TestClient, household: dict) -> None:
    tx = spend(client, household["Spending"], 9800, "HOLLARD INSURANCE", "2026-10-15")
    key = tx["merchant_key"]
    out = ok(client.put(f"/api/merchants/settings/{key}", json={"note": "  Car insurance  for the Mazda "}))
    assert out["note"] == "Car insurance for the Mazda" and out["category_id"] is None
    assert ok(client.get(f"/api/merchants/directory/{key}"))["settings"]["note"] == "Car insurance for the Mazda"
    assert next(m for m in ok(client.get("/api/merchants/directory")) if m["key"] == key)["note"].startswith("Car")
    again = next(t for t in ok(client.get("/api/transactions")) if t["id"] == tx["id"])
    assert again["merchant_note"] == "Car insurance for the Mazda"
