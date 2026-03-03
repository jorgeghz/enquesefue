"""
Timezone utilities for consistent date handling across all services.

Problem solved: the server runs in UTC (Railway), but expense dates should
reflect the user's local calendar day. GPT-4o returns midnight naive datetimes;
storing them as UTC midnight causes browsers in UTC-6 to display the previous day.

Fix: normalize every parsed expense date to noon in the user's timezone.
Noon local time stays as the same calendar day when converted to UTC for any
timezone within ±11 hours of the local zone.
"""
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def now_local(tz_name: str) -> datetime:
    """Current time as a timezone-aware datetime in the given IANA timezone."""
    return datetime.now(ZoneInfo(tz_name))


def normalize_expense_date(dt: datetime, tz_name: str) -> datetime:
    """
    Normalize a parsed expense date to noon in the user's timezone.

    - Naive datetime (no tzinfo): treated as being in `tz_name`, time set to noon.
    - Aware datetime: converted to `tz_name` first, then time set to noon.

    This prevents midnight-UTC dates from displaying as the previous calendar
    day in the user's browser.
    """
    tz = ZoneInfo(tz_name)
    if dt.tzinfo is None:
        return dt.replace(hour=12, minute=0, second=0, microsecond=0, tzinfo=tz)
    local = dt.astimezone(tz)
    return local.replace(hour=12, minute=0, second=0, microsecond=0)


def is_valid_timezone(tz_name: str) -> bool:
    """Return True if tz_name is a valid IANA timezone identifier."""
    try:
        ZoneInfo(tz_name)
        return True
    except (ZoneInfoNotFoundError, KeyError):
        return False
