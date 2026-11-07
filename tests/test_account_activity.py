"""An account a day at a time for up to a year: the balance line and the money in and out that moved it."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok


def test_a_bank_account_shows_each_days_balance_and_what_moved_it(client: TestClient, household: dict) -> None:
    spending = household["Spending"]
    ok(
        client.post(
            "/api/transactions",
            json={"amount": -dollars(64.80), "description": "Woolworths", "account_id": spending, "date": "2026-11-12"},
        )
    )
    a = ok(client.get(f"/api/accounts/{spending}/activity"))
    assert a["estimated"] is False and len(a["days"]) == 365
    assert a["days"][-1] == {
        "date": "2026-11-12",
        "balance": ok(client.get(f"/api/accounts/{spending}"))["balance"],
        "in": 0,
        "out": dollars(64.80),
    }
    assert a["days"][-2]["balance"] - a["days"][-1]["balance"] == dollars(64.80)


def test_the_range_is_a_week_to_a_year(client: TestClient, household: dict) -> None:
    offset = household["Offset"]
    assert len(ok(client.get(f"/api/accounts/{offset}/activity?days=9999"))["days"]) == 366
    assert len(ok(client.get(f"/api/accounts/{offset}/activity?days=1"))["days"]) == 7
    assert client.get("/api/accounts/9999/activity").status_code == 404


def test_a_loan_without_statements_is_estimated(client: TestClient, household: dict) -> None:
    loan, offset = household["Loan"], household["Offset"]
    ok(client.put(f"/api/accounts/{loan}", json={"last4": "9917"}))
    ok(
        client.post(
            "/api/transactions",
            json={
                "amount": -dollars(3770),
                "description": "HOME LOAN REPAYMENT 9917",
                "account_id": offset,
                "date": "2026-11-01",
            },
        )
    )
    a = ok(client.get(f"/api/accounts/{loan}/activity?days=60"))
    days = {d["date"]: d for d in a["days"]}
    assert a["estimated"] is True
    assert days["2026-11-01"]["out"] == dollars(3770)  # the repayment, found by the loan's last four digits
    # Interest at the month's end on what the offsets don't cover, at 5.84%. The offsets' balances start on 29 October,
    # so the first 28 days are charged on the whole $604,820 ($2,710) and the last 3 on $477,290 ($229).
    assert dollars(2900) < days["2026-10-31"]["in"] < dollars(2980)
    assert {d["date"] for d in a["days"] if d["in"]} == {"2026-09-30", "2026-10-31"}  # only at months' ends
    assert a["days"][-1]["balance"] == ok(client.get(f"/api/accounts/{loan}"))["balance"]
    assert days["2026-10-31"]["balance"] - days["2026-11-01"]["balance"] == dollars(3770)
