"""Spotting bills in the ledger: regular payments to one merchant, price rises, and what isn't a bill."""

from __future__ import annotations

import datetime as dt
from typing import Any

from fastapi.testclient import TestClient

from app.core import dates
from app.features.bills import detect
from app.features.spending import merchants
from tests.conftest import ok

TODAY = dt.date(2026, 11, 7)
BILL_CAT = 1
NAMES = {1: "Insurance", 2: "Groceries", 3: "Subscriptions"}


def pays(description: str, schedule: list[tuple[str, float]], start_id: int = 0, cat: int | None = None):
    return [
        detect.Payment(start_id + i, 1, d, round(a * 100), description, merchants.merchant(description), cat, None)
        for i, (d, a) in enumerate(schedule)
    ]


def monthly(first: dt.date, n: int, amount: float, rise: tuple[int, float] | None = None) -> list[tuple[str, float]]:
    out = []
    for i in range(n):
        a = rise[1] if rise and i >= rise[0] else amount
        out.append((dates.add_months(first, i).isoformat(), a))
    return out


def find(ps: list[detect.Payment], bills: list[Any] | None = None) -> dict[str, Any]:
    return detect.find(ps, bills or [], {BILL_CAT, 3}, NAMES, {1: TODAY.isoformat()}, TODAY)


def test_a_monthly_insurance_with_a_rise_is_spotted() -> None:
    ps = pays("NIB Qantas Newcastle AU", monthly(dt.date(2025, 11, 26), 12, 118.98, (5, 120.93)), cat=BILL_CAT)
    [s] = find(ps)["suggestions"]
    assert s["name"] == "NIB Qantas" and s["every"] == "monthly" and s["amount"] == 12093
    assert s["next_due"] == "2026-11-26" and s["how"] == "auto" and s["category"] == "Insurance"
    assert s["changes"] == [{"date": "2026-04-26", "was": 11898, "now": 12093, "pct": 1.6}]
    assert s["match"] == "NIB"


def test_a_bill_that_has_stopped_isnt_suggested() -> None:
    ps = pays("Starlink Internet Sydney AU", monthly(dt.date(2025, 11, 9), 9, 99))
    assert find(ps)["suggestions"] == []


def test_shopping_isnt_a_bill_even_when_it_comes_often() -> None:
    # Weekly-ish shops of different sizes, and a few like-priced ones among many.
    shops = [((dt.date(2026, 9, 1) + dt.timedelta(days=7 * i)).isoformat(), 180 + (i % 3) * 25) for i in range(4)]
    many = [((dt.date(2025, 11, 1) + dt.timedelta(days=3 * i)).isoformat(), 20 + (i * 7) % 60) for i in range(100)]
    ps = pays("Aldi Stores Redbank", shops) + pays("Woolworths 2867 Redbank", many, 100, cat=2)
    assert find(ps)["suggestions"] == []


def test_one_merchant_can_have_several_subscriptions() -> None:
    a = monthly(dt.date(2025, 11, 18), 12, 31.95, (9, 34.95))
    b = [(dates.add_months(dt.date(2025, 11, 3), i).isoformat(), 4.49) for i in range(12)]
    ps = pays("Apple.com/bill Sydney AU", a, cat=3) + pays("Apple.com/bill Sydney AU", b, 100, cat=3)
    found = find(ps)["suggestions"]
    assert sorted(s["amount"] for s in found) == [449, 3495]
    assert all(s["name"].startswith("Apple ") for s in found)


def test_a_fortnightly_debit_with_one_off_extras() -> None:
    days = [(dt.date(2026, 1, 15) + dt.timedelta(days=14 * i)).isoformat() for i in range(21)]
    sched = [(d, 152.72 if i == 7 else 72.72) for i, d in enumerate(days)]
    [s] = find(pays("Direct Debit Danger Close Mar - Ezypayid", sched))["suggestions"]
    assert s["every"] == "fortnightly" and s["amount"] == 7272 and s["name"] == "Danger Close" and not s["changes"]


def test_a_bill_whose_price_moved_is_suggested_an_update() -> None:
    from app.features.bills.service import Bill

    ps = pays("Hollard Insurance Chatswood AU", monthly(dt.date(2025, 12, 4), 12, 145.20, (8, 152.40)), cat=BILL_CAT)
    bill = Bill(7, "Car insurance", 14520, "monthly", "2025-12-04", 1, "auto", "HOLLARD", BILL_CAT)
    found = find(ps, [bill])
    assert found["suggestions"] == []
    [u] = found["updates"]
    assert (u["bill_id"], u["was"], u["now"], u["since"]) == (7, 14520, 15240, "2026-08-04")


