"""The rules for a day's financial year."""

from __future__ import annotations

import datetime as dt
import importlib
from types import ModuleType


def financial_year(day: dt.date) -> int:
    """The financial year a day falls in, by the year it ends: 9 November 2026 is in 2027."""
    return day.year + 1 if day.month >= 7 else day.year


def rules_for(day: dt.date) -> ModuleType:
    """The rules file for that day's financial year. Raises LookupError when there isn't one yet."""
    year = financial_year(day)
    try:
        return importlib.import_module(f"app.features.fire.rules.fy{year}")
    except ModuleNotFoundError:
        raise LookupError(f"There are no tax and super rules for {year - 1}-{str(year)[2:]} yet.") from None
