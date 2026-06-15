"""Migration 028 — delivery_location_log: GPS heartbeat trail per delivery order."""
import asyncio
import asyncpg
from app.core.config import get_settings


SQL = """
CREATE TABLE IF NOT EXISTS "D".delivery_location_log (
    log_id              BIGSERIAL PRIMARY KEY,
    delivery_order_id   UUID NOT NULL,
    account_id          UUID NOT NULL,
    lat                 NUMERIC(10, 7) NOT NULL,
    lng                 NUMERIC(10, 7) NOT NULL,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loc_log_order_time
    ON "D".delivery_location_log (delivery_order_id, recorded_at);

CREATE INDEX IF NOT EXISTS idx_loc_log_account_time
    ON "D".delivery_location_log (account_id, recorded_at);
"""


async def run() -> None:
    settings = get_settings()
    url = (settings.delivery_database_url or settings.pharmacy_database_url).replace(
        "postgresql+asyncpg://", "postgresql://", 1
    )
    conn = await asyncpg.connect(url)
    try:
        await conn.execute(SQL)
        print("Migration 028 — delivery_location_log: done.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run())
