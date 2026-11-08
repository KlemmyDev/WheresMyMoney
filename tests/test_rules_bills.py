"""Schedules, bills and the rules' plan."""

from __future__ import annotations

import datetime as dt

from fastapi.testclient import TestClient

from app.core import dates
from tests.conftest import dollars, ok


def test_schedules_step_by_days_and_months() -> None:
    d = dt.date
    assert list(dates.occurrences(d(2026, 11, 12), "fortnightly", d(2026, 11, 1), d(2026, 12, 31))) == [
        d(2026, 11, 12),
        d(2026, 11, 26),
        d(2026, 12, 10),
        d(2026, 12, 24),
    ]
    assert list(dates.occurrences(d(2026, 1, 31), "monthly", d(2026, 2, 1), d(2026, 4, 30))) == [
        d(2026, 2, 28),
        d(2026, 3, 31),
        d(2026, 4, 30),
    ]
    assert dates.next_on_or_after(d(2026, 3, 14), "yearly", d(2026, 11, 12)) == d(2027, 3, 14)
    assert dates.last_on_or_before(d(2026, 10, 25), "monthly", d(2026, 11, 12)) == d(2026, 10, 25)


def test_a_bills_next_due_date_moves_on_by_itself(client: TestClient) -> None:
    bills = ok(
        client.post(
            "/api/bills", json={"name": "Internet", "amount": 8900, "every": "monthly", "next_due": "2026-09-12"}
        )
    )
    [bill] = bills["bills"]
    assert bill["next_due"] == "2026-11-12" and bill["per_year"] == 8900 * 12


def test_bills_add_up_by_month_and_for_the_next_30_days(client: TestClient, household: dict) -> None:
    b = ok(client.get("/api/bills"))
    assert b["next30"]["count"] == 3 and b["next30"]["total"] == dollars(89 + 186 + 89)
    assert len(b["by_month"]) == 12


def test_a_bill_needs_a_name_and_an_amount(client: TestClient) -> None:
    r = client.post("/api/bills", json={"name": "", "amount": 0, "every": "monthly", "next_due": "2026-11-12"})
    assert r.status_code == 422 and r.json()["detail"] == "Give the bill a name."


def test_a_top_up_moves_only_the_difference(client: TestClient, household: dict) -> None:
    from app.core import dates as d

    d.set_today(dt.date(2026, 11, 25))
    rows = {a["name"]: a for a in ok(client.get("/api/checkins"))["accounts"]}
    # Offset: 94,600 + pay − 1,500 on the 12th, then the top-up of Spending ($3,200 less the $1,960 there).
    assert rows["Offset"]["expected"] == dollars(94600 + 6950 - 1500 - (3200 - 1960))
    assert rows["Offset"]["approximate"] is True


def test_what_a_month_looks_like(client: TestClient, household: dict) -> None:
    month = ok(client.get("/api/rules"))["month"]
    assert month["pay"] == round(dollars(6950) * 26 / 12)
    assert month["spending"] == dollars(3200)
    assert month["repayment"] == dollars(3770)


def test_the_payday_preview_shows_each_account_after(client: TestClient, household: dict) -> None:
    preview = ok(client.get("/api/rules"))["payday"]
    assert preview["date"] == "2026-11-12"
    after = preview["after"]
    assert after[str(household["Bills"])] == dollars(8120 + 1200)
    assert after[str(household["Savings"])] == dollars(22850 + 300)


def test_a_rule_needs_two_accounts(client: TestClient, household: dict) -> None:
    r = client.post(
        "/api/rules",
        json={
            "kind": "transfer",
            "from_account": household["Offset"],
            "amount": 100,
            "every": "monthly",
            "anchor": "2026-11-01",
        },
    )
    assert r.status_code == 422


def test_a_payment_can_become_a_bill_with_the_ones_like_it(client: TestClient, household: dict) -> None:
    def pay(day: str, cents: int, text: str) -> int:
        tx = {"amount": -cents, "description": text, "account_id": household["Bills"], "date": day}
        return int(ok(client.post("/api/transactions", json=tx))["id"])

    pay("2026-08-03", 8900, "TELSTRA 1234 SYDNEY")
    pay("2026-09-03", 8900, "TELSTRA 1234 SYDNEY")
    far = pay("2026-09-20", 45000, "TELSTRA 1234 SYDNEY")  # a new phone: same shop, not the bill
    other = pay("2026-10-01", 8900, "OPTUS MOBILE")
    latest = pay("2026-10-03", 9200, "TELSTRA 1234 SYDNEY")
    cats = {c["name"]: c for c in ok(client.get("/api/categories"))["categories"]}
    body = {
        "name": "Phone",
        "amount": 9200,
        "every": "monthly",
        "next_due": "2026-11-03",
        "account_id": household["Bills"],
        "category_id": cats["Phone & internet"]["id"],
        "transaction_id": latest,
    }
    r = ok(client.post("/api/bills", json=body))
    assert r["added"]["name"] == "Phone" and r["linked"] == 3
    d = ok(client.get(f"/api/bills/{r['added']['id']}"))
    assert d["count"] == 3 and {t["category"] for t in d["transactions"]} == {"Phone & internet"}
    ids = {t["id"] for t in d["transactions"]}
    assert latest in ids and far not in ids and other not in ids

    # Not part of the bill after all, then part of it again.
    ok(client.put(f"/api/transactions/{latest}", json={"bill_id": None}))
    assert ok(client.get(f"/api/bills/{r['added']['id']}"))["count"] == 2
    assert (
        ok(client.put(f"/api/transactions/{other}", json={"bill_id": r["added"]["id"]}))["bill_id"] == r["added"]["id"]
    )
    assert client.put(f"/api/transactions/{other}", json={"bill_id": 9999}).status_code == 404


def test_there_are_categories_for_budgeting(client: TestClient, household: dict) -> None:
    names = {c["name"] for c in ok(client.get("/api/categories"))["categories"]}
    assert {"Groceries", "Parking & tolls", "Home maintenance", "Furniture", "Loans", "School fees"} <= names


def test_yearly_costs_are_set_aside_for_month_by_month(client: TestClient, household: dict) -> None:
    def bill(name: str, dollars_: float, every: str, next_due: str) -> None:
        body = {"name": name, "amount": dollars(dollars_), "every": every, "next_due": next_due}
        ok(client.post("/api/bills", json={**body, "account_id": household["Bills"]}))

    bill("Rego", 900, "yearly", "2027-05-12")  # last due 12 May 2026: half the year's gone
    bill("Home insurance", 1800, "yearly", "2026-12-12")  # due in a month: nearly all built up
    bill("Streaming", 26, "monthly", "2026-11-20")  # monthly: not one to set aside for
    b = ok(client.get("/api/bills"))
    s = b["set_aside"]
    names = [x["name"] for x in s["items"]]
    assert "Streaming" not in names and names.index("Home insurance") < names.index("Rego")
    assert names == [x["name"] for x in sorted(s["items"], key=lambda x: x["next_due"])]
    rego = next(x for x in s["items"] if x["name"] == "Rego")
    assert rego["per_month"] == dollars(75) and rego["days"] == 181
    assert rego["built"] == round(dollars(900) * 184 / 365)
    home = next(x for x in s["items"] if x["name"] == "Home insurance")
    assert home["built"] == round(dollars(1800) * 335 / 365) and home["next_due"] == "2026-12-12"
    assert s["per_month"] == sum(x["per_month"] for x in s["items"])
    assert s["built"] == sum(x["built"] for x in s["items"])
    assert b["into_account"] >= 0
