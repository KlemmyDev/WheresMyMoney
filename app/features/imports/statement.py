"""
Reading a bank statement CSV into rows: date, description, amount (cents, signed) and the running balance.

uBank's export is recognised as it is: a file per account per month named `<Nickname>-<last4>_<YYYY-MM>.csv`, the
header "Date","Description","Debit","Credit","Balance", dates like 02 Oct 2026, debits and credits in their own columns
as $5,000.00, and a signed balance (+$3,000.00, -$12.50), oldest row first.

Another bank's file has its columns matched once (`Columns`), and that's remembered for files with the same header.

The running balance is checked row by row: each row's balance should be the one before it plus the row's amount. It
also tells the order: a file whose balances only add up newest-first is turned around.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import re
from dataclasses import dataclass, field, replace

MAX_BYTES = 5_000_000
MAX_ROWS = 20_000
NAME = re.compile(r"^(?P<nickname>.+?)-(?P<last4>\d{4})_(?P<year>\d{4})-(?P<month>\d{2})\.csv$", re.IGNORECASE)
DATE_FORMATS = ("%d %b %Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d %B %Y", "%d/%m/%y", "%d-%b-%Y", "%d %b %y")
UBANK_HEADER = ["Date", "Description", "Debit", "Credit", "Balance"]


class StatementError(ValueError):
    """A file that can't be read as a statement, said in words."""


@dataclass(frozen=True)
class Columns:
    """Which column holds what (by position). Either debit and credit, or one signed amount."""

    date: int
    description: int
    debit: int | None = None
    credit: int | None = None
    amount: int | None = None
    balance: int | None = None
    bank: str = "custom"

    def as_dict(self) -> dict[str, object]:
        return {
            "date": self.date,
            "description": self.description,
            "debit": self.debit,
            "credit": self.credit,
            "amount": self.amount,
            "balance": self.balance,
            "bank": self.bank,
        }


UBANK = Columns(date=0, description=1, debit=2, credit=3, balance=4, bank="ubank")


@dataclass(frozen=True)
class Row:
    index: int  # its place in the file, from 0, oldest first
    date: str
    description: str
    amount: int
    balance: int | None


@dataclass
class Statement:
    filename: str
    header: list[str]
    columns: Columns
    rows: list[Row]
    last4: str | None = None
    month: str | None = None  # YYYY-MM, from the file's name
    nickname: str | None = None
    balance_ok: bool | None = None  # None: there's no balance column
    balance_problems: list[int] = field(default_factory=list)  # rows whose balance doesn't follow
    reversed: bool = False
    date_format: str | None = None

    @property
    def first_date(self) -> str | None:
        return self.rows[0].date if self.rows else None

    @property
    def last_date(self) -> str | None:
        return self.rows[-1].date if self.rows else None

    @property
    def closing(self) -> int | None:
        return self.rows[-1].balance if self.rows else None

    @property
    def opening(self) -> int | None:
        """The balance before the first row."""
        if not self.rows or self.rows[0].balance is None:
            return None
        return self.rows[0].balance - self.rows[0].amount

    def owed(self) -> Statement:
        """The statement as a loan sees it: what's owed positive (a loan's export shows it as a negative balance)."""
        rows = [
            replace(r, amount=-r.amount or 0, balance=-r.balance if r.balance is not None else None) for r in self.rows
        ]
        return replace(self, rows=rows, balance_problems=list(self.balance_problems))

    def end_of_day(self) -> dict[str, int]:
        """Each day's closing balance (the last row of the day)."""
        out: dict[str, int] = {}
        for r in self.rows:
            if r.balance is not None:
                out[r.date] = r.balance
        return out


def read_name(filename: str) -> tuple[str | None, str | None, str | None]:
    """(nickname, last four digits, YYYY-MM) from a uBank file name, or Nones."""
    m = NAME.match(filename.strip().rsplit("/", 1)[-1])
    if not m:
        return None, None, None
    return m["nickname"], m["last4"], f"{m['year']}-{m['month']}"


def cents(text: str) -> int | None:
    """ "$5,000.00", "+$3,000.00", "-$12.50", "(12.50)", "12.5" → cents (None for an empty field)."""
    t = text.strip().replace(",", "").replace("$", "").replace(" ", "").replace("AUD", "")
    if not t or t in ("-", "—"):
        return None
    negative = t.startswith("-") or (t.startswith("(") and t.endswith(")")) or t.endswith("DR")
    t = t.strip("+-()").removesuffix("DR").removesuffix("CR")
    if not re.fullmatch(r"\d+(\.\d{1,2})?", t):
        raise StatementError(f"{text!r} isn't an amount.")
    whole, _, frac = t.partition(".")
    value = int(whole) * 100 + int((frac + "00")[:2])
    return -value if negative else value


