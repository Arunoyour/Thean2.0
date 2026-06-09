import asyncio
from contextlib import suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.session import PharmacySessionLocal
from app.services.customer_order_service import (
    handle_expired_customer_review_windows,
    handle_expired_pharmacy_assignments,
    handle_expired_price_reviews,
)


async def pharmacy_order_sla_worker() -> None:
    while True:
        await asyncio.sleep(5)
        async with PharmacySessionLocal() as session:
            await handle_expired_customer_review_windows(session)
            await handle_expired_pharmacy_assignments(session)
            await handle_expired_price_reviews(session)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Thean Core API",
        version="0.1.0",
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url="/redoc" if settings.app_env != "production" else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.cors_origins],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    Path(settings.media_root).mkdir(parents=True, exist_ok=True)
    app.include_router(api_router)
    app.mount(settings.media_url, StaticFiles(directory=settings.media_root), name="media")

    @app.on_event("startup")
    async def start_order_workers() -> None:
        app.state.pharmacy_order_sla_worker = asyncio.create_task(pharmacy_order_sla_worker())
        # Start COD 30-min reminder loop for delivery boys
        from app.services.delivery_service import ensure_cod_reminder_running
        ensure_cod_reminder_running()

    @app.on_event("shutdown")
    async def stop_order_workers() -> None:
        worker = getattr(app.state, "pharmacy_order_sla_worker", None)
        if worker:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker

    return app


app = create_app()
