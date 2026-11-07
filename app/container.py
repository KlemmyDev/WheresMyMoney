"""
The composition root: every service, built once per app from the config.

Routers reach these through `ServicesDep` (app.dependencies) rather than importing module-level state, so each
feature can be built, replaced or tested on its own.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from pathlib import Path

from app.core import dates
from app.core.config import Config
from app.core.database import Database
from app.features.accounts.service import AccountsService
from app.features.auth.service import AuthService
from app.features.bills.service import BillsService
from app.features.checkins.service import CheckinService
from app.features.dashboard.service import DashboardService
from app.features.imports.service import ImportService
from app.features.keys.service import ApiKeyService
from app.features.notifications.rules import Facts
from app.features.notifications.service import Notifier
from app.features.rules.service import RulesService
from app.features.settings.store import SettingsStore
from app.features.spending.service import SpendingService
from app.features.updates.service import UpdateService


@dataclass
class Services:
    config: Config
    db: Database
    settings: SettingsStore
    auth: AuthService
    keys: ApiKeyService
    accounts: AccountsService
    bills: BillsService
    rules: RulesService
    spending: SpendingService
    checkins: CheckinService
    imports: ImportService
    dashboard: DashboardService
    notifications: Notifier
    updates: UpdateService


def build_services(config: Config) -> Services:
    db = Database(config.db_path)
    settings = SettingsStore(db)
    bills = BillsService(db)
    rules = RulesService(db)
    accounts = AccountsService(db, bills)
    spending = SpendingService(db)
    checkins = CheckinService(db, accounts, rules, bills, settings)
    dashboard = DashboardService(db, accounts, bills, rules, spending, checkins)

    def facts() -> Facts:
        now = dt.datetime.now(dates.zone())
        board = dashboard.build("30d")
        bills_acct = board["bills"]
        if bills_acct:
            acct = accounts.get(bills_acct["account_id"])
            bills_acct = {**bills_acct, "alert": bool(acct and acct["alert_below"])}
        tomorrow = dates.today() + dt.timedelta(days=1)
        return Facts(
            today=dates.today().isoformat(),
            hour=now.hour,
            checkin_due=board["checkin"]["next"],
            last_checkin=(board["checkin"]["last"] or {}).get("date"),
            flags=board["checkin"]["flags"],
            bills=bills_acct,
            spending=board["spending"],
            by_hand_tomorrow=[b for b in bills.due(tomorrow, tomorrow) if b["how"] == "manual"],
        )

    return Services(
        config=config,
        db=db,
        settings=settings,
        auth=AuthService(db, enabled=config.auth),
        keys=ApiKeyService(db),
        accounts=accounts,
        bills=bills,
        rules=rules,
        spending=spending,
        checkins=checkins,
        imports=ImportService(db, accounts, rules, bills),
        dashboard=dashboard,
        notifications=Notifier(db, facts),
        updates=UpdateService(settings, Path(config.db_path).parent / "update"),
    )
