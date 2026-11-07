"""Retirement: each person's super, the estimate's settings, and what the household spends now."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok


def test_super_and_settings(client: TestClient) -> None:
    alex = ok(
        client.post(
            "/api/retirement/people",
            json={
                "person": "Alex",
                "born": 1988,
                "fund": "AustralianSuper",
                "balance": dollars(112600),
                "salary": dollars(120000),
            },
        )
    )
    assert alex["age"] == 38 and alex["opens"] == 2048 and alex["rate"] == 0.12
    alex = ok(
        client.put(f"/api/retirement/people/{alex['id']}", json={"balance": dollars(115000), "as_of": "2026-10-31"})
    )
    assert alex["balance"] == dollars(115000) and alex["fund"] == "AustralianSuper" and alex["as_of"] == "2026-10-31"
    assert client.post("/api/retirement/people", json={"person": "Kid", "born": 2020}).status_code == 422

    s = ok(client.put("/api/retirement/settings", json={"retire_age": 55, "extra": dollars(500)}))
    assert s["retire_age"] == 55 and s["extra"] == dollars(500) and s["plan_to"] == 92
    assert ok(client.get("/api/retirement"))["settings"]["retire_age"] == 55
    assert client.put("/api/retirement/settings", json={"retire_age": 30}).status_code == 422


def test_spending_now_leaves_out_transfers_the_loan_and_paid_back(client: TestClient, household: dict) -> None:
    before = ok(client.get("/api/retirement"))["spending_now"]
    for desc, amount in (("Woolworths", 100), ("HOME LOAN REPAYMENT 9917", 3000)):
        ok(
            client.post(
                "/api/transactions",
                json={"account_id": household["Spending"], "amount": -dollars(amount), "description": desc},
            )
        )
    paid = ok(
        client.post(
            "/api/transactions",
            json={"account_id": household["Spending"], "amount": -dollars(50), "description": "Concert tickets"},
        )
    )
    ok(client.put(f"/api/transactions/{paid['id']}", json={"excluded": True}))
    assert ok(client.get("/api/retirement"))["spending_now"] == before + dollars(100)


def test_assumptions_fees_and_options(client: TestClient) -> None:
    s = ok(client.put("/api/retirement/settings", json={"super_return": 0.085, "inflation": 0.025, "etf_fee": 0.0007}))
    assert s["super_return"] == 0.085 and s["inflation"] == 0.025 and s["etf_fee"] == 0.0007
    r = client.put("/api/retirement/settings", json={"super_return": 7})  # 700%: meant 7%
    assert r.status_code == 422 and "super return" in r.text
    p = ok(client.post("/api/retirement/people", json={"person": "Sam", "born": 1990, "balance": dollars(73800)}))
    assert [f["name"] for f in p["fees"]] == ["Admin fee", "Admin fee (on the balance)", "Investment fee"]
    fees = [
        {"name": "Admin fee", "kind": "fixed", "amount": 5200},
        {"name": "Insurance", "kind": "fixed", "amount": 31200},
        {"name": "Admin fee (on the balance)", "kind": "pct", "amount": 0.001},
    ]
    options = [
        {"name": "High Growth", "share": 0.7, "return_pct": 0.085, "fee_pct": 0.0056},
        {"name": "Balanced", "share": 0.3, "fee_pct": 0.0051},
    ]
    p = ok(client.put(f"/api/retirement/people/{p['id']}", json={"fees": fees, "options": options}))
    assert p["fees"] == fees and p["options"][1]["return_pct"] is None
    p = ok(client.put(f"/api/retirement/people/{p['id']}", json={"balance": dollars(80000)}))
    assert p["fees"] == fees  # kept
    bad = [{**options[0], "share": 0.5}, options[1]]
    r = client.put(f"/api/retirement/people/{p['id']}", json={"options": bad})
    assert r.status_code == 422 and "100%" in r.text
    r = client.put(f"/api/retirement/people/{p['id']}", json={"fees": [{"name": "X", "kind": "pct", "amount": 0.2}]})
    assert r.status_code == 422
