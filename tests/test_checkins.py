"""Balance check-ins: pre-filled with what the rules should have done, rough unless ticked exact, and a transfer that
didn't add up is flagged with the rule that explains it."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok


def form(client: TestClient) -> dict[str, Any]:
    return {a["name"]: a for a in ok(client.get("/api/checkins"))["accounts"]}


def test_the_form_expects_what_payday_and_the_bills_should_have_done(client: TestClient, household: dict) -> None:
    rows = form(client)
    # Pay in, $1,200 to Bills and $300 to Savings out.
    assert rows["Offset"]["expected"] == dollars(100050)
    # $1,200 in, council rates ($512) and internet ($89) out.
    assert rows["Bills"]["expected"] == dollars(8719)
    assert rows["Savings"]["expected"] == dollars(23150)
    # Spending varies, and the loan is updated when its statement comes.
    assert rows["Spending"]["expected"] is None
    assert rows["Home loan"]["expected"] is None
    assert "Council rates" in rows["Bills"]["because"] and "Internet" in rows["Bills"]["because"]


def test_a_missing_transfer_is_flagged_with_the_rule_that_explains_it(client: TestClient, household: dict) -> None:
    ids = household
    balances = {
        ids["Offset"]: dollars(100050),
        ids["Bills"]: dollars(8719),
        ids["Spending"]: dollars(1742),
        ids["Savings"]: dollars(22850),
    }
    result = ok(client.post("/api/checkins/check", json={"balances": balances}))
    by_name = {a["name"]: a for a in result["accounts"]}
    assert by_name["Offset"]["status"] == "ok"
    assert by_name["Bills"]["status"] == "ok"
    assert by_name["Spending"]["status"] == "spent" and by_name["Spending"]["spent"] == dollars(218)
    savings = by_name["Savings"]
    assert savings["status"] == "short" and savings["difference"] == -dollars(300)
    assert savings["explanation"] == "The $300 payday transfer from Offset to Savings didn't show up."
    # What it changes: coverage goes up.
    effects = result["effects"]
    assert effects["offsetting_after"] == dollars(100050 + 8719 + 1742 + 22850)
    assert effects["coverage_after"] > effects["coverage_before"]

    saved = ok(client.post("/api/checkins", json={"balances": balances}))
    [flag] = saved["flags"]
    assert flag["account"] == "Savings" and flag["rule"]["label"] == "Payday to Savings"
    rules = {r["label"]: r for r in ok(client.get("/api/rules"))["rules"]}
    assert rules["Payday to Savings"]["last_status"] == "missing"
    assert rules["Payday to Bills"]["last_status"] == "ok"


def test_within_the_tolerance_adds_up(client: TestClient, household: dict) -> None:
    ids = household
    result = ok(client.post("/api/checkins/check", json={"balances": {ids["Offset"]: dollars(100010)}}))
    assert {a["name"]: a for a in result["accounts"]}["Offset"]["status"] == "ok"


def test_a_flag_can_wait_a_day_or_be_skipped(client: TestClient, household: dict) -> None:
    ids = household
    saved = ok(client.post("/api/checkins", json={"balances": {ids["Savings"]: dollars(22850)}}))
    flag = saved["flags"][0]
    assert ok(client.post(f"/api/checkins/flags/{flag['id']}", json={"action": "snooze"}))["flags"] == []
    from app.core import dates
    from tests.conftest import TODAY

    dates.set_today(TODAY.replace(day=13))
    assert [f["id"] for f in ok(client.get("/api/checkins"))["flags"]] == [flag["id"]]
    assert ok(client.post(f"/api/checkins/flags/{flag['id']}", json={"action": "skip"}))["flags"] == []


def test_a_rough_check_in_never_adds_an_adjustment(client: TestClient, household: dict) -> None:
    ids = household
    ok(client.post("/api/checkins", json={"balances": {ids["Offset"]: dollars(100050)}}))
    assert ok(client.get(f"/api/transactions?account_id={ids['Offset']}")) == []
    account = ok(client.get(f"/api/accounts/{ids['Offset']}"))
    assert account["balance"] == dollars(100050) and account["ledger"] == 0


def test_an_exact_check_in_adjusts_the_ledger_to_match(client: TestClient, household: dict) -> None:
    ids = household
    result = ok(client.post("/api/checkins", json={"balances": {ids["Offset"]: dollars(100050)}, "exact": True}))
    assert {a["name"]: a for a in result["accounts"]}["Offset"]["adjustment"] == dollars(100050)
    [tx] = ok(client.get(f"/api/transactions?account_id={ids['Offset']}"))
    assert tx["description"] == "Balance adjustment" and tx["amount"] == dollars(100050) and tx["date"] == "2026-11-12"
    account = ok(client.get(f"/api/accounts/{ids['Offset']}"))
    assert account["balance"] == account["ledger"] == dollars(100050)


def test_the_next_reminder_is_the_next_payday(client: TestClient, household: dict) -> None:
    assert ok(client.get("/api/checkins"))["next_reminder"] == "2026-11-26"
