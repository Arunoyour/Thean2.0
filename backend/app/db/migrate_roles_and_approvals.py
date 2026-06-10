"""Migration 024 — admin roles, approval workflow, notifications, audit log."""
import asyncio
from pathlib import Path

import asyncpg

from app.core.config import get_settings


async def run_migration() -> None:
    settings = get_settings()
    database_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    migration_path = (
        Path(__file__).resolve().parents[2] / "migrations" / "024_admin_roles_and_approvals.sql"
    )
    sql = migration_path.read_text(encoding="utf-8")
    connection = await asyncpg.connect(database_url)
    try:
        await connection.execute(sql)
        print("Migration 024 applied successfully.")
    finally:
        await connection.close()


def main() -> None:
    asyncio.run(run_migration())


if __name__ == "__main__":
    main()
