from __future__ import annotations

import datetime as dt
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core import dates
from app.core.config import Config
from app.main import create_app

# The designs' payday: Thursday 12 November 2026.
TODAY = dt.date(2026, 11, 12)


@pytest.fixture(autouse=True)
def _today() -> Iterator[None]:
    dates.set_today(TODAY)
    yield
    dates.set_today(None)


@pytest.fixture
def config(tmp_path: Path) -> Config:
    return Config(db_path=str(tmp_path / "test.db"), auth=False, background=False)


@pytest.fixture
def client(config: Config) -> Iterator[TestClient]:
    with TestClient(create_app(config, serve_web=False)) as c:
        yield c


def ok(response: Any) -> Any:
    assert response.status_code == 200, response.text
    return response.json()


def dollars(n: float) -> int:
    return round(n * 100)


@pytest.fixture
def household(client: TestClient) -> dict[str, Any]:
    """The designs' household: four accounts offsetting a $604,820 loan, with balances checked in on 29 October."""
    dates.set_today(dt.date(2026, 10, 29))
    ids: dict[str, int] = {}
    for name, role, last4, bal, extra in [
        ("Offset", "offset", "2210", 94600, {}),
        ("Bills", "bills", "2238", 8120, {"target_months": 3}),
        ("Spending", "spending", "2241", 1960, {"allowance": dollars(3200)}),
        ("Savings", "savings", "2256", 22850, {}),
    ]:
        ids[name] = ok(
            client.post(
                "/api/accounts", json={"name": name, "role": role, "last4": last4, "balance": dollars(bal), **extra}
            )
        )["id"]
    ids["Loan"] = ok(
        client.post(
            "/api/accounts",
            json={
                "name": "Home loan",
                "kind": "loan",
                "rate_bp": 584,
                "repayment": dollars(3770),
                "repay_from": ids["Offset"],
                "balance": dollars(604820),
            },
        )
    )["id"]
    # The first check-in: the balances above.
    ok(
        client.post(
            "/api/checkins",
            json={"balances": {}}
            | {
                "balances": {
                    str(ids[k]): v
                    for k, v in {
                        "Offset": dollars(94600),
                        "Bills": dollars(8120),
                        "Spending": dollars(1960),
                        "Savings": dollars(22850),
                    }.items()
                }
            },
        )
    )
    for name, amount, day in [
        ("Council rates", 512, "2026-11-10"),
        ("Internet", 89, "2026-11-12"),
        ("Water", 186, "2026-11-15"),
    ]:
        every = "quarterly" if name in ("Council rates", "Water") else "monthly"
        ok(
            client.post(
                "/api/bills",
                json={
                    "name": name,
                    "amount": dollars(amount),
                    "every": every,
                    "next_due": day,
                    "account_id": ids["Bills"],
                },
            )
        )
    for body in [
        {
            "kind": "pay",
            "to_account": ids["Offset"],
            "amount": dollars(6950),
            "every": "fortnightly",
            "anchor": "2026-11-12",
            "label": "Pay",
        },
        {
            "kind": "transfer",
            "from_account": ids["Offset"],
            "to_account": ids["Bills"],
            "amount": dollars(1200),
            "every": "fortnightly",
            "anchor": "2026-11-12",
            "label": "Payday to Bills",
        },
        {
            "kind": "transfer",
            "from_account": ids["Offset"],
            "to_account": ids["Savings"],
            "amount": dollars(300),
            "every": "fortnightly",
            "anchor": "2026-11-12",
            "label": "Payday to Savings",
        },
        {
            "kind": "top_up",
            "from_account": ids["Offset"],
            "to_account": ids["Spending"],
            "amount": dollars(3200),
            "every": "monthly",
            "anchor": "2026-10-25",
            "label": "Monthly top-up",
        },
    ]:
        ok(client.post("/api/rules", json=body))
    dates.set_today(TODAY)
    return ids
