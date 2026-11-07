"""
Investments: the ETFs the household holds, entered by hand when they buy or sell, valued at each fund's close.

- Holdings are worked out from the trades: units held, and what they cost (average cost: a sale takes its share of
  the cost at the average so far, and the rest is a realised gain or loss).
- Prices are each fund's close for the day, looked up once a day after the market shuts (Yahoo Finance's public
  chart data, no account). It's the only thing about the household's money that leaves the house, and all it says is
  which tickers. Until a price is known, the last trade's price stands in.
- Distributions are what's come in to the household's accounts sorted as Dividends.
- The mix is each fund's share of the portfolio against its target, and "Putting more in?" splits a sum to bring the
  mix back towards the targets. Facts from the household's own numbers, not advice.

Money is in cents; a price may have fractions of a cent (44.975 dollars is 4497.5).
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import logging
import sqlite3
import time
import urllib.parse
from dataclasses import dataclass, field
from typing import Any

from app.core import dates
from app.core.database import Database
from app.core.http import get_json

log = logging.getLogger(__name__)

GROUPS = {
    "aus": "Australian shares",
    "intl": "International shares",
    "bonds": "Bonds",
    "property": "Property",
    "cash": "Cash",
    "other": "Other",
}
RANGES = {"1m": 31, "6m": 183, "1y": 366, "5y": 1827}
CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range}&interval=1d"
CHECKED = "investments:prices_checked"  # kv: when prices were last looked up, and how it went
AFTER_CLOSE = 17  # the hour (local) from which today's close is looked for
EVERY = 3600  # how often the background loop wakes to see whether a look-up is due


def symbol(ticker: str) -> str:
    """What to look a ticker up as: an ASX code unless it names its own market (VTI.US, or with a dot already)."""
    t = ticker.strip().upper()
    return t if "." in t else f"{t}.AX"


@dataclass
class Holding:
    units: float = 0.0
    cost: float = 0.0  # what the units held cost, in cents (average cost)
    realised: float = 0.0
    first: str | None = None
    put_in: float = 0.0  # cash put in less cash taken out, in cents
    trades: list[tuple[str, str, float, float, int]] = field(default_factory=list)


def _walk(trades: list[tuple[str, str, float, float, int]], until: str | None = None) -> Holding:
    """A fund's holding from its trades (date, side, units, price, fee), up to and including `until`."""
    h = Holding()
    for day, side, units, price, fee in trades:
        if until is not None and day > until:
            break
        h.first = h.first or day
        if side == "buy":
            h.units += units
            h.cost += units * price + fee
            h.put_in += units * price + fee
        else:
            share = h.cost * (units / h.units) if h.units else 0.0
            h.cost -= share
            h.units -= units
            h.realised += units * price - fee - share
            h.put_in -= units * price - fee
        if h.units < 1e-9:
            h.units, h.cost = 0.0, 0.0
    return h


