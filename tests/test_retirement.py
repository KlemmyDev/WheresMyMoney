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


def test_picking_a_known_fund_fills_in_its_fees(client: TestClient) -> None:
    """Australian Retirement Trust's fees as its fees page has them: $1.10 a week, 0.10% on the first $500,000, 0.05%
    met from reserves, and each investment option's own; insurance is kept."""
    funds = ok(client.get("/api/retirement"))["funds"]
    assert [f["name"] for f in funds] == ["Australian Retirement Trust"]
    p = ok(
        client.post(
            "/api/retirement/people",
            json={
                "person": "Sam",
                "born": 1992,
                "balance": dollars(209000),
                "options": [
                    {"name": "International Shares - Index (unhedged)", "share": 0.6},
                    {"name": "Australian Shares Index", "share": 0.4},
                ],
            },
        )
    )
    assert p["known_fund"] is None and p["fees"][0] == {"name": "Admin fee", "kind": "fixed", "amount": 5200}
    insurance = {"name": "Insurance", "kind": "fixed", "amount": dollars(1450)}
    ok(client.put(f"/api/retirement/people/{p['id']}", json={"fees": [*p["fees"], insurance]}))

    p = ok(client.put(f"/api/retirement/people/{p['id']}", json={"fund": "Australian Retirement Trust · Indexed"}))
    assert p["known_fund"] == "art"
    assert p["fees"] == [
        {"name": "Admin fee", "kind": "fixed", "amount": 5720},
        {"name": "Admin fee (on the balance)", "kind": "pct", "amount": 0.001, "cap": dollars(500000)},
        {"name": "Costs met from reserves", "kind": "pct", "amount": 0.0005},
        insurance,
    ]
    assert [o["fee_pct"] for o in p["options"]] == [0.001, 0.0008]

    # Fees typed in later stay as typed, and saving the same fund again doesn't put them back.
    mine = [{"name": "Admin fee", "kind": "fixed", "amount": 6000}]
    ok(client.put(f"/api/retirement/people/{p['id']}", json={"fees": mine}))
    assert (
        ok(client.put(f"/api/retirement/people/{p['id']}", json={"fund": "Australian Retirement Trust"}))["fees"]
        == mine
    )

    # A cap must be dollars at or above nothing.
    bad = {"name": "Admin", "kind": "pct", "amount": 0.001, "cap": -1}
    assert client.put(f"/api/retirement/people/{p['id']}", json={"fees": [bad]}).status_code == 422


def test_what_each_person_earns_gives_their_room_in_super(client: TestClient) -> None:
    p = ok(
        client.post(
            "/api/retirement/people",
            json={"person": "Alex", "born": 1988, "salary": dollars(120000), "rate": 0.12},
        )
    )
    assert p["sacrifice"] == 0 and p["pay_every"] == "fortnightly"
    # Work pays 12% of $120,000 ($14,400) of the $30,000 cap.
    assert p["concessional"] == dollars(14400) and p["room"] == dollars(15600)
    p = ok(client.put(f"/api/retirement/people/{p['id']}", json={"sacrifice": dollars(6000), "pay_every": "monthly"}))
    assert p["room"] == dollars(9600) and p["pay_every"] == "monthly" and p["salary"] == dollars(120000)
    p = ok(client.put(f"/api/retirement/people/{p['id']}", json={"sacrifice": dollars(20000)}))
    assert p["room"] == 0
    bad = client.put(f"/api/retirement/people/{p['id']}", json={"pay_every": "daily"})
    assert bad.status_code == 422


def test_crypto_stays_out_of_the_plan_until_turned_on_and_has_a_cap(client: TestClient) -> None:
    s = ok(client.get("/api/retirement"))["settings"]
    assert s["count_crypto"] is False and s["crypto_cap"] == 0.05 and s["crypto_cap_of"] == "investments"
    s = ok(
        client.put(
            "/api/retirement/settings", json={"count_crypto": True, "crypto_cap": 0.1, "crypto_cap_of": "networth"}
        )
    )
    assert s["count_crypto"] is True and s["crypto_cap"] == 0.1 and s["crypto_cap_of"] == "networth"
    assert client.put("/api/retirement/settings", json={"crypto_cap": 0.9}).status_code == 422
    assert client.put("/api/retirement/settings", json={"crypto_cap_of": "moon"}).status_code == 422
