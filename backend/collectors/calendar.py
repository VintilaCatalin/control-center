"""ICS calendar collector.

Extracted verbatim from the pre-modularization panel/server.py.
"""

import re
from datetime import datetime, timedelta, timezone
import requests
import icalendar
import recurring_ical_events





# ──────────────────────────────────────────────
#  CALENDAR - any plain ICS feed (Google, Outlook, Apple all export one)
# ──────────────────────────────────────────────

def collect_calendar(cfg, _shared):
    url = str(cfg["calendar_ics"]).strip()
    if not url: return {"configured": False, "items": []}
    # webcal:// is just the "open this in a calendar app" spelling of https://
    url = re.sub(r"^webcal://", "https://", url, flags=re.I)
    try:
        r = requests.get(url, timeout=10,
                         headers={"User-Agent": "Mozilla/5.0 (compatible; HomePanel/1.0)"})
        r.raise_for_status()
        cal = icalendar.Calendar.from_ical(r.content)
    except Exception as e:
        return {"configured": True, "items": [], "error": str(e)[:160]}

    now = datetime.now()
    try:
        # recurring_ical_events expands RRULEs (daily standups, birthdays,
        # anniversaries…) into real occurrences - without it a calendar
        # widget would only ever show one-off events, which is most feeds.
        events = recurring_ical_events.of(cal).between(now - timedelta(days=60), now + timedelta(days=180))
    except Exception as e:
        return {"configured": True, "items": [], "error": str(e)[:160]}

    items = []
    for event in events:
        start = event.get("DTSTART")
        if not start: continue
        start = start.dt
        all_day = not isinstance(start, datetime)
        when = datetime.combine(start, datetime.min.time()) if all_day else start
        try: ts = when.timestamp()
        except Exception: continue
        end_field = event.get("DTEND")
        ongoing = False
        if not all_day and end_field:
            try:
                now_cmp = now.astimezone(start.tzinfo) if start.tzinfo else now
                ongoing = start <= now_cmp <= end_field.dt
            except Exception:
                ongoing = False
        items.append({
            "title": str(event.get("SUMMARY") or "Untitled"),
            "location": str(event.get("LOCATION") or "") or None,
            "when": ts, "all_day": all_day, "ongoing": ongoing,
        })
    items.sort(key=lambda i: i["when"])
    return {"configured": True, "items": items[:120]}