class InvestmentsService:
    def __init__(self, db: Database):
        self.db = db
        self._task: asyncio.Task[None] | None = None

    # -- funds and trades -------------------------------------------------------------------------

    def _funds(self, conn: sqlite3.Connection) -> list[dict[str, Any]]:
        rows = conn.execute("SELECT id, ticker, name, grp, target, fee_pct FROM funds ORDER BY sort, id").fetchall()
        return [
            {"id": r[0], "ticker": r[1], "name": r[2], "group": r[3], "target": r[4], "fee_pct": r[5]} for r in rows
        ]

    def _trades(self, conn: sqlite3.Connection) -> dict[int, list[tuple[str, str, float, float, int]]]:
        out: dict[int, list[tuple[str, str, float, float, int]]] = {}
        for fund_id, day, side, units, price, fee in conn.execute(
            "SELECT fund_id, date, side, units, price, fee FROM trades ORDER BY date, id"
        ):
            out.setdefault(fund_id, []).append((day, side, units, price, fee))
        return out

    def save_fund(self, body: dict[str, Any], fund_id: int | None = None) -> dict[str, Any]:
        """Add a fund ({"ticker": "VAS", "name": "Australian shares", "group": "aus", "target": 0.5}) or change one."""
        with self.db.writing() as conn:
            was: dict[str, Any] = {}
            if fund_id is not None:
                row = conn.execute(
                    "SELECT ticker, name, grp, target, fee_pct FROM funds WHERE id = ?", (fund_id,)
                ).fetchone()
                if row is None:
                    raise LookupError("That fund has gone.")
                was = dict(zip(("ticker", "name", "group", "target", "fee_pct"), row, strict=True))
            body = {**was, **body}
            ticker = str(body.get("ticker") or "").strip().upper()[:12]
            if not ticker or not all(c.isalnum() or c == "." for c in ticker):
                raise ValueError("Enter the fund's code, like VAS.")
            name = " ".join(str(body.get("name") or "").split())[:60] or ticker
            group = str(body.get("group") or "other")
            if group not in GROUPS:
                raise ValueError("Choose what kind of fund it is.")
            target = body.get("target")
            try:
                target = None if target in (None, "") else float(target)
            except (TypeError, ValueError):
                raise ValueError("The target is a share of the portfolio, like 0.5 for half.") from None
            if target is not None and not 0 <= target <= 1:
                raise ValueError("The target is a share of the portfolio, between 0 and 1.")
            fee = body.get("fee_pct")
            try:
                fee = None if fee in (None, "") else float(fee)
            except (TypeError, ValueError):
                raise ValueError("The management fee is a share a year, like 0.0007 for 0.07%.") from None
            if fee is not None and not 0 <= fee <= 0.03:
                raise ValueError("The management fee is between 0% and 3% a year.")
            taken = conn.execute("SELECT 1 FROM funds WHERE ticker = ? AND id != ?", (ticker, fund_id or 0)).fetchone()
            if taken:
                raise ValueError(f"{ticker} is already here.")
            if fund_id is None:
                cur = conn.execute(
                    "INSERT INTO funds (ticker, name, grp, target, fee_pct, sort, created_at) VALUES (?, ?, ?, ?, ?,"
                    " (SELECT COALESCE(MAX(sort), 0) + 1 FROM funds), ?)",
                    (ticker, name, group, target, fee, int(time.time())),
                )
                fund_id = int(cur.lastrowid or 0)
            else:
                conn.execute(
                    "UPDATE funds SET ticker = ?, name = ?, grp = ?, target = ?, fee_pct = ? WHERE id = ?",
                    (ticker, name, group, target, fee, fund_id),
                )
        return next(f for f in self.overview()["funds"] if f["id"] == fund_id)

    def remove_fund(self, fund_id: int) -> bool:
        with self.db.writing() as conn:
            if conn.execute("SELECT 1 FROM trades WHERE fund_id = ? LIMIT 1", (fund_id,)).fetchone():
                raise ValueError("It has trades: delete those first, or keep it for its history.")
            conn.execute("DELETE FROM prices WHERE fund_id = ?", (fund_id,))
            return conn.execute("DELETE FROM funds WHERE id = ?", (fund_id,)).rowcount > 0

    def add_trade(self, body: dict[str, Any]) -> dict[str, Any]:
        """A trade: {"fund_id": 1, "side": "buy", "units": 15, "price": 13120, "fee": 0, "date": "2026-09-01"}."""
        try:
            fund_id = int(body.get("fund_id"))  # type: ignore[arg-type]
            units = float(body.get("units"))  # type: ignore[arg-type]
            price = float(body.get("price"))  # type: ignore[arg-type]
            fee = int(body.get("fee") or 0)
        except (TypeError, ValueError):
            raise ValueError("Enter the fund, the units and the price each.") from None
        side = str(body.get("side") or "buy")
        if side not in ("buy", "sell"):
            raise ValueError("Was it bought or sold?")
        if units <= 0 or price <= 0 or fee < 0:
            raise ValueError("Enter the units and the price each.")
        try:
            day = dates.parse(str(body.get("date") or dates.today().isoformat()))
        except ValueError:
            raise ValueError("That date isn't one we can read.") from None
        if day > dates.today():
            raise ValueError("That's in the future: add it on the day.")
        with self.db.writing() as conn:
            if not conn.execute("SELECT 1 FROM funds WHERE id = ?", (fund_id,)).fetchone():
                raise LookupError("That fund has gone.")
            if side == "sell":
                held = _walk(self._trades(conn).get(fund_id, []), day.isoformat()).units
                if units > held + 1e-9:
                    raise ValueError(f"That's more than the {held:g} units held then.")
            cur = conn.execute(
                "INSERT INTO trades (fund_id, date, side, units, price, fee, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (fund_id, day.isoformat(), side, units, price, fee, int(time.time())),
            )
            trade_id = int(cur.lastrowid or 0)
        return next(t for t in self.overview()["trades"] if t["id"] == trade_id)

    def remove_trade(self, trade_id: int) -> bool:
        with self.db.writing() as conn:
            return conn.execute("DELETE FROM trades WHERE id = ?", (trade_id,)).rowcount > 0

    # -- prices ----------------------------------------------------------------------------------

    def _price_on(self, conn: sqlite3.Connection, fund_id: int, day: str) -> tuple[str, float] | None:
        row = conn.execute(
            "SELECT date, close FROM prices WHERE fund_id = ? AND date <= ? ORDER BY date DESC LIMIT 1",
            (fund_id, day),
        ).fetchone()
        return (row[0], row[1]) if row else None

    def save_prices(self, fund_id: int, closes: dict[str, float]) -> int:
        """Store a fund's closes ({"2026-11-06": 10120.0}). Returns how many."""
        with self.db.writing() as conn:
            conn.executemany(
                "INSERT INTO prices (fund_id, date, close) VALUES (?, ?, ?)"
                " ON CONFLICT (fund_id, date) DO UPDATE SET close = excluded.close",
                [(fund_id, d, c) for d, c in closes.items()],
            )
        return len(closes)

    def fetch_closes(self, ticker: str, span: str) -> dict[str, float]:
        """A fund's daily closes from Yahoo Finance's chart data, by the exchange's own date, in cents."""
        url = CHART.format(symbol=urllib.parse.quote(symbol(ticker)), range=span)
        data = get_json(url, timeout=20)
        result = ((data or {}).get("chart") or {}).get("result") or []
        if not result:
            raise ValueError(f"No prices for {ticker}.")
        r = result[0]
        offset = int((r.get("meta") or {}).get("gmtoffset") or 0)
        stamps = r.get("timestamp") or []
        closes = (((r.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
        out: dict[str, float] = {}
        for ts, close in zip(stamps, closes, strict=False):
            if close is None:
                continue
            day = dt.datetime.fromtimestamp(ts + offset, dt.UTC).date().isoformat()
            out[day] = round(float(close) * 100, 3)
        return out

    def refresh_prices(self) -> dict[str, Any]:
        """Look every fund's prices up: five years the first time, the last month after that."""
        with self.db.reading() as conn:
            funds = self._funds(conn)
            known = {f: d for f, d in conn.execute("SELECT fund_id, MAX(date) FROM prices GROUP BY fund_id")}
        done: list[str] = []
        failed: list[str] = []
        for f in funds:
            try:
                closes = self.fetch_closes(f["ticker"], "1mo" if known.get(f["id"]) else "5y")
                self.save_prices(f["id"], closes)
                done.append(f["ticker"])
            except Exception as e:  # one fund failing mustn't stop the rest
                log.warning("Couldn't look up %s's price: %s", f["ticker"], e)
                failed.append(f["ticker"])
        now = dt.datetime.now(dates.zone()).isoformat(timespec="minutes")
        with self.db.writing() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
                (CHECKED, f"{now}|{','.join(failed)}"),
            )
        return {"checked": now, "updated": done, "failed": failed}

    def checked(self) -> tuple[str | None, list[str]]:
        with self.db.reading() as conn:
            row = conn.execute("SELECT value FROM kv WHERE key = ?", (CHECKED,)).fetchone()
        if not row:
            return None, []
        when, _, failed = str(row[0]).partition("|")
        return when, [t for t in failed.split(",") if t]

    def due(self) -> bool:
        """Whether a look-up is due: there are funds, and today's close hasn't been looked for since the market shut."""
        with self.db.reading() as conn:
            if not conn.execute("SELECT 1 FROM funds LIMIT 1").fetchone():
                return False
        when, _ = self.checked()
        now = dt.datetime.now(dates.zone())
        if when is None:
            return True
        last = dt.datetime.fromisoformat(when)
        if now.hour >= AFTER_CLOSE:
            return last < now.replace(hour=AFTER_CLOSE, minute=0, second=0, microsecond=0)
        return last.date() < (now - dt.timedelta(days=1)).date()

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _run(self) -> None:
        await asyncio.sleep(90)
        while True:
            try:
                if await asyncio.to_thread(self.due):
                    await asyncio.to_thread(self.refresh_prices)
            except Exception:  # a look-up must never end the loop
                log.exception("Looking up fund prices failed")
            await asyncio.sleep(EVERY)

    # -- what's shown ----------------------------------------------------------------------------

    def overview(self, loan_rate_bp: int | None = None) -> dict[str, Any]:
        """The portfolio: each fund's holding and value, the totals, the mix against targets, trades and
        distributions."""
        today = dates.today().isoformat()
        with self.db.reading() as conn:
            funds = self._funds(conn)
            trades = self._trades(conn)
            rows = []
            for f in funds:
                h = _walk(trades.get(f["id"], []))
                last = self._price_on(conn, f["id"], today)
                prev = (
                    self._price_on(conn, f["id"], (dates.parse(last[0]) - dt.timedelta(days=1)).isoformat())
                    if last
                    else None
                )
                last_trade = trades.get(f["id"], [])[-1] if trades.get(f["id"]) else None
                price = last[1] if last else (last_trade[3] if last_trade else None)
                value = h.units * price if price is not None else 0.0
                rows.append(
                    {
                        **f,
                        "group_name": GROUPS.get(f["group"], "Other"),
                        "units": round(h.units, 6),
                        "price": price,
                        "price_date": last[0] if last else None,
                        "value": round(value),
                        "cost": round(h.cost),
                        "gain": round(value - h.cost),
                        "realised": round(h.realised),
                        "day": round(h.units * (last[1] - prev[1])) if last and prev else 0,
                        "first": h.first,
                        "put_in": h.put_in,
                    }
                )
            all_trades = conn.execute(
                "SELECT t.id, t.fund_id, f.ticker, t.date, t.side, t.units, t.price, t.fee FROM trades t"
                " JOIN funds f ON f.id = t.fund_id ORDER BY t.date DESC, t.id DESC LIMIT 50"
            ).fetchall()
            distributions = self._distributions(conn)
        total = sum(r["value"] for r in rows)
        cost = sum(r["cost"] for r in rows)
        for r in rows:
            r["share"] = r["value"] / total if total else 0
        firsts = [r["first"] for r in rows if r["first"]]
        first = min(firsts) if firsts else None
        put_in = sum(r.pop("put_in") for r in rows)
        realised = sum(r["realised"] for r in rows)
        years = (dates.today() - dates.parse(first)).days / 365.25 if first else 0
        # A simple yearly rate since the first buy: what's there now against the cash put in (less cash taken out).
        growth = total / put_in if put_in > 0 and total > 0 else None
        annual = growth ** (1 / years) - 1 if growth and years >= 0.5 else None
        price_dates = [r["price_date"] for r in rows if r["price_date"]]
        when, failed = self.checked()
        return {
            "funds": rows,
            "total": total,
            "cost": cost,
            "gain": total - cost,
            "realised": realised,
            "day": sum(r["day"] for r in rows),
            "price_date": max(price_dates) if price_dates else None,
            "checked": when,
            "failed": failed,
            "first": first,
            "annual": annual,
            "loan_rate_bp": loan_rate_bp,
            "targets_set": any(r["target"] for r in rows),
            "trades": [
                {
                    "id": t[0],
                    "fund_id": t[1],
                    "ticker": t[2],
                    "date": t[3],
                    "side": t[4],
                    "units": t[5],
                    "price": t[6],
                    "fee": t[7],
                    "amount": round(t[5] * t[6] + (t[7] if t[4] == "buy" else -t[7])),
                }
                for t in all_trades
            ],
            "distributions": distributions,
            "groups": GROUPS,
        }

    def _distributions(self, conn: sqlite3.Connection) -> dict[str, Any]:
        """What's come in sorted as Dividends: the last year's total, and each quarter for two years, with the
        quarter to come likely to be what the same quarter paid last year."""
        today = dates.today()
        start = dates.add_months(today.replace(day=1), -24)
        rows = conn.execute(
            "SELECT t.date, t.amount FROM transactions t JOIN categories c ON c.id = t.category_id"
            " WHERE c.name = 'Dividends' AND t.amount > 0 AND t.date >= ?",
            (start.isoformat(),),
        ).fetchall()
        quarters: dict[str, int] = {}
        year_ago = (today - dt.timedelta(days=365)).isoformat()
        year_total = 0
        for day, amount in rows:
            d = dates.parse(day)
            key = f"{d.year}-Q{(d.month - 1) // 3 + 1}"
            quarters[key] = quarters.get(key, 0) + amount
            if day > year_ago:
                year_total += amount
        out = []
        q_start = dt.date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)
        for n in range(-7, 2):
            d = dates.add_months(q_start, 3 * n)
            key = f"{d.year}-Q{(d.month - 1) // 3 + 1}"
            last_year = f"{d.year - 1}-Q{(d.month - 1) // 3 + 1}"
            future = n > 0 or (n == 0 and key not in quarters)
            out.append(
                {
                    "quarter": key,
                    "start": d.isoformat(),
                    "amount": quarters.get(last_year, 0) if future else quarters.get(key, 0),
                    "likely": future,
                }
            )
        return {"year_total": year_total, "quarters": out}

    def history(self, span: str) -> list[dict[str, Any]]:
        """The portfolio's value and what had been put in (its cost), sampled across the span: daily for a month,
        weekly up to a year, fortnightly for five."""
        days = RANGES.get(span, 366)
        step = 1 if days <= 31 else 7 if days <= 366 else 14
        today = dates.today()
        with self.db.reading() as conn:
            funds = self._funds(conn)
            trades = self._trades(conn)
            first = min((t[0][0] for t in trades.values() if t), default=None)
            if first is None:
                return []
            begin = max(today - dt.timedelta(days=days), dates.parse(first))
            closes: dict[int, list[tuple[str, float]]] = {
                f["id"]: conn.execute(
                    "SELECT date, close FROM prices WHERE fund_id = ? AND date >= ? ORDER BY date",
                    (f["id"], (begin - dt.timedelta(days=10)).isoformat()),
                ).fetchall()
                for f in funds
            }
        samples = []
        d = begin
        while True:
            samples.append(d)
            if d >= today:
                break
            d = min(d + dt.timedelta(days=step), today)
        return [
            {"date": day.isoformat(), "value": round(v), "cost": round(c)}
            for day, (v, c) in zip(samples, self._values(funds, trades, closes, samples), strict=True)
        ]

    def values_on(self, days: list[dt.date]) -> list[int]:
        """The portfolio's value at the end of each of these days (in order), in cents."""
        if not days:
            return []
        with self.db.reading() as conn:
            funds = self._funds(conn)
            trades = self._trades(conn)
            closes = {
                f["id"]: conn.execute(
                    "SELECT date, close FROM prices WHERE fund_id = ? AND date >= ? ORDER BY date",
                    (f["id"], (days[0] - dt.timedelta(days=10)).isoformat()),
                ).fetchall()
                for f in funds
            }
        return [round(v) for v, _ in self._values(funds, trades, closes, days)]

    def _values(
        self,
        funds: list[dict[str, Any]],
        trades: dict[int, list[tuple[str, str, float, float, int]]],
        closes: dict[int, list[tuple[str, float]]],
        samples: list[dt.date],
    ) -> list[tuple[float, float]]:
        """Value and cost at each sample day (in order): units held then at the close on or before the day."""
        out = []
        idx = {f: 0 for f in closes}
        for day in samples:
            iso = day.isoformat()
            value = 0.0
            cost = 0.0
            for f in funds:
                ft = trades.get(f["id"], [])
                h = _walk(ft, iso)
                if h.units <= 0:
                    continue
                series = closes[f["id"]]
                i = idx[f["id"]]
                while i + 1 < len(series) and series[i + 1][0] <= iso:
                    i += 1
                idx[f["id"]] = i
                price = series[i][1] if series and series[i][0] <= iso else None
                if price is None:  # before any close is known: the last trade's price
                    price = next((t[3] for t in reversed(ft) if t[0] <= iso), 0.0)
                value += h.units * price
                cost += h.cost
            out.append((value, cost))
        return out
