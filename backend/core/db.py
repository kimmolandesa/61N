import asyncpg
from .config import settings

pool = None


async def get_pool():
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            database=settings.DB_NAME,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            min_size=2,
            max_size=10,
        )
    return pool


async def close_pool():
    global pool
    if pool:
        await pool.close()
        pool = None
