import asyncio
from pathlib import Path

from sqlalchemy import text

from app.db.session import pharmacy_engine


async def run_migration() -> None:
    migration_sql = (
        Path(__file__).resolve().parents[2]
        / "migrations"
        / "006_pharmacy_commercial_settings.sql"
    ).read_text()

    async with pharmacy_engine.begin() as connection:
        for statement in migration_sql.split(";"):
            if statement.strip():
                await connection.execute(text(statement))


if __name__ == "__main__":
    asyncio.run(run_migration())
