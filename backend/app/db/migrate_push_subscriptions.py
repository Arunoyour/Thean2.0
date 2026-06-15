"""Migration 027 — Web Push subscription storage for pharmacy accounts."""
import asyncio
import asyncpg
from app.core.config import get_settings


SQL = """
CREATE TABLE IF NOT EXISTS "PH".push_subscriptions (
    subscription_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          UUID NOT NULL,
    endpoint            TEXT NOT NULL,
    p256dh              TEXT NOT NULL,
    auth                TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subs_account
    ON "PH".push_subscriptions (account_id);
"""


async def run() -> None:
    settings = get_settings()
    url = settings.pharmacy_database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    conn = await asyncpg.connect(url)
    try:
        await conn.execute(SQL)
        print("Migration 027 — push_subscriptions: done.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run())
