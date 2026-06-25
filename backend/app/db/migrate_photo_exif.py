import asyncio

import asyncpg

from app.core.config import get_settings

PHARMACY_SQL = """
SET search_path TO "PH", public;
ALTER TABLE pharmacy_profiles
    ADD COLUMN IF NOT EXISTS photo_taken_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS photo_lat       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS photo_lng       DOUBLE PRECISION;
"""

HAIRCUT_SQL = """
SET search_path TO "HC", public;
ALTER TABLE barber_shops
    ADD COLUMN IF NOT EXISTS photo_taken_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS photo_lat       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS photo_lng       DOUBLE PRECISION;
"""


async def run_migration() -> None:
    settings = get_settings()

    for label, url, sql in [
        ("pharmacy", settings.pharmacy_database_url, PHARMACY_SQL),
        ("haircut",  settings.haircut_database_url,  HAIRCUT_SQL),
    ]:
        db_url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
        conn = await asyncpg.connect(db_url)
        try:
            await conn.execute(sql)
            print(f"  [{label}] photo_taken_at, photo_lat, photo_lng added.")
        finally:
            await conn.close()

    print("Migration 042 complete.")


def main() -> None:
    asyncio.run(run_migration())


if __name__ == "__main__":
    main()
