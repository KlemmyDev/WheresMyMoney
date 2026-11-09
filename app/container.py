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
from app.features.backups.service import BackupService
from app.features.bills.service import BillsService
from app.features.checkins.service import CheckinService
from app.features.dashboard.service import DashboardService
from app.features.fire.service import FireService
from app.features.imports.service import ImportService
from app.features.investments.service import InvestmentsService
from app.features.keys.service import ApiKeyService
from app.features.networth.service import NetWorthService
from app.features.notifications.rules import Facts
from app.features.notifications.service import Notifier
from app.features.retirement.service import RetirementService
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
    investments: InvestmentsService
    retirement: RetirementService
    networth: NetWorthService
    fire: FireService
    notifications: Notifier
    updates: UpdateService
    backups: BackupService


def build_services(config: Config) -> Services:
    db = Database(config.db_path)
    settings = SettingsStore(db)
    bills = BillsService(db)
    rules = RulesService(db)
    accounts = AccountsService(db, bills)
    spending = SpendingService(db)
    checkins = CheckinService(db, accounts, rules, bills, settings)
    dashboard = DashboardService(db, accounts, bills, rules, spending, checkins)
    investments = InvestmentsService(db)
    retirement = RetirementService(db)

    def last_statement() -> str | None:
        with db.reading() as conn:
            row = conn.execute("SELECT MAX(date) FROM transactions WHERE kind = 'statement'").fetchone()
        return row[0] if row else None

    def facts() -> Facts:
        now = dt.datetime.now(dates.zone())
        board = dashboard.build("30d")
        bills_acct = board["bills"]
        if bills_acct:
            acct = accounts.get(bills_acct["account_id"])
            bills_acct = {**bills_acct, "alert": bool(acct and acct["alert_below"])}
        today = dates.today()
        return Facts(
            today=dates.today().isoformat(),
            hour=now.hour,
            checkin_due=board["checkin"]["next"],
            last_checkin=(board["checkin"]["last"] or {}).get("date"),
            flags=board["checkin"]["flags"],
            bills=bills_acct,
            spending=board["spending"],
            bills_ahead=bills.due(today, today + dt.timedelta(days=14)),
            last_statement=last_statement(),
            price_changes=spending.price_changes(),
            spotted=[{"key": x["key"], "name": x["name"]} for x in bills.spotted()["suggestions"]],
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
        investments=investments,
        retirement=retirement,
        networth=NetWorthService(db, accounts, investments, retirement),
        fire=FireService(db, accounts, investments, retirement, dashboard),
        notifications=Notifier(db, facts),
        updates=UpdateService(settings, Path(config.db_path).parent / "update"),
        backups=BackupService(config.db_path),
    )
