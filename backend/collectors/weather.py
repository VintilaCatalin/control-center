"""Weather collector.

Extracted verbatim from the pre-modularization panel/server.py, later
extended with hourly forecast + a longer daily outlook + day/night state
(see collect_weather's params below).
"""

from datetime import datetime
import requests


WEATHER_CODES = {
    0: ("Clear", "clear"), 1: ("Mainly clear", "clear"), 2: ("Partly cloudy", "partly-cloudy"), 3: ("Overcast", "cloud"),
    45: ("Fog", "fog"), 48: ("Freezing fog", "fog"), 51: ("Light drizzle", "rain"), 53: ("Drizzle", "rain"),
    61: ("Light rain", "rain"), 63: ("Rain", "rain"), 65: ("Heavy rain", "rain"), 71: ("Light snow", "snow"),
    80: ("Showers", "rain"), 95: ("Thunderstorm", "storm"),
}

# 12-hour label without a leading zero, portable across platforms - the
# obvious "%-I%p" strftime flag is a glibc/macOS-only GNU extension that
# Windows' C runtime doesn't support (this app only ever runs on Windows).
def _hour_label(dt):
    hour12 = dt.hour % 12 or 12
    return f"{hour12}{'am' if dt.hour < 12 else 'pm'}"

def collect_weather(cfg, _shared):
    unit = "fahrenheit" if cfg["units"].strip().lower().startswith("f") else "celsius"
    r = requests.get("https://api.open-meteo.com/v1/forecast", timeout=10, params={
        "latitude": cfg["latitude"], "longitude": cfg["longitude"],
        "current": "temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m,is_day",
        "hourly": "temperature_2m,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code",
        "temperature_unit": unit, "timezone": "auto", "forecast_days": "7",
    })
    r.raise_for_status()
    data = r.json()
    now = data.get("current", {})
    daily = data.get("daily", {})
    hourly = data.get("hourly", {})
    code = int(now.get("weather_code") or 0)
    label, icon = WEATHER_CODES.get(code, ("—", "cloud"))

    days = []
    for i, date in enumerate((daily.get("time") or [])[:7]):
        d_code = int((daily.get("weather_code") or [0])[i] or 0)
        days.append({"date": date, "label": datetime.fromisoformat(date).strftime("%a"),
                     "high": round((daily.get("temperature_2m_max") or [0])[i]),
                     "low": round((daily.get("temperature_2m_min") or [0])[i]),
                     "icon": WEATHER_CODES.get(d_code, ("", "cloud"))[1]})

    # Open-Meteo returns the whole requested window as one flat array -
    # find where "now" actually starts in it rather than assuming index 0
    # (the first entry is midnight of day 0, not the current hour).
    hours = []
    times = hourly.get("time") or []
    current_time = str(now.get("time") or "")
    start = next((i for i, t in enumerate(times) if t >= current_time), 0)
    h_codes = hourly.get("weather_code") or []
    h_temps = hourly.get("temperature_2m") or []
    for i in range(start, min(start + 10, len(times))):
        h_code = int((h_codes[i] if i < len(h_codes) else 0) or 0)
        hours.append({"time": times[i], "label": _hour_label(datetime.fromisoformat(times[i])),
                      "temp": round(h_temps[i] if i < len(h_temps) else 0),
                      "icon": WEATHER_CODES.get(h_code, ("", "cloud"))[1]})

    return {"place": cfg["place"], "temp": round(now.get("temperature_2m", 0)),
            "feels": round(now.get("apparent_temperature", 0)), "humidity": round(now.get("relative_humidity_2m", 0)),
            "wind": round(now.get("wind_speed_10m", 0)), "label": label, "icon": icon,
            "is_day": bool(now.get("is_day", 1)),
            "unit": "F" if unit == "fahrenheit" else "C", "days": days, "hours": hours}
