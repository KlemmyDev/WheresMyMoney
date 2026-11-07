"""
Importing a statement CSV into an account's ledger, in two steps: look it over, then import it.

Looking it over (`open`, then `analyse` for an account) works out, row by row:
- duplicates: rows already imported, by date, amount and description (overlapping exports are fine: a row that
  appears twice in one file and once already counts once as new);
- hand entries it matches: one typed in with the same amount on the same day or up to three days before (cards settle
  late). They're merged: the statement's row stands, keeping the household's note and category. Hand entries in the
  statement's dates that match nothing are kept as cash (spent from a wallet, so out of the ledger);
- rough check-ins it replaces: a check-in's figure on a day the statement covers becomes the statement's balance at
  the end of that day;
- each new row's category: a bill it matches (by amount and date), a learned merchant rule, a transfer matched to a
  rule by amount and date (uBank calls every transfer just "Transfer"), or a suggestion the household confirms.
  uBank's longer export also says each row's payment type ("Internal Transfer") and uBank's own category, which
  count as a transfer and as a suggestion when nothing else knows the merchant.

uBank's longer export has no account number in its name: its rows name the account ("Pay Account"), and once it's
been imported to one of the household's accounts, that name finds it next time.

Importing (`commit`) writes all of that, remembers the categories it's told to, and notes how the rules it matched went
(a top-up whose amount differed from what the rule called for, say).

The file is read on the household's own server and never leaves it. Looked-over files are kept in memory for an
hour, so nothing is written until the household says to import.
"""

from __future__ import annotations

import datetime as dt
import json
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from app.core import dates
from app.core.database import Database
from app.features.accounts import ledger
from app.features.accounts.service import AccountsService
from app.features.bills.service import BillsService
from app.features.imports import loan as loan_rows
from app.features.imports.statement import Columns, Row, Statement, StatementError, parse, recognise, signature, table
from app.features.rules.service import RulesService
from app.features.spending import merchants
from app.features.spending.service import category_by_name, learned, rule_for

KEEP = 3600
MERGE_DAYS = 3  # a hand entry this many days before the statement's row still matches it
TRANSFER_DAYS = 3  # a transfer this many days from a rule's run still matches it
BILL_DAYS = 5
DIFFERS = 100  # cents: a top-up more than $1 away from what the rule called for differed
FORMAT_KEY = "csv_format:"
NAME_KEY = "csv_account:"  # a bank's name for an account → the household's account it was imported to
# uBank's own categories (in its longer export), as the household's starting ones, for a merchant nothing else knows.
BANK_CATEGORIES = {
    "groceries": "Groceries",
    "eating & drinking out": "Eating out",
    "food delivery & takeaway": "Eating out",
    "alcohol": "Eating out",
    "petrol": "Fuel",
    "parking & vehicle expenses": "Fuel",
    "entertainment": "Fun",
    "hobbies, books & games": "Fun",
    "holidays & travel": "Fun",
    "children & family": "Kids",
    "home renovations & maintenance": "Home",
    "furniture & homewares": "Home",
    "health & medical": "Health",
    "beauty & grooming": "Health",
    "utilities, phone & internet": "Bills",
    "insurance": "Bills",
    "subscriptions & apps": "Bills",
    "salary": "Pay",
    "general shopping": "Other",
    "clothing & accessories": "Other",
    "electronics": "Other",
}


@dataclass
class Pending:
    token: str
    statement: Statement
    created: float
    user_id: int | None
    analysis: dict[int, dict[str, Any]] = field(default_factory=dict)  # by account

    def seen_by(self, account: dict[str, Any]) -> Statement:
        """The statement as the account sees it: a loan's has what's owed positive."""
        return self.statement.owed() if account["kind"] == "loan" else self.statement


def _transfer(r: Row) -> bool:
    if (r.kind or "").strip().lower() == "internal transfer":
        return True
    d = r.description.strip().upper()
    return d == "TRANSFER" or d.startswith(("TRANSFER TO", "TRANSFER FROM", "INTERNAL TRANSFER"))


