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


def test_sorting_a_merchant_remembers_its_brand_and_resorts_suggestions_but_not_your_choices(
    client: TestClient, household: dict
) -> None:
    acct = household["Spending"]
    shopping, groceries, fun = cat(client, "Shopping"), cat(client, "Groceries"), cat(client, "Fun")
    made = [
        ok(client.post("/api/transactions", json={"amount": -1000 * (i + 1), "description": d, "account_id": acct}))
        for i, d in enumerate(["KMART 1283 YAMANTO", "KMART 1108 REDBANK", "KMART 1108 REDBANK", "SPOTLIGHT IPSWICH"])
    ]
    # One chosen by hand stays as it is.
    ok(client.put(f"/api/transactions/{made[2]['id']}", json={"category_id": fun}))
    groups = {g["pattern"]: g for g in ok(client.get("/api/merchants"))}
    assert groups["KMART"]["count"] == 3 and groups["KMART"]["unsorted"] == 2
    done = ok(client.post("/api/merchants/sort", json={"transaction_id": made[0]["id"], "category_id": shopping}))
    assert done == {"changed": 2, "pattern": "KMART"}
    cats = {t["id"]: t["category_id"] for t in ok(client.get("/api/transactions"))}
    assert cats[made[0]["id"]] == shopping and cats[made[1]["id"]] == shopping and cats[made[2]["id"]] == fun
    # A new Kmart store is sorted by the brand.
    t = ok(
        client.post(
            "/api/transactions", json={"amount": -500, "description": "KMART 9999 SPRINGFIELD", "account_id": acct}
        )
    )
    assert t["category_id"] == shopping
    # A merchant that starts the same but is sorted differently is told apart.
    ok(client.post("/api/merchants/sort", json={"transaction_id": made[3]["id"], "category_id": groceries}))
    rules = {r["pattern"] for r in ok(client.get("/api/categories"))["merchant_rules"]}
    assert {"KMART", "SPOTLIGHT"} <= rules


def test_an_older_household_gets_the_new_categories_once(tmp_path) -> None:
    import sqlite3

    from app.core.schema import MIGRATIONS

    conn = sqlite3.connect(tmp_path / "old.db")
    for step in MIGRATIONS[:3]:
        step(conn)
    conn.execute(
        "INSERT INTO categories (name, kind, sort) VALUES ('Groceries', 'spending', 0), ('Dog', 'spending', 1)"
    )
    conn.execute(
        "INSERT INTO transactions (account_id, date, amount, description, merchant, kind, category_id, created_at)"
        " VALUES (1, '2026-01-01', -100, 'Direct Debit Danger Close', 'DIRECT DEBIT DANGER CLOSE', 'statement', 1, 0)"
    )
    MIGRATIONS[3](conn)
    names = [r[0] for r in conn.execute("SELECT name FROM categories ORDER BY sort")]
    assert names[0] == "Groceries" and "Insurance" in names and "Dog" in names
    assert names.index("Dog") < names.index("Bills")  # the household's own spending sits with spending
    assert conn.execute("SELECT merchant, category_by FROM transactions").fetchone() == ("DANGER CLOSE", None)
