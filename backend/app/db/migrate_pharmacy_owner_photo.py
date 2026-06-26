import asyncio
from pathlib import Path
import asyncpg
from app.core.config import get_settings


async def run_migration() -> None:
    settings = get_settings()
    database_url = settings.pharmacy_database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    sql = (Path(__file__).resolve().parents[2] / "migrations" / "044_pharmacy_owner_photo.sql").read_text(encoding="utf-8")
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute(sql)
        print("Migration 044 (pharmacy owner_photo_url) applied.")
    finally:
        await conn.close()


def main() -> None:
    asyncio.run(run_migration())


if __name__ == "__main__":
    main()
