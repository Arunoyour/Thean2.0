from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()


def _schema_search_path(schema_name: str) -> str:
    escaped_schema = schema_name.replace('"', '""')
    return f'"{escaped_schema}", public'


engine = create_async_engine(
    settings.database_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args={
        "server_settings": {
            "search_path": _schema_search_path(settings.core_database_schema),
        },
    },
)

pharmacy_engine = create_async_engine(
    settings.pharmacy_database_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args={
        "server_settings": {
            "search_path": _schema_search_path(settings.pharmacy_database_schema),
        },
    },
)

# Delivery has its own database + schema "D".
# Falls back to pharmacy DB connection (same PG server, different schema) when
# DELIVERY_DATABASE_URL is not configured in .env.
_delivery_db_url = settings.delivery_database_url or settings.pharmacy_database_url

delivery_engine = create_async_engine(
    _delivery_db_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args={
        "server_settings": {
            "search_path": _schema_search_path(settings.delivery_database_schema),
        },
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

PharmacySessionLocal = async_sessionmaker(
    bind=pharmacy_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

DeliverySessionLocal = async_sessionmaker(
    bind=delivery_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session


async def get_pharmacy_session() -> AsyncIterator[AsyncSession]:
    async with PharmacySessionLocal() as session:
        yield session


async def get_delivery_session() -> AsyncIterator[AsyncSession]:
    async with DeliverySessionLocal() as session:
        yield session


# ── Haircut DB ────────────────────────────────────────────────────────────
haircut_engine = create_async_engine(
    settings.haircut_database_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args={
        "server_settings": {
            "search_path": _schema_search_path(settings.haircut_database_schema),
        },
    },
)

HaircutSessionLocal = async_sessionmaker(
    bind=haircut_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_haircut_session() -> AsyncIterator[AsyncSession]:
    async with HaircutSessionLocal() as session:
        yield session
