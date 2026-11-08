"""Linking payments to a bill: a line like "EIDA-4410938271" keeps its name, one link brings in the payments like it
and teaches the bill how it shows up, the bill's page finds the rest, and later imports link themselves."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.features.bills.service import signature
from app.features.spending import merchants
from tests.conftest import ok
from tests.test_imports import ubank, upload


def pay(client: TestClient, account: int, amount: int, description: str, date: str) -> dict:
    return ok(
        client.post(
            "/api/transactions",
            json={"account_id": account, "amount": -amount, "description": description, "date": date},
        )
    )


def test_a_name_stuck_to_a_reference_is_kept() -> None:
    assert merchants.merchant("EIDA-4410938271") == "EIDA"
    assert merchants.merchant("7-ELEVEN 2201 KEPERRA") == "7-ELEVEN KEPERRA"
    assert signature("EIDA-4410938271") == signature("EIDA-4410938295") == "EIDA-#"


def test_one_link_brings_in_the_rest_and_teaches_the_bill(client: TestClient, household: dict) -> None:
    acc = household["Spending"]
    bill = ok(
        client.post(
            "/api/bills", json={"name": "Superloop", "amount": 8900, "every": "monthly", "next_due": "2026-11-07"}
        )
    )["added"]
    a = pay(client, acc, 8900, "EIDA-4410938271", "2026-08-07")
    pay(client, acc, 8900, "EIDA-4410938283", "2026-09-07")
    pay(client, acc, 8900, "EIDA-4410938295", "2026-10-07")
    pay(client, acc, 4500, "WOOLWORTHS MITCHELTON", "2026-10-08")
    assert ok(client.get(f"/api/bills/{bill['id']}/candidates")) == []  # nothing says "Superloop" yet
    assert ok(client.post(f"/api/bills/{bill['id']}/link", json={"transaction_id": a["id"]}))["linked"] == 3
    detail = ok(client.get(f"/api/bills/{bill['id']}"))
    assert detail["bill"]["match"] == "EIDA" and detail["count"] == 3
    # The bill is named for a business the app knows, so its payments are that business's now, logo and all.
    shown = {t["merchant_name"] for t in ok(client.get("/api/transactions")) if t["description"].startswith("EIDA")}
    assert shown == {"Superloop"}


def test_the_bill_page_finds_the_rest(client: TestClient, household: dict) -> None:
    acc = household["Spending"]
    bill = ok(
        client.post(
            "/api/bills", json={"name": "Superloop", "amount": 8900, "every": "monthly", "next_due": "2026-11-07"}
        )
    )["added"]
    a = pay(client, acc, 8900, "EIDA-4410938271", "2026-08-07")
    b = pay(client, acc, 8900, "EIDA-4410938283", "2026-09-07")
    pay(client, acc, 52000, "EIDA-4410938299", "2026-09-20")  # far off the bill's amount
    ok(client.post(f"/api/bills/{bill['id']}/link", json={"transaction_ids": [a["id"]]}))
    found = ok(client.get(f"/api/bills/{bill['id']}/candidates"))
    assert [c["id"] for c in found] == [b["id"]] and found[0]["why"].startswith("Shows up as EIDA")
    assert ok(client.post(f"/api/bills/{bill['id']}/link", json={"transaction_ids": [b["id"]]}))["linked"] == 1
    assert ok(client.get(f"/api/bills/{bill['id']}/candidates")) == []


def test_later_imports_link_themselves(client: TestClient, household: dict) -> None:
    acc = household["Spending"]
    bill = ok(
        client.post(
            "/api/bills", json={"name": "Superloop", "amount": 8900, "every": "monthly", "next_due": "2026-10-27"}
        )
    )["added"]
    first = pay(client, acc, 8900, "EIDA-4410938271", "2026-09-27")
    ok(client.post(f"/api/bills/{bill['id']}/link", json={"transaction_id": first["id"]}))
    rows = [("27 Oct 2026", "EIDA-4410938300", "$89.00", "", "+$1,871.00")]
    opened = upload(client, ubank(rows))
    a = ok(client.post(f"/api/imports/{opened['token']}/analyse", json={"account_id": acc}))
    assert a["rows"][0]["why"] == "bill" and a["rows"][0]["bill_id"] == bill["id"]
