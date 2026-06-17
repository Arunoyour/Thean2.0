import asyncio
from pathlib import Path

import asyncpg

from app.core.config import get_settings


async def run_migration() -> None:
    settings = get_settings()
    database_url = settings.pharmacy_database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    migration_path = (
        Path(__file__).resolve().parents[2]
        / "migrations"
        / "039_partial_fulfillment.sql"
    )
    sql = migration_path.read_text(encoding="utf-8")

    connection = await asyncpg.connect(database_url)
    try:
        await connection.execute(sql)
        print("Migration 039 applied: partial_fulfillment_allowed/decided_at/split_from_order_id columns added.")
    finally:
        await connection.close()


def main() -> None:
    asyncio.run(run_migration())


if __name__ == "__main__":
    main()
