"""Time helpers used across persistence and token code."""
from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return a timezone-naive UTC timestamp for existing SQLite DateTime columns."""
    return datetime.now(UTC).replace(tzinfo=None)
