"""Migration 025 — delivery account role column (DELIVERY_BOY / TEAM_LEAD)."""
import asyncio
from pathlib import Path

import asyncpg

from app.core.config import get_settings


async def run_migration() -> None:
    settings = get_settings()
    # Use delivery DB URL, fall back to pharmacy URL if not configured
    db_url = (settings.delivery_database_url or settings.pharmacy_database_url).replace(
        "postgresql+asyncpg://", "postgresql://", 1
    )
    migration_path = (
        Path(__file__).resolve().parents[2] / "migrations" / "025_delivery_roles.sql"
    )
    sql = migration_path.read_text(encoding="utf-8")
    connection = await asyncpg.connect(db_url)
    try:
        await connection.execute(sql)
        print("Migration 025 applied successfully.")
    finally:
        await connection.close()


def main() -> None:
    asyncio.run(run_migration())


if __name__ == "__main__":
    main()
