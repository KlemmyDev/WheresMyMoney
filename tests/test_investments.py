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


def test_holdings_first_in_first_out(client: TestClient) -> None:
    vas = fund(client)
    ok(trade(client, vas, "buy", 10, 100, "2026-01-05"))
    ok(trade(client, vas, "buy", 10, 120, "2026-03-05"))
    p = ok(trade(client, vas, "sell", 5, 130, "2026-06-01"))
    f = p["funds"][0]
    assert f["units"] == 15
    assert f["cost"] == dollars(5 * 100 + 10 * 120)  # the sale used up the oldest parcel first
    assert f["realised"] == dollars(5 * 30)
    assert f["price"] == dollars(130)  # no price looked up yet: the last trade's
    assert f["value"] == dollars(15 * 130) and f["gain"] == dollars(15 * 130 - 1700)
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
    assert inv.symbol("btc", "crypto") == "BTC-AUD" and inv.symbol("ETH-USD", "crypto") == "ETH-USD"


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


def test_capital_gains_by_financial_year(client: TestClient) -> None:
    vas = fund(client)
    vgs = fund(client, "VGS", "intl", 0.5)
    ok(trade(client, vas, "buy", 10, 100, "2024-03-01"))  # held over a year by the sale
    ok(trade(client, vas, "buy", 10, 150, "2025-12-01"))  # under a year
    ok(trade(client, vas, "sell", 15, 160, "2026-02-01"))  # 10 long (+$600), 5 short (+$50)
    ok(trade(client, vgs, "buy", 10, 120, "2025-08-01"))
    ok(trade(client, vgs, "sell", 10, 100, "2026-03-01"))  # a $200 loss
    ok(trade(client, vgs, "buy", 4, 100, "2026-09-01"))
    ok(trade(client, vgs, "sell", 4, 110, "2026-10-01"))  # next year's
    t = ok(client.get("/api/investments/tax?year=2026"))
    assert [(s["ticker"], s["units"], s["gain"], s["long"]) for s in t["sales"]] == [
        ("VAS", 10, dollars(600), True),
        ("VAS", 5, dollars(50), False),
        ("VGS", 10, -dollars(200), False),
    ]
    # The loss comes off the short gain ($50) first, then the long one ($150), and half the rest is discounted.
    assert (t["short"], t["long"], t["losses"]) == (dollars(50), dollars(600), dollars(200))
    assert t["net"] == dollars(450 / 2) and t["discount"] == dollars(225) and t["carried"] == 0
    assert t["years"] == [2027, 2026]
    parcel = t["parcels"][0]
    assert parcel["ticker"] == "VAS" and parcel["units"] == 5 and parcel["discount_from"] == "2026-12-02"
    assert not parcel["long"]
    assert ok(client.get("/api/investments/tax"))["year"] == 2027  # today's financial year


def test_platforms_and_crypto(client: TestClient) -> None:
    f = ok(
        client.post(
            "/api/investments/funds",
            json={"ticker": "BTC", "name": "Bitcoin", "kind": "crypto", "platform": " CoinSpot "},
        )
    )
    assert f["kind"] == "crypto" and f["group"] == "crypto" and f["platform"] == "CoinSpot"
    ok(trade(client, f["id"], "buy", 0.0125, 160000, "2026-06-01"))
    assert ok(client.get("/api/investments"))["funds"][0]["units"] == 0.0125
    assert client.post("/api/investments/funds", json={"ticker": "X", "kind": "bond"}).status_code == 422


def test_one_holdings_history(client: TestClient) -> None:
    vas, vgs = fund(client), fund(client, "VGS", "intl")
    ok(trade(client, vas, "buy", 10, 100, "2026-06-01"))
    ok(trade(client, vgs, "buy", 5, 200, "2026-07-01"))
    both = ok(client.get("/api/investments/history", params={"range": "1y"}))
    one = ok(client.get("/api/investments/history", params={"range": "1y", "fund": vgs}))
    assert one[0]["date"] == "2026-07-01" and one[-1]["cost"] == dollars(1000)
    assert both[-1]["cost"] == dollars(2000)


def test_the_crypto_history_leaves_the_etfs_out(client: TestClient) -> None:
    vas = fund(client)
    btc = int(
        ok(
            client.post(
                "/api/investments/funds", json={"ticker": "BTC", "name": "Bitcoin", "group": "intl", "kind": "crypto"}
            )
        )["id"]
    )
    ok(trade(client, vas, "buy", 10, 100, "2026-06-01"))
    ok(trade(client, btc, "buy", 0.01, 150000, "2026-07-01"))
    only = ok(client.get("/api/investments/history", params={"range": "1y", "crypto": "true"}))
    rest = ok(client.get("/api/investments/history", params={"range": "1y", "crypto": "false"}))
    assert only[-1]["cost"] == dollars(1500) and rest[-1]["cost"] == dollars(1000)
