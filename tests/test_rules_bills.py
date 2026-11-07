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
