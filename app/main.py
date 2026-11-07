"""The FastAPI app: `uvicorn app.main:app`. Build one for tests with create_app(Config(...))."""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse

from app.container import build_services
from app.core.config import Config, ConfigError
from app.core.errors import install_error_handlers
from app.core.security import DOCS_POLICY, SecurityHeadersMiddleware
from app.core.spa import mount_spa
from app.core.version import VERSION, about
from app.features.accounts.router import router as accounts_router
from app.features.auth.middleware import AuthMiddleware
from app.features.auth.router import household as household_router
from app.features.auth.router import router as auth_router
from app.features.backups.router import router as backups_router
from app.features.bills.router import router as bills_router
from app.features.checkins.router import router as checkins_router
from app.features.dashboard.router import router as dashboard_router
from app.features.demo.seed import seed as seed_demo
from app.features.imports.router import router as imports_router
from app.features.investments.router import router as investments_router
from app.features.keys.router import router as keys_router
from app.features.keys.router import v1 as keys_v1_router
from app.features.notifications.router import router as notifications_router
from app.features.retirement.router import router as retirement_router
from app.features.rules.router import router as rules_router
from app.features.settings.router import router as settings_router
from app.features.setup.router import router as setup_router
from app.features.spending.router import router as spending_router
from app.features.updates.router import router as updates_router

log = logging.getLogger(__name__)

health_router = APIRouter()


@health_router.get("/healthz", include_in_schema=False)
async def healthz():
    """For Docker's healthcheck and anything watching the app: it's up, and which version."""
    return {"ok": True, **about()}


ROUTERS = [
    auth_router,
    household_router,
    keys_router,
    keys_v1_router,
    notifications_router,
    settings_router,
    setup_router,
    accounts_router,
    bills_router,
    rules_router,
    checkins_router,
    imports_router,
    spending_router,
    dashboard_router,
    investments_router,
    retirement_router,
    updates_router,
    backups_router,
    health_router,
]


def create_app(config: Config | None = None, *, serve_web: bool = True) -> FastAPI:
    config = config or Config.from_env()
    services = build_services(config)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await asyncio.to_thread(services.db.keep_private)
        await asyncio.to_thread(services.db.migrate)
        await asyncio.to_thread(services.spending.seed)
        if config.demo and await asyncio.to_thread(seed_demo, services.db):
            log.info("Filled the empty database with the demo household (DEMO=1).")
        if services.auth.enabled:
            await asyncio.to_thread(services.auth.prepare_setup_code)  # while there's no account yet
        else:
            log.warning(
                "Sign-in is turned off (AUTH=%s): anyone who can reach WheresMyMoney can see the household's money and"
                " change it. Only do this if something in front of it, such as a reverse proxy, handles sign-in.",
                os.environ.get("AUTH", "false"),
            )
        if config.background:
            await services.updates.start()  # asks GitHub for a newer version every few hours, unless turned off
            await services.notifications.start()  # check-in reminders and alerts
            await services.backups.start()  # a backup each night at 3am
            await services.investments.start()  # fund prices, once a day after the market shuts
        yield
        if config.background:
            await services.investments.stop()
            await services.backups.stop()
            await services.notifications.stop()
            await services.updates.stop()

    # The API's documentation is only served with API_DOCS=1, and then under /api, so it needs signing in too.
    app = FastAPI(
        title="WheresMyMoney",
        version=VERSION,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if config.api_docs else None,
    )
    app.state.services = services
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(AuthMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)  # outermost, so even refusals carry the headers
    install_error_handlers(app)
    for router in ROUTERS:
        app.include_router(router)
    if config.api_docs:
        add_docs(app)
    if serve_web:
        mount_spa(app)
    return app


def add_docs(app: FastAPI) -> None:
    """/api/docs and /api/redoc, which load their viewers from a CDN (hence their own, looser policy)."""
    headers = {"Content-Security-Policy": DOCS_POLICY}

    @app.get("/api/docs", include_in_schema=False)
    async def docs() -> HTMLResponse:
        page = get_swagger_ui_html(openapi_url="/api/openapi.json", title="WheresMyMoney API")
        return HTMLResponse(bytes(page.body).decode(), headers=headers)

    @app.get("/api/redoc", include_in_schema=False)
    async def redoc() -> HTMLResponse:
        page = get_redoc_html(openapi_url="/api/openapi.json", title="WheresMyMoney API")
        return HTMLResponse(bytes(page.body).decode(), headers=headers)


# Files the app creates (its database, backups, the set-up code) are readable by its own user only.
os.umask(0o077)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
try:
    app = create_app()
except ConfigError as e:  # a mistyped setting: say which, once, rather than a traceback on every restart
    raise SystemExit(f"WheresMyMoney can't start. {e}") from None
