"""
Balance check-ins: copy each account's balance in from the banking app, about once a payday.

What each account should hold is worked out first: its balance at the last check-in, then what the rules and bills
should have done since (app.features.rules.simulate). The check-in form is pre-filled with that. A figure typed in that
doesn't add up (more than the tolerance away) is flagged, with the rule run that would explain it: a transfer that
didn't arrive, or didn't go. A flag is dealt with by checking again tomorrow, saying it was skipped this time, or
changing the rule; the next check-in that adds up clears it.

Check-ins are rough by default: they're a balance known on the day, and never change the ledger. Ticking "these are
exact" makes each one an exact balance, adding a balance adjustment wherever the transactions don't add up to it.

Everything here blocks on SQLite, so call it through asyncio.to_thread from async code.
"""

from __future__ import annotations

import datetime as dt
import time
from typing import Any

from app.core import dates
from app.core.database import Database
from app.features.accounts import ledger, loan
from app.features.accounts.service import AccountsService
from app.features.bills.service import BillsService
from app.features.rules.service import RulesService, Simulation
from app.features.settings.store import SettingsStore

DOLLAR = 100


def _who(event: dict[str, Any], names: dict[int, str]) -> str:
    if event["kind"] == "bill":
        return str(event["name"])
    if event["kind"] == "pay":
        return "pay"
    src, dst = names.get(event.get("from") or 0, "?"), names.get(event.get("to") or 0, "?")
    return {"transfer": f"{src} → {dst}", "top_up": f"top-up of {dst}", "sweep": f"sweep {src} → {dst}"}.get(
        event["kind"], ""
    )


