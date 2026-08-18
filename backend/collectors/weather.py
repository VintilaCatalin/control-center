"""Weather collector.

Extracted verbatim from the pre-modularization panel/server.py.
"""

from datetime import datetime, timedelta, timezone
import requests


WEATHER_CODES = {
    0: ("Clear", "clear"), 1: ("Mainly clear", "clear"), 2: ("Partly cloudy", "cloud"), 3: ("Overcast", "cloud"),
    45: ("Fog", "fog"), 48: ("Freezing fog", "fog"), 51: ("Light drizzle", "rain"), 53: ("Drizzle", "rain"),
    61: ("Light rain", "rain"), 63: ("Rain", "rain"), 65: ("Heavy rain", "rain"), 71: ("Light snow", "snow"),
    80: ("Showers", "rain"), 95: ("Thunderstorm", "storm"),
}

def collect_weather(cfg, _shared):
    unit = "fahrenheit" if cfg["units"].strip().lower().startswith("f") else "celsius"
    r = requests.get("https://api.open-meteo.com/v1/forecast", timeout=10, params={
        "latitude": cfg["latitude"], "longitude": cfg["longitude"],
        "current": "temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code",
        "temperature_unit": unit, "timezone": "auto", "forecast_days": "4",
    })
    r.raise_for_status()
    data = r.json()
    now = data.get("current", {})
    daily = data.get("daily", {})
    code = int(now.get("weather_code") or 0)
    label, icon = WEATHER_CODES.get(code, ("\u2014", "cloud"))
    days = []
    for i, date in enumerate((daily.get("time") or [])[:4]):
        d_code = int((daily.get("weather_code") or [0])[i] or 0)
        days.append({"date": date, "label": datetime.fromisoformat(date).strftime("%a"),
                     "high": round((daily.get("temperature_2m_max") or [0])[i]),
                     "low": round((daily.get("temperature_2m_min") or [0])[i]),
                     "icon": WEATHER_CODES.get(d_code, ("", "cloud"))[1]})
    return {"place": cfg["place"], "temp": round(now.get("temperature_2m", 0)),
            "feels": round(now.get("apparent_temperature", 0)), "humidity": round(now.get("relative_humidity_2m", 0)),
            "wind": round(now.get("wind_speed_10m", 0)), "label": label, "icon": icon,
            "unit": "F" if unit == "fahrenheit" else "C", "days": days}