def guess_format(samples: list[str]) -> str:
    for fmt in DATE_FORMATS:
        try:
            for s in samples:
                dt.datetime.strptime(s.strip(), fmt)
            return fmt
        except ValueError:
            continue
    raise StatementError(f"Couldn't read the dates (like {samples[0]!r}). Dates like 02 Oct 2026 or 02/10/2026 work.")


def decode(raw: bytes) -> str:
    if len(raw) > MAX_BYTES:
        raise StatementError("That file is too big for a statement (5 MB at most).")
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise StatementError("That file isn't text. Export the statement as CSV.")


def table(raw: bytes) -> list[list[str]]:
    text = decode(raw)
    rows = [r for r in csv.reader(io.StringIO(text)) if any(c.strip() for c in r)]
    if not rows:
        raise StatementError("That file is empty.")
    if len(rows) > MAX_ROWS:
        raise StatementError(f"That's more rows than a statement has ({MAX_ROWS:,} at most).")
    return rows


def signature(header: list[str]) -> str:
    """A header, as the key a bank's column choices are remembered by."""
    return "|".join(h.strip().lower() for h in header)


def recognise(header: list[str]) -> Columns | None:
    if [h.strip() for h in header] == UBANK_HEADER:
        return UBANK
    return None


def parse(filename: str, raw: bytes, columns: Columns | None = None) -> Statement:
    rows = table(raw)
    header = [h.strip() for h in rows[0]]
    cols = columns or recognise(header)
    if cols is None:
        raise StatementError("unknown-format")
    body = rows[1:]
    if not body:
        raise StatementError("That statement has no transactions in it.")
    width = max(
        i for i in (cols.date, cols.description, cols.debit, cols.credit, cols.amount, cols.balance) if i is not None
    )
    fmt = guess_format([r[cols.date] for r in body[:50] if len(r) > cols.date])
    parsed: list[tuple[str, str, int, int | None]] = []
    for n, r in enumerate(body, start=2):
        if len(r) <= width:
            raise StatementError(f"Row {n} has fewer columns than the header.")
        try:
            day = dt.datetime.strptime(r[cols.date].strip(), fmt).date().isoformat()
            if cols.amount is not None:
                amount = cents(r[cols.amount]) or 0
            else:
                debit = cents(r[cols.debit]) if cols.debit is not None else None
                credit = cents(r[cols.credit]) if cols.credit is not None else None
                amount = (credit or 0) - abs(debit or 0)
            balance = cents(r[cols.balance]) if cols.balance is not None else None
        except ValueError as e:
            raise StatementError(f"Row {n}: {e}") from None
        parsed.append((day, " ".join(r[cols.description].split()), amount, balance))
    nickname, last4, month = read_name(filename)
    st = Statement(filename, header, cols, [], last4=last4, month=month, nickname=nickname, date_format=fmt)
    ordered, problems, flipped = _order(parsed)
    st.rows = [Row(i, d, desc, a, b) for i, (d, desc, a, b) in enumerate(ordered)]
    st.reversed = flipped
    if cols.balance is not None:
        st.balance_problems = problems
        st.balance_ok = not problems
    return st


def _follows(rows: list[tuple[str, str, int, int | None]]) -> list[int]:
    """The rows (by index) whose balance isn't the previous balance plus their amount."""
    bad = []
    for i in range(1, len(rows)):
        prev, cur = rows[i - 1][3], rows[i][3]
        if prev is not None and cur is not None and prev + rows[i][2] != cur:
            bad.append(i)
    return bad


def _order(
    rows: list[tuple[str, str, int, int | None]],
) -> tuple[list[tuple[str, str, int, int | None]], list[int], bool]:
    """Oldest first, as uBank writes them; turned around when the dates or the balances say it's newest first."""
    forward = _follows(rows)
    backward_rows = list(reversed(rows))
    backward = _follows(backward_rows)
    dates_descending = rows[0][0] > rows[-1][0]
    if (dates_descending and len(backward) <= len(forward)) or len(backward) < len(forward):
        return backward_rows, backward, True
    return rows, forward, False
