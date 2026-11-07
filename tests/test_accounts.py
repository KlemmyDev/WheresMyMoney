"""Managing accounts: renaming one, removing it (its history kept) and bringing it back."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import ok


def test_renaming_an_account_keeps_its_job(client: TestClient, household: dict) -> None:
    renamed = ok(client.put(f"/api/accounts/{household['Bills']}", json={"name": "  Bills  buffer ", "last4": "9999"}))
    assert renamed["name"] == "Bills buffer" and renamed["last4"] == "9999"
    assert renamed["role"] == "bills" and renamed["target_months"] == 3


def test_an_account_needs_a_name(client: TestClient, household: dict) -> None:
    assert client.put(f"/api/accounts/{household['Bills']}", json={"name": " "}).status_code == 422


def test_removing_an_account_hides_it_and_bringing_it_back_restores_it(client: TestClient, household: dict) -> None:
    offset = household["Offset"]
    before = ok(client.get(f"/api/accounts/{offset}"))["balance"]
    assert ok(client.delete(f"/api/accounts/{offset}"))["archived"] is True
    overview = ok(client.get("/api/accounts"))
    assert offset not in [a["id"] for a in overview["accounts"]]
    assert overview["loan"]["repay_from"] is None  # the loan was paid from it
    removed = ok(client.get("/api/accounts/archived"))
    assert [a["id"] for a in removed] == [offset] and removed[0]["balance"] == before

    back = ok(client.post(f"/api/accounts/{offset}/restore"))
    assert back["id"] == offset
    assert ok(client.get(f"/api/accounts/{offset}"))["balance"] == before
    assert ok(client.get("/api/accounts/archived")) == []


def test_only_a_removed_account_can_be_brought_back(client: TestClient, household: dict) -> None:
    assert client.post(f"/api/accounts/{household['Offset']}/restore").status_code == 404


def test_a_second_loan_cant_be_brought_back(client: TestClient, household: dict) -> None:
    ok(client.delete(f"/api/accounts/{household['Loan']}"))
    ok(client.post("/api/accounts", json={"name": "New loan", "kind": "loan", "rate_bp": 600}))
    assert client.post(f"/api/accounts/{household['Loan']}/restore").status_code == 422
