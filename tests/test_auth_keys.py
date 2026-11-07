"""Sign-in for the household (a set-up code for the first account, then everyone else added), and API keys: shown
once, kept as a hash, each opening only the /api/v1 routes its permissions allow."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import Config
from app.features.keys.service import DEFAULT_SCOPES
from app.main import create_app
from tests.conftest import ok

ACCOUNT = {"username": "matt", "password": "correct horse"}


def code_of(c: TestClient) -> str:
    return c.app.state.services.auth.code_path.read_text().strip()  # type: ignore[attr-defined]


@pytest.fixture
def secured(config: Config) -> Iterator[TestClient]:
    with TestClient(create_app(replace(config, auth=True), serve_web=False)) as c:
        yield c


@pytest.fixture
def signed_in(secured: TestClient) -> TestClient:
    assert secured.post("/api/auth/setup", json={**ACCOUNT, "code": code_of(secured)}).status_code == 200
    return secured


def bearer(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def test_nothing_is_open_before_signing_in(secured: TestClient) -> None:
    assert secured.get("/api/accounts").status_code == 401
    assert secured.get("/api/auth/session").json()["setup_required"] is True


def test_the_first_account_needs_the_set_up_code(secured: TestClient) -> None:
    r = secured.post("/api/auth/setup", json={**ACCOUNT, "code": "WRONG-CODE"})
    assert r.status_code == 403
    assert secured.post("/api/auth/setup", json={**ACCOUNT, "code": code_of(secured)}).status_code == 200
    assert secured.get("/api/accounts").status_code == 200


def test_the_rest_of_the_household_gets_their_own_sign_in(signed_in: TestClient) -> None:
    added = ok(signed_in.post("/api/household", json={"username": "alex", "name": "Alex", "password": "another one"}))
    assert added["name"] == "Alex"
    assert [m["name"] for m in ok(signed_in.get("/api/household"))["members"]] == ["matt", "Alex"]
    signed_in.post("/api/auth/logout")
    assert signed_in.post("/api/auth/login", json={"username": "alex", "password": "another one"}).status_code == 200
    session = ok(signed_in.get("/api/auth/session"))
    assert session["name"] == "Alex"
    # Alex can't remove themself, but can remove someone else.
    assert signed_in.delete(f"/api/household/{added['id']}").status_code == 422


def test_whoever_adds_spending_is_noted(signed_in: TestClient) -> None:
    acct = ok(signed_in.post("/api/accounts", json={"name": "Spending", "role": "spending", "balance": 10000}))
    tx = ok(
        signed_in.post("/api/transactions", json={"account_id": acct["id"], "amount": -500, "description": "Coles"})
    )
    assert tx["who"] == "matt"


def make(c: TestClient, scopes: Any = None) -> dict[str, Any]:
    body: dict[str, Any] = {"name": "Home Hub"}
    if scopes is not None:
        body["scopes"] = scopes
    return ok(c.post("/api/keys", json=body))


def test_a_key_is_shown_once_and_only_its_hash_kept(signed_in: TestClient) -> None:
    made = make(signed_in)
    assert made["key"].startswith("wmm_") and made["scopes"] == list(DEFAULT_SCOPES)
    listed = ok(signed_in.get("/api/keys"))["keys"]
    assert "key" not in listed[0] and made["key"] not in str(listed)
    import sqlite3

    db = signed_in.app.state.services.db.path  # type: ignore[attr-defined]
    with sqlite3.connect(db) as conn:
        assert made["key"] not in str(conn.execute("SELECT * FROM api_keys").fetchall())


def test_retirement_and_check_ins_are_off_by_default(signed_in: TestClient) -> None:
    scopes = {s["id"]: s for s in ok(signed_in.get("/api/keys"))["scopes"]}
    assert scopes["retirement:read"]["default"] is False
    assert scopes["checkin:write"]["default"] is False
    assert all(scopes[s]["default"] for s in ("accounts:read", "bills:read", "spending:read", "loan:read"))


def test_a_key_opens_only_what_it_was_given(signed_in: TestClient) -> None:
    key = make(signed_in, ["accounts:read"])["key"]
    signed_in.cookies.clear()
    assert signed_in.get("/api/v1/accounts", headers=bearer(key)).status_code == 200
    assert signed_in.get("/api/v1/bills", headers=bearer(key)).status_code == 403
    assert signed_in.post("/api/v1/checkin", headers=bearer(key), json={"balances": {}}).status_code == 403
    assert signed_in.get("/api/v1/accounts").status_code == 401
    assert signed_in.get("/api/v1/accounts", headers=bearer("wmm_nope")).status_code == 401
    # A key never opens the app's own routes.
    assert signed_in.get("/api/accounts", headers=bearer(key)).status_code == 401


def test_a_check_in_key_sends_rough_balances(signed_in: TestClient) -> None:
    acct = ok(signed_in.post("/api/accounts", json={"name": "Offset", "role": "offset", "balance": 100000}))
    key = make(signed_in, ["checkin:write", "accounts:read"])["key"]
    signed_in.cookies.clear()
    r = ok(signed_in.post("/api/v1/checkin", headers=bearer(key), json={"balances": {str(acct["id"]): 120000}}))
    assert r["id"]
    accounts = ok(signed_in.get("/api/v1/accounts", headers=bearer(key)))["accounts"]
    assert accounts[0]["balance"] == 120000 and accounts[0]["known"]["exact"] is False


def test_removing_a_key_stops_it(signed_in: TestClient) -> None:
    made = make(signed_in)
    ok(signed_in.delete(f"/api/keys/{made['id']}"))
    assert signed_in.get("/api/v1/ping", headers=bearer(made["key"])).status_code == 401