class CheckinService:
    def __init__(
        self,
        db: Database,
        accounts: AccountsService,
        rules: RulesService,
        bills: BillsService,
        settings: SettingsStore,
    ):
        self.db = db
        self.accounts = accounts
        self.rules = rules
        self.bills = bills
        self.settings = settings

    def tolerance(self) -> int:
        return int(self.settings.get("tolerance") or 0) * DOLLAR

    def last(self) -> dict[str, Any] | None:
        with self.db.reading() as conn:
            row = conn.execute(
                "SELECT id, date, exact, created_at FROM checkins ORDER BY date DESC, id DESC LIMIT 1"
            ).fetchone()
        return {"id": row[0], "date": row[1], "exact": bool(row[2]), "created_at": row[3]} if row else None

    def _since(self) -> dt.date:
        """Where the expected figures start from: the last check-in, else the first balances typed in."""
        last = self.last()
        if last:
            return dates.parse(last["date"])
        with self.db.reading() as conn:
            row = conn.execute("SELECT MIN(date) FROM balances").fetchone()
        return dates.parse(row[0]) if row and row[0] else dates.today()

    def _simulate(self, since: dt.date, today: dt.date) -> tuple[dict[int, int], Simulation]:
        rows = self.accounts.rows()
        with self.db.reading() as conn:
            start = {a["id"]: ledger.balance(conn, a["id"], since.isoformat()) for a in rows}
        bills = self.bills.all()
        per_month = {a["id"]: self.bills.per_month(a["id"]) for a in rows if a["role"] == "bills"}
        spending = {a["id"] for a in rows if a["role"] == "spending"}
        sim = self.rules.simulate({k: float(v) for k, v in start.items()}, since, today, bills, per_month, spending)
        return start, sim

    def prepare(self) -> dict[str, Any]:
        """The check-in form: each account with its last balance and what it should hold now."""
        today = dates.today()
        since = self._since()
        start, sim = self._simulate(since, today)
        names = {a["id"]: a["name"] for a in self.accounts.rows()}
        rows = []
        for a in self.accounts.rows():
            events = [e for e in sim.events if a["id"] in (e.get("account"), e.get("from"), e.get("to"))]
            expected: int | None = round(sim.balances.get(a["id"], start[a["id"]]))
            if a["role"] == "spending" or a["kind"] == "loan":
                expected = None  # spending varies; the loan is updated when its statement comes
            rows.append(
                {
                    "id": a["id"],
                    "name": a["name"],
                    "kind": a["kind"],
                    "role": a["role"],
                    "colour": a["colour"],
                    "last": start[a["id"]],
                    "expected": expected,
                    "approximate": a["id"] in sim.approximate,
                    "because": [_who(e, names) for e in events],
                }
            )
        loan_row = self.accounts.loan()
        due = None
        if loan_row:
            due_day = self._loan_due()
            due = due_day.isoformat() if due_day else None
        return {
            "date": today.isoformat(),
            "since": since.isoformat(),
            "last": self.last(),
            "accounts": rows,
            "loan_due": due,
            "tolerance": self.tolerance(),
            "next_reminder": self.next_reminder().isoformat(),
            "flags": self.flags(),
        }

    def _loan_due(self) -> dt.date | None:
        repay = next((b for b in self.bills.all() if "loan" in b.name.lower() and "car" not in b.name.lower()), None)
        return repay.next_due() if repay else None

    def next_reminder(self, after: dt.date | None = None) -> dt.date:
        """When the next check-in is due: the next payday (the day after, once transfers have run), Sunday, or the
        first of the month."""
        today = after or dates.today()
        how = self.settings.get("reminder")
        if how == "weekly":
            return today + dt.timedelta(days=(6 - today.weekday()) % 7 or 7)
        if how == "monthly":
            return dates.add_months(today.replace(day=1), 1)
        pay = next((r for r in self.rules.all(enabled_only=True) if r.kind == "pay"), None)
        if pay:
            return pay.next_run(today + dt.timedelta(days=1))
        return today + dt.timedelta(days=14)

    def check(self, balances: dict[int, int], exact: bool) -> dict[str, Any]:
        """What a check-in with these balances would say, account by account, without saving it."""
        today = dates.today()
        since = self._since()
        start, sim = self._simulate(since, today)
        tolerance = self.tolerance()
        rows_by_id = {a["id"]: a for a in self.accounts.rows()}
        names = {k: v["name"] for k, v in rows_by_id.items()}
        results = []
        for account_id, a in rows_by_id.items():
            entered = balances.get(account_id)
            item: dict[str, Any] = {"id": account_id, "name": a["name"], "role": a["role"], "kind": a["kind"]}
            if entered is None:
                item.update(status="skipped")
                results.append(item)
                continue
            previous = start[account_id]
            item.update(entered=entered, previous=previous, change=entered - previous)
            if a["kind"] == "loan":
                item.update(status="loan")
            elif a["role"] == "spending":
                item.update(status="spent", spent=previous - entered)
            else:
                expected = round(sim.balances.get(account_id, previous))
                difference = entered - expected
                slack = tolerance
                if account_id in sim.approximate:
                    slack = max(tolerance, round(abs(expected - previous) * 0.15))
                item.update(expected=expected, difference=difference)
                if abs(difference) <= slack:
                    item.update(status="ok")
                else:
                    explained = self.rules.explain(account_id, difference, tolerance, sim)
                    item.update(
                        status="short" if difference < 0 else "over",
                        rule_id=explained.get("rule_id") if explained else None,
                        rule_amount=explained.get("amount") if explained else None,
                        explanation=self._explain(explained, account_id, names) if explained else None,
                    )
            if exact and a["kind"] == "bank":
                with self.db.reading() as conn:
                    item["adjustment"] = entered - ledger.ledger(conn, account_id)
            results.append(item)
        return {"since": since.isoformat(), "accounts": results, "effects": self._effects(balances)}

    @staticmethod
    def _explain(event: dict[str, Any], account_id: int, names: dict[int, str]) -> str:
        amount = f"${event['amount'] / 100:,.0f}"
        src, dst = names.get(event.get("from") or 0, "?"), names.get(event.get("to") or 0, "?")
        what = {"transfer": "payday transfer", "top_up": "top-up", "sweep": "sweep", "pay": "pay"}[event["kind"]]
        if event["kind"] == "pay":
            return f"The {amount} pay into {dst} didn't show up."
        if event.get("to") == account_id:
            return f"The {amount} {what} from {src} to {dst} didn't show up."
        return f"The {amount} {what} from {src} to {dst} didn't go out: {src} still has it."

    def _effects(self, balances: dict[int, int]) -> dict[str, Any]:
        """What the check-in changes: loan coverage and interest avoided before and after, the bills buffer in
        months, and safe to spend."""
        ov = self.accounts.overview()
        lo = ov["loan"]
        before = ov["offsetting"]
        after = sum(balances.get(a["id"], a["balance"]) for a in ov["accounts"] if a["offsets_loan"])
        owed = balances.get(lo["id"], lo["balance"]) if lo else 0
        rate = (lo or {}).get("rate_bp") or 0
        bills_acct = next((a for a in ov["accounts"] if a["role"] == "bills"), None)
        bills_months = None
        if bills_acct and bills_acct["target"] and bills_acct["target"]["per_month"]:
            bills_months = balances.get(bills_acct["id"], bills_acct["balance"]) / bills_acct["target"]["per_month"]
        return {
            "offsetting_before": before,
            "offsetting_after": after,
            "loan": owed,
            "coverage_before": before / lo["balance"] if lo and lo["balance"] else None,
            "coverage_after": after / owed if owed else None,
            "interest_per_day": loan.daily_interest(after, owed, rate),
            "bills_months": bills_months,
            "spending_left": next(
                (balances.get(a["id"], a["balance"]) for a in ov["accounts"] if a["role"] == "spending"), None
            ),
        }

    def save(self, balances: dict[int, int], exact: bool, user_id: int | None) -> dict[str, Any]:
        """Save a check-in: each balance as known today (exact, with adjustments, if ticked), its flags, and how
        each rule went."""
        if not balances:
            raise ValueError("Enter at least one balance.")
        known = {a["id"] for a in self.accounts.rows()}
        if any(k not in known for k in balances):
            raise ValueError("One of those accounts has gone. Reload and try again.")
        result = self.check(balances, exact)
        today = dates.today().isoformat()
        now = int(time.time())
        with self.db.writing() as conn:
            cur = conn.execute(
                "INSERT INTO checkins (date, exact, user_id, created_at) VALUES (?, ?, ?, ?)",
                (today, int(exact), user_id, now),
            )
            checkin_id = int(cur.lastrowid or 0)
            # Earlier flags for an account that adds up now are settled.
            for item in result["accounts"]:
                if "entered" not in item:
                    continue
                account_id = item["id"]
                if exact and item["kind"] == "bank":
                    ledger.adjust_to(conn, account_id, item["entered"], "today", now, user_id)
                ledger.add_known(
                    conn,
                    account_id,
                    today,
                    item["entered"],
                    "exact" if exact else "checkin",
                    exact,
                    now + 1,
                    checkin_id=checkin_id,
                    expected=item.get("expected"),
                )
                if item["status"] == "ok":
                    conn.execute(
                        "UPDATE checkin_flags SET status = 'resolved', resolved_at = ? WHERE account_id = ?"
                        " AND status IN ('open', 'snoozed')",
                        (now, account_id),
                    )
                elif item["status"] in ("short", "over"):
                    conn.execute(
                        "INSERT INTO checkin_flags (checkin_id, account_id, rule_id, difference, status, created_at)"
                        " VALUES (?, ?, ?, ?, 'open', ?)",
                        (checkin_id, account_id, item.get("rule_id"), item["difference"], now),
                    )
        # How each rule went: a transfer whose accounts both added up went as planned.
        statuses = {i["id"]: i["status"] for i in result["accounts"]}
        flagged = {i.get("rule_id") for i in result["accounts"] if i.get("rule_id")}
        _, sim = self._simulate(dates.parse(result["since"]), dates.today())
        for event in sim.events:
            rule_id = event.get("rule_id")
            if not rule_id:
                continue
            if rule_id in flagged:
                self.rules.note(rule_id, "missing", today)
            elif event["kind"] == "sweep" and not event["amount"]:
                self.rules.note(rule_id, "nothing", today)
            elif all(statuses.get(x) in ("ok", "spent", None) for x in (event.get("from"), event.get("to")) if x):
                self.rules.note(rule_id, "ok", today)
        return {"id": checkin_id, **result, "flags": self.flags(), "next_reminder": self.next_reminder().isoformat()}

    # -- flags ----------------------------------------------------------------------------

    def flags(self) -> list[dict[str, Any]]:
        """Flags still to deal with (a snoozed one comes back the next day)."""
        today = dates.today()
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT f.id, f.checkin_id, f.account_id, a.name, f.rule_id, f.difference, f.status, f.resolved_at,"
                " c.date FROM checkin_flags f JOIN accounts a ON a.id = f.account_id"
                " JOIN checkins c ON c.id = f.checkin_id WHERE f.status IN ('open', 'snoozed') ORDER BY f.id DESC"
            ).fetchall()
        out = []
        for r in rows:
            if r[6] == "snoozed" and r[7] and dt.datetime.fromtimestamp(r[7], dates.zone()).date() >= today:
                continue  # checked again tomorrow
            rule = self.rules.get(r[4]) if r[4] else None
            out.append(
                {
                    "id": r[0],
                    "checkin_id": r[1],
                    "account_id": r[2],
                    "account": r[3],
                    "rule": rule.view() if rule else None,
                    "difference": r[5],
                    "status": r[6],
                    "date": r[8],
                }
            )
        return out

    def act(self, flag_id: int, action: str) -> list[dict[str, Any]]:
        """Deal with a flag: check again tomorrow (snooze), it was skipped this time, or it's sorted (resolve)."""
        status = {"snooze": "snoozed", "skip": "skipped", "resolve": "resolved"}.get(action)
        if status is None:
            raise ValueError("Check again tomorrow, skip it this time, or mark it sorted.")
        with self.db.writing() as conn:
            row = conn.execute("SELECT rule_id FROM checkin_flags WHERE id = ?", (flag_id,)).fetchone()
            if not row:
                raise LookupError("That flag has gone.")
            # A snoozed flag's resolved_at is when it was snoozed: it comes back the next day.
            today = dates.today()
            noon = int(dt.datetime(today.year, today.month, today.day, 12, tzinfo=dates.zone()).timestamp())
            conn.execute("UPDATE checkin_flags SET status = ?, resolved_at = ? WHERE id = ?", (status, noon, flag_id))
        if status == "skipped" and row[0]:
            self.rules.note(row[0], "skipped", dates.today().isoformat())
        return self.flags()

    def history(self, limit: int = 20) -> list[dict[str, Any]]:
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT c.id, c.date, c.exact, u.display_name, u.username, COUNT(b.id) FROM checkins c"
                " LEFT JOIN users u ON u.id = c.user_id LEFT JOIN balances b ON b.checkin_id = c.id"
                " GROUP BY c.id ORDER BY c.date DESC, c.id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [{"id": r[0], "date": r[1], "exact": bool(r[2]), "who": r[3] or r[4], "accounts": r[5]} for r in rows]
