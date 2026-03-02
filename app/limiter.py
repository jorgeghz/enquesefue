"""
Central rate-limiter instance shared across all routers.

Uses SlowAPI (built on the `limits` library) with IP-based keying.
Behind a reverse proxy (Railway, nginx), the real client IP is read
from the X-Forwarded-For header before falling back to request.client.host.
"""
from fastapi import Request
from slowapi import Limiter


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_get_client_ip)
