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


def test_the_month_counts_spends_still_to_sort(client: TestClient, household: dict) -> None:
    """The Overview says how many spends need a category, not just what they add up to."""
    for amount, what in ((dollars(30), "Corner store"), (dollars(12), "Market stall")):
        ok(
            client.post(
                "/api/transactions",
                json={
                    "account_id": household["Spending"],
                    "amount": -amount,
                    "description": what,
                    "date": "2026-11-02",
                },
            )
        )
    m = ok(client.get("/api/spending"))["month"]
    assert m["unsorted_count"] == 2 and m["unsorted"] == dollars(42)


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
    assert done["changed"] == 2 and done["pattern"] == "KMART"
    cats = {t["id"]: t["category_id"] for t in ok(client.get("/api/transactions"))}
    txs = ok(client.get("/api/transactions"))
    assert {t["remember_as"] for t in txs if t["description"].startswith("KMART")} == {"KMART"}
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
    # The next round of starting categories comes in the same way, once.
    MIGRATIONS[4](conn)
    names = [r[0] for r in conn.execute("SELECT name FROM categories ORDER BY sort")]
    assert {"Coffee", "Childcare", "Rent", "Side income", "Savings"} <= set(names)
    assert len(names) == len(set(n.lower() for n in names))
    assert names.index("Coffee") < names.index("Bills") < names.index("Rent") < names.index("Pay")


def test_budgets_are_suggested_from_what_was_spent(client: TestClient, household: dict) -> None:
    cats = {c["name"]: c for c in ok(client.get("/api/categories"))["categories"]}

    def spend(day: str, dollars_: float, category: str) -> None:
        tx = {
            "amount": -round(dollars_ * 100),
            "description": f"{category} shop",
            "account_id": household["Spending"],
            "date": day,
            "category_id": cats[category]["id"],
        }
        ok(client.post("/api/transactions", json=tx))

    # May to October (today is 12 November): groceries always over the $1,200 budget, eating out well under its
    # $300, coffee with no budget at all.
    for month in range(5, 11):
        spend(f"2026-{month:02d}-01", 700, "Groceries")
        spend(f"2026-{month:02d}-15", 700 + month, "Groceries")
        spend(f"2026-{month:02d}-10", 50, "Eating out")
        spend(f"2026-{month:02d}-12", 31.5, "Coffee")
    spend("2026-11-02", 999, "Groceries")  # this month isn't counted

    s = ok(client.get("/api/categories/suggestions"))
    assert s["months"] == 6 and s["from"] == "2026-05-01"
    rows = {r["name"]: r for r in s["categories"]}
    g = rows["Groceries"]
    assert g["months"][0] == dollars(1405) and g["average"] == round(sum(dollars(1400 + m) for m in range(5, 11)) / 6)
    assert g["suggested"] == dollars(1410) and g["over"] == 6 and g["note"] == "over"
    assert rows["Eating out"]["note"] == "under" and rows["Eating out"]["suggested"] == dollars(50)
    assert rows["Coffee"]["budget"] is None and rows["Coffee"]["suggested"] == dollars(40)
    assert rows["Coffee"]["note"] is None
    assert next(iter(rows)) == "Groceries"  # biggest first


def test_sorting_a_merchant_can_be_undone(client: TestClient, household: dict) -> None:
    ids = household
    made = [
        ok(
            client.post(
                "/api/transactions",
                json={"account_id": ids["Spending"], "amount": -900, "description": "ZEPHYR NOODLES CITY", "date": d},
            )
        )
        for d in ("2026-11-02", "2026-11-03")
    ]
    sorted_ = ok(
        client.post(
            "/api/merchants/sort", json={"transaction_id": made[0]["id"], "category_id": cat(client, "Eating out")}
        )
    )
    assert sorted_["changed"] == 2
    ok(client.post("/api/merchants/sort/undo", json={"undo": sorted_["undo"]}))
    rows = {t["id"]: t for t in ok(client.get(f"/api/transactions?account_id={ids['Spending']}"))}
    assert all(rows[m["id"]]["category"] is None for m in made)
    later = ok(
        client.post(
            "/api/transactions",
            json={"account_id": ids["Spending"], "amount": -900, "description": "ZEPHYR NOODLES CITY"},
        )
    )
    assert later["category"] is None  # nothing remembered any more