class ImportService:
    def __init__(self, db: Database, accounts: AccountsService, rules: RulesService, bills: BillsService):
        self.db = db
        self.accounts = accounts
        self.rules = rules
        self.bills = bills
        self._pending: dict[str, Pending] = {}
        self._lock = threading.Lock()

    # -- step 1: read the file ----------------------------------------------------------

    def open(
        self, filename: str, raw: bytes, user_id: int | None, columns: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Read a statement. A file whose columns aren't known yet comes back with `needs_columns`, its header and a
        few rows, to match them once (they're remembered for the same header)."""
        cols = Columns(**{k: v for k, v in columns.items() if k in Columns.__dataclass_fields__}) if columns else None
        try:
            header = [h.strip() for h in table(raw)[0]]
            if cols is None and recognise(header) is None:
                cols = self._remembered(header)
            st = parse(filename, raw, cols)
        except StatementError as e:
            if str(e) != "unknown-format":
                raise
            rows = table(raw)
            return {"needs_columns": True, "header": rows[0], "sample": rows[1:6], "filename": filename}
        if cols is not None and cols.bank == "custom":
            self._remember(header, cols)
        token = secrets.token_urlsafe(12)
        with self._lock:
            now = time.time()
            self._pending = {k: p for k, p in self._pending.items() if now - p.created < KEEP}
            self._pending[token] = Pending(token, st, now, user_id)
        account = self.accounts.by_last4(st.last4) if st.last4 else self._by_name(st.account_names)
        return {"token": token, "account_id": account["id"] if account else None, **self._file(st)}

    def _by_name(self, names: list[str]) -> dict[str, Any] | None:
        """The household's account a bank's names for it point to: remembered from an earlier import, or the same
        name."""
        if not names:
            return None
        with self.db.reading() as conn:
            for name in names:
                row = conn.execute("SELECT value FROM kv WHERE key = ?", (NAME_KEY + name.lower(),)).fetchone()
                if row and (account := self.accounts.get(int(row[0]))) is not None:
                    return account
        wanted = {n.lower() for n in names}
        return next((a for a in self.accounts.rows() if str(a["name"]).strip().lower() in wanted), None)

    def _remembered(self, header: list[str]) -> Columns | None:
        with self.db.reading() as conn:
            row = conn.execute("SELECT value FROM kv WHERE key = ?", (FORMAT_KEY + signature(header),)).fetchone()
        return Columns(**json.loads(row[0])) if row else None

    def _remember(self, header: list[str], cols: Columns) -> None:
        with self.db.writing() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
                (FORMAT_KEY + signature(header), json.dumps(cols.as_dict())),
            )

    @staticmethod
    def _file(st: Statement) -> dict[str, Any]:
        return {
            "filename": st.filename,
            "bank": st.columns.bank,
            "columns": st.columns.as_dict(),
            "header": st.header,
            "last4": st.last4,
            "month": st.month,
            "rows": len(st.rows),
            "first_date": st.first_date,
            "last_date": st.last_date,
            "opening": st.opening,
            "closing": st.closing,
            "balance_ok": st.balance_ok,
            "balance_problems": st.balance_problems[:20],
            "reversed": st.reversed,
            "date_format": st.date_format,
            "account_names": st.account_names,
            "zero_rows": st.zero_rows,
            "sample": [r.__dict__ for r in st.rows[-5:]],
        }

    def _get(self, token: str) -> Pending:
        with self._lock:
            p = self._pending.get(token)
        if p is None or time.time() - p.created > KEEP:
            raise LookupError("That file has been put away: choose it again.")
        return p

    # -- step 2: what it'd do to an account ----------------------------------------------

    def analyse(self, token: str, account_id: int) -> dict[str, Any]:
        p = self._get(token)
        account = self.accounts.get(account_id)
        if account is None:
            raise ValueError("Choose which of your accounts the statement is from.")
        is_loan = account["kind"] == "loan"
        st = p.seen_by(account)
        rows = st.rows
        first, last = st.first_date or "", st.last_date or ""
        with self.db.reading() as conn:
            existing: dict[tuple[str, int, str], int] = {}
            for d, a, desc in conn.execute(
                "SELECT date, amount, description FROM transactions WHERE account_id = ? AND kind = 'statement'"
                " AND date BETWEEN ? AND ?",
                (account_id, first, last),
            ):
                key = (d, a, " ".join(desc.split()).upper())
                existing[key] = existing.get(key, 0) + 1
            manual = conn.execute(
                "SELECT t.id, t.date, t.amount, t.description, t.category_id, t.note, c.name FROM transactions t"
                " LEFT JOIN categories c ON c.id = t.category_id WHERE t.account_id = ? AND t.kind = 'manual'"
                " AND t.date BETWEEN ? AND ? ORDER BY t.date",
                (account_id, (dates.parse(first) - dt.timedelta(days=MERGE_DAYS)).isoformat(), last),
            ).fetchall()
            rough = conn.execute(
                "SELECT id, date, balance FROM balances WHERE account_id = ? AND source = 'checkin' AND exact = 0"
                " AND date BETWEEN ? AND ?",
                (account_id, first, last),
            ).fetchall()
            rules_learned = learned(conn)
            cats = {r[0]: r[1] for r in conn.execute("SELECT id, name FROM categories")}
            transfer_cat = category_by_name(conn, "Transfer")
            pay_cat = category_by_name(conn, "Pay")
            interest_cat = category_by_name(conn, "Interest")
            bills_cat = category_by_name(conn, "Bills")
            earliest = ledger.first_transaction(conn, account_id)
        by_name = {v.lower(): k for k, v in cats.items()}

        # Duplicates: the first n of each (date, amount, description) are already in.
        seen: dict[tuple[str, int, str], int] = {}
        out: list[dict[str, Any]] = []
        used_manual: set[int] = set()
        rule_list = [r for r in self.rules.all(enabled_only=True) if account_id in (r.from_account, r.to_account)]
        bills = self.bills.all()
        for r in rows:
            key = (r.date, r.amount, r.description.upper())
            seen[key] = seen.get(key, 0) + 1
            item: dict[str, Any] = {
                "index": r.index,
                "date": r.date,
                "description": r.description,
                "amount": r.amount,
                "balance": r.balance,
            }
            if is_loan and loan_rows.is_note(r):
                # A $0.00 row that only says something, like a rate change: it's read, not imported.
                item.update(status="note", why="note")
                out.append(item)
                continue
            if seen[key] <= existing.get(key, 0):
                item["status"] = "duplicate"
                out.append(item)
                continue
            item["status"] = "new"
            m = merchants.merchant(r.description)
            item["merchant"] = m
            if is_loan:
                item.update(why=loan_rows.why(r), sure=True, loan=True)
                out.append(item)
                continue
            # A hand entry for the same amount, that day or a few days before.
            match = None
            for t in manual:
                if t[0] in used_manual or t[2] != r.amount:
                    continue
                gap = (dates.parse(r.date) - dates.parse(t[1])).days
                if 0 <= gap <= MERGE_DAYS and (match is None or gap < match[1]):
                    match = (t, gap)
            if match:
                t = match[0]
                used_manual.add(t[0])
                item.update(status="merge", merge_id=t[0], note=t[5], hand_description=t[3], hand_date=t[1])
                if t[4]:
                    item.update(category_id=t[4], why="merged", sure=True)
            if "category_id" not in item:
                self._categorise(
                    item,
                    r,
                    m,
                    account,
                    rule_list,
                    bills,
                    rules_learned,
                    by_name,
                    transfer_cat,
                    pay_cat,
                    interest_cat,
                    bills_cat,
                )
            item["category"] = cats.get(item.get("category_id"))
            out.append(item)

        new = [x for x in out if x["status"] in ("new", "merge")]
        eod = st.end_of_day()
        replaced = []
        for bid, day, figure in rough:
            exact_figure = self._balance_on(eod, day)
            if exact_figure is not None:
                replaced.append({"id": bid, "date": day, "rough": figure, "exact": exact_figure})
        kept_cash = [
            {"id": t[0], "date": t[1], "amount": t[2], "description": t[3]}
            for t in manual
            if t[0] not in used_manual and first <= t[1] <= last
        ]
        need = [x for x in new if not x.get("sure")]
        totals: dict[str, int] = {}
        for x in [] if is_loan else new:
            if x.get("why") in ("transfer", "pay") or x["amount"] >= 0:
                continue
            name = x.get("category") or "Not sorted yet"
            totals[name] = totals.get(name, 0) - x["amount"]
        result = {
            "token": token,
            "account_id": account_id,
            "file": self._file(st),
            "rows": out,
            "counts": {
                "rows": len(rows),
                "duplicates": sum(1 for x in out if x["status"] == "duplicate"),
                "notes": sum(1 for x in out if x["status"] == "note"),
                "new": len(new),
                "merge": sum(1 for x in out if x["status"] == "merge"),
                "sorted": sum(1 for x in new if x.get("sure") and x.get("why") not in ("transfer",)),
                "need": len(need),
                "transfers": sum(1 for x in new if x.get("why") == "transfer"),
                "bills": sum(1 for x in new if x.get("why") == "bill"),
            },
            "replaced": replaced,
            "kept_cash": kept_cash,
            "by_category": sorted(totals.items(), key=lambda kv: -kv[1]),
            # Whether this file reaches back before anything already in the account (so its opening balance is
            # the account's): then the ledger can be made to match the statement with an opening balance.
            "earliest": not earliest or (st.first_date or "") <= earliest,
            "loan": self._loan_changes(account, st) if is_loan else None,
        }
        p.analysis[account_id] = result
        return result

    def _loan_changes(self, account: dict[str, Any], st: Statement) -> dict[str, Any]:
        """The rate and repayment changes the statement shows, each with whether it's new, and what the loan's rate
        and repayment will be once it's imported (the latest of each, counting what earlier statements showed)."""
        found = loan_rows.changes(st.rows)
        with self.db.reading() as conn:
            known = conn.execute(
                "SELECT date, field, value, was FROM loan_changes WHERE account_id = ?", (account["id"],)
            ).fetchall()
        have = {(d, f, v) for d, f, v, _ in known}
        timeline = sorted([(d, f, v) for d, f, v, _ in known] + [(c["date"], c["field"], c["value"]) for c in found])
        for c in found:
            c["new"] = (c["date"], c["field"], c["value"]) not in have
            if c["was"] is None:
                # The statement didn't say what it was before: the latest known before it, if any.
                before = [v for d, f, v in timeline if f == c["field"] and d < c["date"]]
                c["was"] = before[-1] if before else None
        # A repayment that's the same as the one before isn't a change.
        shown = [c for c in found if c["field"] == "rate" or c["was"] != c["value"]]
        latest = {f: v for _, f, v in timeline}
        return {
            "changes": shown,
            "rate_bp": latest.get("rate", account["rate_bp"]),
            "repayment": latest.get("repayment", account["repayment"]),
            "was_rate_bp": account["rate_bp"],
            "was_repayment": account["repayment"],
        }

    @staticmethod
    def _balance_on(eod: dict[str, int], day: str) -> int | None:
        best = None
        for d in sorted(eod):
            if d <= day:
                best = eod[d]
        return best

    def _categorise(
        self,
        item: dict[str, Any],
        r: Row,
        m: str,
        account: dict[str, Any],
        rule_list: list[Any],
        bills: list[Any],
        rules_learned: list[tuple[str, int]],
        by_name: dict[str, int],
        transfer_cat: int | None,
        pay_cat: int | None,
        interest_cat: int | None,
        bills_cat: int | None,
    ) -> None:
        day = dates.parse(r.date)
        window = (day - dt.timedelta(days=TRANSFER_DAYS), day + dt.timedelta(days=TRANSFER_DAYS))
        if _transfer(r):
            item.update(category_id=transfer_cat, why="transfer", sure=True)
            for rule in rule_list:
                if not rule.runs(*window):
                    continue
                into = rule.to_account == account["id"]
                if (into and r.amount < 0) or (not into and r.amount > 0):
                    continue
                if rule.kind == "transfer" and abs(r.amount) == rule.amount:
                    item.update(rule_id=rule.id, rule_kind=rule.kind)
                    return
                if rule.kind == "top_up" and into and r.balance is not None:
                    called_for = max(rule.amount - (r.balance - r.amount), 0)
                    item.update(
                        rule_id=rule.id,
                        rule_kind=rule.kind,
                        called_for=called_for,
                        differed=abs(called_for - r.amount) > DIFFERS,
                    )
                    return
                if rule.kind == "sweep":
                    item.update(rule_id=rule.id, rule_kind=rule.kind)
                    return
            return
        if r.amount > 0:
            for rule in rule_list:
                if (
                    rule.kind == "pay"
                    and rule.to_account == account["id"]
                    and rule.runs(*window)
                    and abs(r.amount - rule.amount) <= max(rule.amount // 10, 100)
                ):
                    item.update(category_id=pay_cat, why="pay", sure=True, rule_id=rule.id, rule_kind="pay")
                    return
            if "INTEREST" in m:
                item.update(category_id=interest_cat, why="interest", sure=True)
                return
        if r.amount < 0:
            for bill in bills:
                hits_text = (bill.match and bill.match in m) or (bill.name.upper().split()[0] in m.split())
                if not hits_text and -r.amount != bill.amount:
                    continue
                near = bill.due_between(day - dt.timedelta(days=BILL_DAYS), day + dt.timedelta(days=BILL_DAYS))
                if (
                    near
                    and (hits_text or -r.amount == bill.amount)
                    and abs(-r.amount - bill.amount) <= bill.amount // 5
                ):
                    item.update(
                        category_id=bill.category_id or bills_cat,
                        why="bill",
                        sure=True,
                        bill_id=bill.id,
                        bill=bill.name,
                    )
                    return
        learned_cat = rule_for(rules_learned, m)
        if learned_cat is not None:
            item.update(category_id=learned_cat, why="rule", sure=True)
            return
        suggestion = merchants.suggest(m) or BANK_CATEGORIES.get((r.bank_category or "").lower())
        if suggestion and suggestion.lower() in by_name:
            item.update(suggest_id=by_name[suggestion.lower()], suggest=suggestion, why="suggest", sure=False)
            return
        item.update(why="unknown", sure=False)

    # -- step 3: import ---------------------------------------------------------------------

    def commit(self, token: str, account_id: int, body: dict[str, Any]) -> dict[str, Any]:
        """Import it. `categories` ({row index: category id}) are the household's choices; `always` (row indexes)
        are remembered for their merchant; `accept_suggestions` takes every suggestion not chosen otherwise;
        `opening` adds an opening balance so the ledger matches the statement."""
        p = self._get(token)
        # Looked at again, not taken from the review: statements reviewed together are imported one after another,
        # so an earlier one may since have brought in rows (or merged hand entries) that this one shares.
        analysis = self.analyse(token, account_id)
        account = self.accounts.get(account_id)
        assert account is not None
        st = p.seen_by(account)
        chosen = {int(k): (int(v) if v not in (None, "") else None) for k, v in (body.get("categories") or {}).items()}
        always = {int(i) for i in body.get("always") or []}
        accept = bool(body.get("accept_suggestions", True))
        now = int(time.time())
        added = merged = 0
        learned_count = 0
        with self.db.writing() as conn:
            cur = conn.execute(
                "INSERT INTO imports (account_id, filename, first_date, last_date, rows, added, skipped, merged,"
                " closing, created_at, user_id) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)",
                (
                    account_id,
                    st.filename,
                    st.first_date,
                    st.last_date,
                    len(st.rows),
                    analysis["counts"]["duplicates"],
                    st.closing,
                    now,
                    p.user_id,
                ),
            )
            import_id = int(cur.lastrowid or 0)
            for x in analysis["rows"]:
                if x["status"] in ("duplicate", "note"):
                    continue
                category = chosen.get(x["index"], x.get("category_id"))
                if x["index"] not in chosen and category is None and accept:
                    category = x.get("suggest_id")
                m = x.get("merchant") or merchants.merchant(x["description"])
                if x["status"] == "merge":
                    conn.execute(
                        "UPDATE transactions SET kind = 'statement', date = ?, description = ?, merchant = ?,"
                        " balance = ?, import_id = ?, merged = 1, category_id = COALESCE(?, category_id),"
                        " rule_id = ?, bill_id = ? WHERE id = ?",
                        (
                            x["date"],
                            x["description"],
                            m,
                            x["balance"],
                            import_id,
                            category,
                            x.get("rule_id"),
                            x.get("bill_id"),
                            x["merge_id"],
                        ),
                    )
                    merged += 1
                else:
                    conn.execute(
                        "INSERT INTO transactions (account_id, date, amount, description, merchant, kind,"
                        " category_id, balance, import_id, rule_id, bill_id, created_at)"
                        " VALUES (?, ?, ?, ?, ?, 'statement', ?, ?, ?, ?, ?, ?)",
                        (
                            account_id,
                            x["date"],
                            x["amount"],
                            x["description"],
                            m,
                            category,
                            x["balance"],
                            import_id,
                            x.get("rule_id"),
                            x.get("bill_id"),
                            now,
                        ),
                    )
                    added += 1
                if x["index"] in always and category is not None and m:
                    from app.features.spending.service import SpendingService

                    learned_count += SpendingService._learn(conn, m, category)
            # Hand entries the statement didn't have: spent as cash.
            for t in analysis["kept_cash"]:
                conn.execute("UPDATE transactions SET kind = 'cash' WHERE id = ? AND kind = 'manual'", (t["id"],))
            # The statement's balance at the end of each day it covers, replacing any from an earlier import of it.
            eod = st.end_of_day()
            if eod:
                conn.execute(
                    "DELETE FROM balances WHERE account_id = ? AND source = 'statement' AND date BETWEEN ? AND ?",
                    (account_id, st.first_date, st.last_date),
                )
                for day, figure in eod.items():
                    ledger.add_known(conn, account_id, day, figure, "statement", True, _end_of(day))
            for rep in analysis["replaced"]:
                conn.execute(
                    "UPDATE balances SET balance = ?, exact = 1, rough = ? WHERE id = ?",
                    (rep["exact"], rep["rough"], rep["id"]),
                )
            opening = None
            if body.get("opening") and st.closing is not None:
                need = st.closing - ledger.ledger(conn, account_id, st.last_date)
                if need:
                    opening = ledger.adjust_to(
                        conn, account_id, ledger.ledger(conn, account_id) + need, "opening", now, p.user_id
                    )
            loan_update = None
            if analysis["loan"]:
                loan_update = self._save_loan_changes(conn, account_id, analysis["loan"], import_id, now)
            conn.execute("UPDATE imports SET added = ?, merged = ? WHERE id = ?", (added, merged, import_id))
            for name in st.account_names:
                conn.execute(
                    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (NAME_KEY + name.lower(), str(account_id))
                )
        # How the rules it matched went.
        for x in analysis["rows"]:
            if x.get("rule_id") and x["status"] not in ("duplicate", "note"):
                self.rules.note(x["rule_id"], "differed" if x.get("differed") else "ok", x["date"])
        with self._lock:
            self._pending.pop(token, None)
        view = self.accounts.view(account_id)
        with self.db.reading() as conn:
            through = ledger.ledger(conn, account_id, st.last_date)
        return {
            "import_id": import_id,
            "added": added,
            "merged": merged,
            "skipped": analysis["counts"]["duplicates"],
            "kept_cash": len(analysis["kept_cash"]),
            "replaced": len(analysis["replaced"]),
            "learned": learned_count,
            "opening": opening,
            "account": view,
            # The ledger against the statement's closing balance (what an opening balance would fix).
            "ledger_at_close": through,
            "closing": st.closing,
            "gap": (st.closing - through) if st.closing is not None else None,
            "loan": loan_update,
        }

    @staticmethod
    def _save_loan_changes(
        conn: Any, account_id: int, found: dict[str, Any], import_id: int, now: int
    ) -> dict[str, Any] | None:
        """Keep the rate and repayment changes, and set the loan's rate and repayment to the latest of each."""
        for c in found["changes"]:
            conn.execute(
                "INSERT OR IGNORE INTO loan_changes (account_id, date, field, value, was, description, import_id,"
                " created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (account_id, c["date"], c["field"], c["value"], c["was"], c["description"], import_id, now),
            )
        latest = {
            f: v
            for f, v in conn.execute(
                "SELECT field, value FROM loan_changes WHERE account_id = ? ORDER BY date, id", (account_id,)
            ).fetchall()
        }
        if not latest:
            return None
        if "rate" in latest:
            conn.execute("UPDATE accounts SET rate_bp = ? WHERE id = ?", (latest["rate"], account_id))
        if "repayment" in latest:
            conn.execute("UPDATE accounts SET repayment = ? WHERE id = ?", (latest["repayment"], account_id))
        return {
            "rate_bp": latest.get("rate", found["was_rate_bp"]),
            "repayment": latest.get("repayment", found["was_repayment"]),
            "changes": sum(1 for c in found["changes"] if c["new"]),
        }

    def history(self, limit: int = 30) -> list[dict[str, Any]]:
        with self.db.reading() as conn:
            rows = conn.execute(
                "SELECT i.id, i.account_id, a.name, i.filename, i.first_date, i.last_date, i.rows, i.added,"
                " i.skipped, i.merged, i.created_at FROM imports i LEFT JOIN accounts a ON a.id = i.account_id"
                " ORDER BY i.id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        keys = (
            "id",
            "account_id",
            "account",
            "filename",
            "first_date",
            "last_date",
            "rows",
            "added",
            "skipped",
            "merged",
            "created_at",
        )
        return [dict(zip(keys, r, strict=True)) for r in rows]


def _end_of(day: str) -> int:
    """A day's last second, in the household's time zone: a statement's closing balance is the day's last word."""
    d = dates.parse(day)
    return int(dt.datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=dates.zone()).timestamp())
