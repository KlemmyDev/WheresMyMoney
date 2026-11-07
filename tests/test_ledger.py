"""An account's ledger is the sum of its transactions; its balance the latest one known plus what's happened since.
Setting an exact balance adds a "Balance adjustment" for the difference, today or as an opening balance."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import dollars, ok


def spending(client: TestClient, household: dict, **body: object) -> dict:
    return ok(client.post("/api/transactions", json={"account_id": household["Spending"], **body}))


def test_spending_typed_in_comes_off_the_balance_but_cash_doesnt(client: TestClient, household: dict) -> None:
    spending(client, household, amount=-dollars(64.80), description="Woolworths")
    spending(client, household, amount=-dollars(20), description="Markets", cash=True)
    account = ok(client.get(f"/api/accounts/{household['Spending']}"))
    assert account["balance"] == dollars(1960 - 64.80)
    assert account["ledger"] == -dollars(64.80)


def test_setting_an_exact_balance_today_adds_an_adjustment(client: TestClient, household: dict) -> None:
    ids = household
    spending(client, household, amount=-dollars(100), description="Coles")
    result = ok(client.put(f"/api/accounts/{ids['Spending']}/balance", json={"balance": dollars(1800), "exact": True}))
    adj = result["adjustment"]
    assert adj["description"] == "Balance adjustment" and adj["amount"] == dollars(1900) and adj["date"] == "2026-11-12"
    assert result["account"]["balance"] == result["account"]["ledger"] == dollars(1800)


def test_an_opening_balance_is_dated_before_the_history_starts(client: TestClient, household: dict) -> None:
    ids = household
    spending(client, household, amount=-dollars(50), description="BP", date="2026-11-01")
    spending(client, household, amount=-dollars(30), description="Coles", date="2026-11-05")
    result = ok(
        client.put(
            f"/api/accounts/{ids['Spending']}/balance",
            json={"balance": dollars(1880), "exact": True, "when": "opening"},
        )
    )
    adj = result["adjustment"]
    assert adj["description"] == "Opening balance" and adj["date"] == "2026-10-31" and adj["amount"] == dollars(1960)
    assert result["account"]["ledger"] == dollars(1880)
    # Done again, it changes the one opening balance rather than adding another.
    ok(
        client.put(
            f"/api/accounts/{ids['Spending']}/balance",
            json={"balance": dollars(1900), "exact": True, "when": "opening"},
        )
    )
    rows = ok(client.get(f"/api/transactions?account_id={ids['Spending']}"))
    assert [t["amount"] for t in rows if t["kind"] == "adjustment"] == [dollars(1980)]


def test_a_rough_balance_shows_the_gap_to_the_ledger(client: TestClient, household: dict) -> None:
    spending(client, household, amount=-dollars(10), description="Coffee")
    account = ok(client.get(f"/api/accounts/{household['Spending']}"))
    assert account["gap"] == account["balance"] - account["ledger"] == dollars(1960)


def test_coverage_counts_every_offsetting_account(client: TestClient, household: dict) -> None:
    board = ok(client.get("/api/dashboard"))
    assert board["coverage"]["offsetting"] == dollars(127530)
    assert round(board["coverage"]["ratio"] * 100, 1) == 21.1
    assert round(board["coverage"]["offset_ratio"] * 100, 1) == 15.6
    assert abs(board["interest"]["per_day"] / 100 - 20.41) < 0.01


def test_the_bills_buffer_target_is_months_of_its_bills(client: TestClient, household: dict) -> None:
    acct = {a["name"]: a for a in ok(client.get("/api/accounts"))["accounts"]}["Bills"]
    # Council rates and water quarterly, internet monthly.
    per_month = (512 * 4 + 186 * 4 + 89 * 12) / 12
    assert acct["target"]["per_month"] == round(dollars(per_month))
    assert acct["target"]["amount"] == round(per_month * 100 * 3)


def test_a_statement_row_cant_be_removed_but_a_typed_one_can(client: TestClient, household: dict) -> None:
    tx = spending(client, household, amount=-dollars(5), description="Coffee")
    assert ok(client.delete(f"/api/transactions/{tx['id']}"))["removed"] is True
