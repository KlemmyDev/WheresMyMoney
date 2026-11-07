"""Investments: funds and trades entered by hand, holdings at average cost, prices looked up once a day, the history
and distributions."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.features.investments import service as inv
from tests.conftest import dollars, ok


def fund(client: TestClient, ticker: str = "VAS", group: str = "aus", target: float | None = 0.5) -> int:
    body = {"ticker": ticker, "name": ticker, "group": group, "target": target}
    return int(ok(client.post("/api/investments/funds", json=body))["id"])


def trade(client: TestClient, fund_id: int, side: str, units: float, price: float, date: str) -> Any:
    return client.post(
        "/api/investments/trades",
        json={"fund_id": fund_id, "side": side, "units": units, "price": dollars(price), "date": date},
    )


def test_holdings_at_average_cost(client: TestClient) -> None:
    vas = fund(client)
    ok(trade(client, vas, "buy", 10, 100, "2026-01-05"))
    ok(trade(client, vas, "buy", 10, 120, "2026-03-05"))
    p = ok(trade(client, vas, "sell", 5, 130, "2026-06-01"))
    f = p["funds"][0]
    assert f["units"] == 15
    assert f["cost"] == dollars(15 * 110)  # the sale took its share at the average, $110
    assert f["realised"] == dollars(5 * 20)
    assert f["price"] == dollars(130)  # no price looked up yet: the last trade's
    assert f["value"] == dollars(15 * 130) and f["gain"] == dollars(15 * 20)
    assert [t["side"] for t in p["trades"]] == ["sell", "buy", "buy"]


def test_cant_sell_more_than_held(client: TestClient) -> None:
    vas = fund(client)
    ok(trade(client, vas, "buy", 10, 100, "2026-01-05"))
    r = trade(client, vas, "sell", 11, 100, "2026-02-01")
    assert r.status_code == 422 and "10 units" in r.text
    assert trade(client, vas, "sell", 5, 100, "2025-12-01").status_code == 422  # before it was bought


def test_a_fund_with_trades_stays(client: TestClient) -> None:
    vas = fund(client)
    ok(trade(client, vas, "buy", 1, 100, "2026-01-05"))
    assert client.delete(f"/api/investments/funds/{vas}").status_code == 422
    assert client.post("/api/investments/funds", json={"ticker": "vas"}).status_code == 422  # already here


def test_prices_value_the_holding_and_draw_the_history(client: TestClient) -> None:
    vas = fund(client)
    ok(trade(client, vas, "buy", 10, 100, "2026-10-01"))
    svc = client.app.state.services.investments  # type: ignore[attr-defined]
    svc.save_prices(vas, {"2026-11-10": dollars(104), "2026-11-11": dollars(105)})
    p = ok(client.get("/api/investments"))
    assert p["total"] == dollars(1050) and p["day"] == dollars(10) and p["price_date"] == "2026-11-11"
    h = ok(client.get("/api/investments/history?range=1m"))
    assert h[0]["date"] == "2026-10-12" and h[0]["value"] == dollars(1000)  # before a close: the trade's price
    assert h[-1] == {"date": "2026-11-12", "value": dollars(1050), "cost": dollars(1000)}


def test_looking_prices_up(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    vas = fund(client)
    asked: list[str] = []

    def fake(url: str, timeout: float = 15) -> Any:
        asked.append(url)
        # 10:00 UTC on 10 and 11 November, Sydney 11 hours ahead.
        return {
            "chart": {
                "result": [
                    {
                        "meta": {"gmtoffset": 39600},
                        "timestamp": [1794304800, 1794391200],
                        "indicators": {"quote": [{"close": [101.2, None]}]},
                    }
                ]
            }
        }

    monkeypatch.setattr(inv, "get_json", fake)
    r = ok(client.post("/api/investments/prices"))
    assert r["updated"] == ["VAS"] and "VAS.AX" in asked[0] and "range=5y" in asked[0]
    svc = client.app.state.services.investments  # type: ignore[attr-defined]
    with svc.db.reading() as conn:
        assert conn.execute("SELECT date, close FROM prices WHERE fund_id = ?", (vas,)).fetchall() == [
            ("2026-11-10", 10120.0)
        ]
    ok(client.post("/api/investments/prices"))
    assert "range=1mo" in asked[1]  # only the last month once some are known
    assert inv.symbol("VTI.US") == "VTI.US" and inv.symbol("vgs") == "VGS.AX"


def test_distributions_come_from_dividends(client: TestClient, household: dict) -> None:
    dividends = next(c["id"] for c in ok(client.get("/api/categories"))["categories"] if c["name"] == "Dividends")
    for day, amount in (("2025-10-16", 356), ("2026-07-16", 462)):
        ok(
            client.post(
                "/api/transactions",
                json={
                    "account_id": household["Offset"],
                    "amount": dollars(amount),
                    "description": "VANGUARD DIST",
                    "category_id": dividends,
                    "date": day,
                },
            )
        )
    d = ok(client.get("/api/investments"))["distributions"]
    assert d["year_total"] == dollars(462)
    q = {x["quarter"]: x for x in d["quarters"]}
    assert q["2026-Q3"]["amount"] == dollars(462) and not q["2026-Q3"]["likely"]
    assert q["2026-Q4"] == {"quarter": "2026-Q4", "start": "2026-10-01", "amount": dollars(356), "likely": True}
