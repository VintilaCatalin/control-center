"""Small, date-only recurrence rules for Tasks.

Rules deliberately avoid timestamps and time zones.  Each occurrence carries
its canonical ``occurrence_on`` date, so completing it late never shifts the
series cadence.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any


FREQUENCIES = {"daily", "weekly", "monthly", "custom"}
UNITS = {"days", "weeks", "months"}


def normalize_recurrence(value: Any, *, occurrence_on: str | None = None) -> dict[str, Any] | None:
    if value in (None, "", False):
        return None
    if not isinstance(value, dict):
        raise ValueError("recurrence must be an object")
    frequency = str(value.get("frequency") or "").lower()
    if frequency not in FREQUENCIES:
        raise ValueError("invalid recurrence frequency")

    if frequency == "daily":
        interval, unit = 1, "days"
    elif frequency == "weekly":
        interval, unit = 1, "weeks"
    elif frequency == "monthly":
        interval, unit = 1, "months"
    else:
        try:
            interval = int(value.get("interval") or 1)
        except (TypeError, ValueError) as exc:
            raise ValueError("recurrence interval must be a number") from exc
        unit = str(value.get("unit") or "days").lower()
        if interval < 1 or interval > 365:
            raise ValueError("recurrence interval must be between 1 and 365")
        if unit not in UNITS:
            raise ValueError("invalid recurrence unit")

    raw_occurrence = occurrence_on or value.get("occurrence_on") or date.today().isoformat()
    try:
        clean_occurrence = date.fromisoformat(str(raw_occurrence)).isoformat()
    except ValueError as exc:
        raise ValueError("recurrence occurrence must be YYYY-MM-DD") from exc
    normalized = {"frequency": frequency, "interval": interval, "unit": unit, "occurrence_on": clean_occurrence}
    if unit == "months":
        try:
            normalized["month_day"] = max(1, min(31, int(value.get("month_day") or date.fromisoformat(clean_occurrence).day)))
        except (TypeError, ValueError):
            normalized["month_day"] = date.fromisoformat(clean_occurrence).day
    return normalized


def advance_date(value: str, recurrence: dict[str, Any]) -> str:
    current = date.fromisoformat(value)
    interval = int(recurrence["interval"])
    unit = str(recurrence["unit"])
    if unit == "days":
        return (current + timedelta(days=interval)).isoformat()
    if unit == "weeks":
        return (current + timedelta(weeks=interval)).isoformat()

    month_index = current.year * 12 + current.month - 1 + interval
    year, zero_month = divmod(month_index, 12)
    month = zero_month + 1
    day = min(int(recurrence.get("month_day") or current.day), calendar.monthrange(year, month)[1])
    return date(year, month, day).isoformat()


def offset_date(value: str, days: int | None) -> str | None:
    if days is None:
        return None
    return (date.fromisoformat(value) + timedelta(days=int(days))).isoformat()


def day_offset(value: str | None, occurrence_on: str) -> int | None:
    if not value:
        return None
    return (date.fromisoformat(value) - date.fromisoformat(occurrence_on)).days
