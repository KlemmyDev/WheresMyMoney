"""The set-up guide's progress, settings, and the demo household."""

from __future__ import annotations

from dataclasses import replace

from fastapi.testclient import TestClient

from app.core.config import Config
from app.main import create_app
from tests.conftest import ok


def test_a_new_household_is_shown_the_guide_until_it_finishes(client: TestClient) -> None:
    state = ok(client.get("/api/setup"))
    assert state["show"] is True and not any(state["steps"].values())
    ok(client.post("/api/accounts", json={"name": "Offset", "role": "offset", "balance": 100}))
    assert ok(client.get("/api/setup"))["steps"]["accounts"] is True
    done = ok(client.post("/api/setup/finish", json={"reminder": "weekly"}))
    assert done["done"] is True and done["show"] is False and done["settings"]["reminder"] == "weekly"


def test_the_reminders_step_ticks_off_without_finishing_the_guide(client: TestClient) -> None:
    state = ok(client.post("/api/setup/reminders", json={"reminder": "monthly", "detail": "balances"}))
    assert state["steps"]["reminders"] is True and state["done"] is False and state["show"] is True
    assert state["settings"]["reminder"] == "monthly" and state["settings"]["detail"] == "balances"


def test_the_first_check_in_ticks_off_its_step(client: TestClient) -> None:
    offset = ok(client.post("/api/accounts", json={"name": "Offset", "role": "offset", "balance": 100}))
    assert ok(client.get("/api/setup"))["steps"]["checkin"] is False
    ok(client.post("/api/checkins", json={"balances": {offset["id"]: 20000}}))
    assert ok(client.get("/api/setup"))["steps"]["checkin"] is True


def test_settings_are_checked(client: TestClient) -> None:
    assert client.put("/api/settings", json={"reminder": "hourly"}).status_code == 422
    assert client.put("/api/settings", json={"nonsense": 1}).status_code == 422
    assert ok(client.put("/api/settings", json={"household": "The Smiths"}))["settings"]["household"] == "The Smiths"


def test_the_demo_household_fills_an_empty_database(config: Config) -> None:
    with TestClient(create_app(replace(config, demo=True), serve_web=False)) as c:
        board = ok(c.get("/api/dashboard"))
        assert [a["name"] for a in board["accounts"]] == ["Offset", "Bills", "Spending", "Savings"]
        assert board["coverage"]["ratio"] > 0.1
        assert len(board["flow"]) == 6 and board["flow"][0]["in"] > 0
        assert ok(c.get("/api/setup"))["show"] is False
    # And never again: a second start leaves it as it is.
    with TestClient(create_app(replace(config, demo=True), serve_web=False)) as c:
        assert len(ok(c.get("/api/accounts"))["accounts"]) == 4


def test_healthz(client: TestClient) -> None:
    assert ok(client.get("/healthz"))["ok"] is True


def test_a_backup_is_made_when_asked_and_listed(client: TestClient) -> None:
    made = ok(client.post("/api/backups"))
    assert made["made"]["kind"] == "manual" and made["made"]["size"] > 0
    assert [b["name"] for b in ok(client.get("/api/backups"))["backups"]] == [made["made"]["name"]]


def test_cash_flow_counts_pay_but_not_transfers(config: Config) -> None:
    with TestClient(create_app(replace(config, demo=True), serve_web=False)) as c:
        flow = ok(c.get("/api/dashboard"))["flow"]
        full = [m for m in flow if not m["partial"]]
        # Two or three pays a month come in; transfers between accounts don't count either way.
        assert all(m["in"] >= 2 * 695000 for m in full)
        assert all(m["in"] > m["out"] for m in full)