def test_spotted_bills_can_be_added_or_dismissed(client: TestClient, household: dict) -> None:
    dates.set_today(TODAY)
    for d, a in monthly(dt.date(2025, 11, 14), 12, 9.99):
        ok(
            client.post(
                "/api/transactions",
                json={
                    "amount": round(-a * 100),
                    "description": "Netflix.com Melbourne",
                    "account_id": household["Spending"],
                    "date": d,
                },
            )
        )
    for d, a in monthly(dt.date(2025, 11, 11), 12, 13.99):
        ok(
            client.post(
                "/api/transactions",
                json={
                    "amount": round(-a * 100),
                    "description": "Kindle Unltd",
                    "account_id": household["Spending"],
                    "date": d,
                },
            )
        )
    spotted = ok(client.get("/api/bills/spotted"))["suggestions"]
    names = {s["name"]: s for s in spotted}
    assert {"Netflix", "Kindle Unltd"} <= set(names)
    before = len(ok(client.get("/api/bills"))["bills"])
    overview = ok(client.post("/api/bills/spotted/accept", json={"key": names["Netflix"]["key"]}))
    assert len(overview["bills"]) == before + 1
    netflix = next(b for b in overview["bills"] if b["name"] == "Netflix")
    assert netflix["amount"] == 999 and netflix["every"] == "monthly" and netflix["match"] == "NETFLIX"
    txs = ok(client.get("/api/transactions", params={"q": "Netflix"}))
    assert all(t["bill_id"] == netflix["id"] for t in txs) and all(t["category"] == "Subscriptions" for t in txs)
    ok(client.post("/api/bills/spotted/dismiss", json={"key": names["Kindle Unltd"]["key"]}))
    left = {s["name"] for s in ok(client.get("/api/bills/spotted"))["suggestions"]}
    assert "Netflix" not in left and "Kindle Unltd" not in left


def test_a_bills_page_has_its_payments_totals_and_price_changes(client: TestClient, household: dict) -> None:
    # Netflix at $9.99 a month, then $12.99 from the ninth payment on.
    for i, (d, _) in enumerate(monthly(dt.date(2025, 11, 14), 12, 0)):
        amount = 999 if i < 8 else 1299
        tx = {"amount": -amount, "description": "Netflix.com Melbourne", "account_id": household["Spending"], "date": d}
        ok(client.post("/api/transactions", json=tx))
    found = {s["name"]: s for s in ok(client.get("/api/bills/spotted"))["suggestions"]}
    overview = ok(client.post("/api/bills/spotted/accept", json={"key": found["Netflix"]["key"]}))
    netflix = next(b for b in overview["bills"] if b["name"] == "Netflix")

    d = ok(client.get(f"/api/bills/{netflix['id']}"))
    assert d["bill"]["name"] == "Netflix" and d["count"] == 12
    assert d["total"] == 8 * 999 + 4 * 1299 and d["average"] == round(d["total"] / 12)
    assert d["first"] == "2025-11-14" and [p["date"] for p in d["payments"]] == sorted(p["date"] for p in d["payments"])
    assert d["changes"] == [{"date": d["payments"][8]["date"], "was": 999, "now": 1299}]
    assert len(d["transactions"]) == 12 and d["transactions"][0]["date"] >= d["transactions"][-1]["date"]
    assert len(d["upcoming"]) == 6 and d["next_year"] == 12 * netflix["amount"]
    assert 0 < d["share"] < 1

    assert client.get("/api/bills/9999").status_code == 404


def test_a_spotted_bill_can_wait_for_the_next_import_and_every_choice_undoes(
    client: TestClient, household: dict
) -> None:
    dates.set_today(TODAY)
    for d, a in monthly(dt.date(2025, 11, 14), 12, 9.99):
        tx = {"amount": round(-a * 100), "description": "Netflix.com Melbourne", "account_id": household["Spending"]}
        ok(client.post("/api/transactions", json={**tx, "date": d}))
    key = next(s for s in ok(client.get("/api/bills/spotted"))["suggestions"] if s["name"] == "Netflix")["key"]

    later = ok(client.post("/api/bills/spotted/later", json={"key": key}))
    assert all(s["key"] != key for s in later["suggestions"]) and later["later"] == ["Netflix"]
    back = ok(client.post("/api/bills/spotted/undo", json={"key": key}))
    assert any(s["key"] == key for s in back["suggestions"]) and back["later"] == []

    added = ok(client.post("/api/bills/spotted/accept", json={"key": key}))
    assert added["added"]["name"] == "Netflix" and len(added["transaction_ids"]) == 12
    undone = ok(
        client.post(
            "/api/bills/spotted/undo",
            json={"bill_id": added["added"]["id"], "transaction_ids": added["transaction_ids"]},
        )
    )
    assert any(s["key"] == key for s in undone["suggestions"])
    assert all(b["name"] != "Netflix" for b in ok(client.get("/api/bills"))["bills"])
    assert all(t["bill_id"] is None for t in ok(client.get("/api/transactions", params={"q": "Netflix"})))
