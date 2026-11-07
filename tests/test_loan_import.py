"""A home loan's statement: imported as what's owed, with its rate and repayment changes read from it."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok
from tests.test_imports import ubank

JAN = ubank(
    [
        ("23 Jan 2026", "Original Rate: 5.290000 %", "", "$0.00", "+$0.00"),
        ("23 Jan 2026", "Loan Proceeds", "$400,000.00", "", "-$400,000.00"),
        ("31 Jan 2026", "Interest Charged", "$400.00", "", "-$400,400.00"),
    ]
)
FEB = ubank(
    [
        ("12 Feb 2026", "Rate Change: 5.2900% To 5.5400%", "", "$0.00", "-$400,400.00"),
        ("23 Feb 2026", "Schedule Pmt - Deposit - Auto Split", "", "$2,400.00", "-$398,000.00"),
        ("28 Feb 2026", "Interest Charged", "$1,200.00", "", "-$399,200.00"),
    ]
)
MAR = ubank(
    [
        ("23 Mar 2026", "Schedule Pmt - Deposit - Auto Split", "", "$2,500.00", "-$397,900.00"),
        ("31 Mar 2026", "Interest Charged", "$1,300.00", "", "-$399,200.00"),
    ]
)


def bring_in(client: TestClient, loan: int, raw: bytes, month: str) -> dict[str, Any]:
    opened = ok(client.post(f"/api/imports?filename=HomeLoan-9917_{month}.csv", content=raw))
    assert opened["account_id"] == loan  # found by its last four
    return ok(client.post(f"/api/imports/{opened['token']}/commit", json={"account_id": loan}))


def test_a_loan_statement_is_imported_as_whats_owed(client: TestClient, household: dict) -> None:
    loan = household["Loan"]
    ok(client.put(f"/api/accounts/{loan}", json={"last4": "9917"}))
    opened = ok(client.post("/api/imports?filename=HomeLoan-9917_2026-01.csv", content=JAN))
    a = ok(client.post(f"/api/imports/{opened['token']}/analyse", json={"account_id": loan}))
    assert [r["status"] for r in a["rows"]] == ["note", "new", "new"]
    assert [r["amount"] for r in a["rows"][1:]] == [dollars(400000), dollars(400)]
    assert [r["why"] for r in a["rows"][1:]] == ["drawdown", "interest"]
    assert a["counts"]["need"] == 0 and a["by_category"] == []
    assert a["loan"]["changes"][0] | {"description": ""} == {
        "date": "2026-01-23",
        "field": "rate",
        "value": 529,
        "was": None,
        "description": "",
        "index": 0,
        "new": True,
    }
    done = ok(client.post(f"/api/imports/{opened['token']}/commit", json={"account_id": loan}))
    assert done["added"] == 2
    assert done["account"]["ledger"] == dollars(400400)
    assert done["loan"]["rate_bp"] == 529


def test_rate_and_repayment_changes_follow_the_latest_statement(client: TestClient, household: dict) -> None:
    loan = household["Loan"]
    ok(client.put(f"/api/accounts/{loan}", json={"last4": "9917"}))
    bring_in(client, loan, JAN, "2026-01")
    feb = bring_in(client, loan, FEB, "2026-02")
    assert feb["loan"] == {"rate_bp": 554, "repayment": dollars(2400), "changes": 2}
    mar = bring_in(client, loan, MAR, "2026-03")
    assert mar["loan"]["repayment"] == dollars(2500)

    account = ok(client.get(f"/api/accounts/{loan}"))
    assert account["rate_bp"] == 554 and account["repayment"] == dollars(2500)
    assert [(c["date"], c["field"], c["value"], c["was"]) for c in account["changes"]] == [
        ("2026-03-23", "repayment", dollars(2500), dollars(2400)),
        ("2026-02-23", "repayment", dollars(2400), None),
        ("2026-02-12", "rate", 554, 529),
        ("2026-01-23", "rate", 529, None),
    ]


def test_an_older_statement_imported_later_doesnt_turn_the_rate_back(client: TestClient, household: dict) -> None:
    loan = household["Loan"]
    ok(client.put(f"/api/accounts/{loan}", json={"last4": "9917"}))
    bring_in(client, loan, FEB, "2026-02")
    bring_in(client, loan, JAN, "2026-01")
    assert ok(client.get(f"/api/accounts/{loan}"))["rate_bp"] == 554


def test_the_same_loan_statement_twice_adds_nothing(client: TestClient, household: dict) -> None:
    loan = household["Loan"]
    ok(client.put(f"/api/accounts/{loan}", json={"last4": "9917"}))
    bring_in(client, loan, FEB, "2026-02")
    again = bring_in(client, loan, FEB, "2026-02")
    assert again["added"] == 0 and again["skipped"] == 2 and again["loan"]["changes"] == 0


def test_loan_transactions_stay_out_of_spending(client: TestClient, household: dict) -> None:
    loan = household["Loan"]
    ok(client.put(f"/api/accounts/{loan}", json={"last4": "9917"}))
    before = ok(client.get("/api/dashboard", params={"period": "30d"}))
    bring_in(client, loan, FEB, "2026-02")
    after = ok(client.get("/api/dashboard", params={"period": "30d"}))
    assert before["spending"] == after["spending"]
