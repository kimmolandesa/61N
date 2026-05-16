import time
from pathlib import Path
from threading import Lock


class TTLCache:
    """In-memory cache for small JSON API responses (weather, etc.). Not for tile bytes."""

    def __init__(self):
        self._store: dict[str, tuple[object, float]] = {}
        self._lock = Lock()

    def get(self, key: str) -> object | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: object, ttl_seconds: int) -> None:
        with self._lock:
            self._store[key] = (value, time.monotonic() + ttl_seconds)

    def clear_expired(self) -> None:
        now = time.monotonic()
        with self._lock:
            expired = [k for k, (_, exp) in self._store.items() if now > exp]
            for k in expired:
                del self._store[k]


class FileTileCache:
    """Filesystem cache for raw MVT tile bytes. Persists across restarts."""

    def __init__(self, cache_dir: str):
        self._base = Path(cache_dir)
        self._base.mkdir(parents=True, exist_ok=True)

    def _path(self, z: int, x: int, y: int) -> Path:
        return self._base / str(z) / str(x) / f"{y}.mvt"

    def get(self, z: int, x: int, y: int) -> bytes | None:
        path = self._path(z, x, y)
        if path.exists():
            return path.read_bytes()
        return None

    def set(self, z: int, x: int, y: int, data: bytes) -> None:
        path = self._path(z, x, y)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
