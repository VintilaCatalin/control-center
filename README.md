# Control Center

A personal Windows dashboard.

**Status: early, still iterating.** This README is intentionally short for
now - detailed setup/troubleshooting docs will come once the product itself
settles down.

## Requirements

- Windows 10 or 11
- Python 3.11+
- A Chromium-based browser (Brave, Chrome, or Edge)

## Run it

```
pip install -r requirements.txt
python control_center.py
```

First launch walks you through a short setup: your name, your location, a
notes folder and a game library if you want them, and any external
services you'd like to connect (all optional, all skippable). Everything
still works with nothing connected - integrations just add more to see,
they're never required.

## Notes

- Your settings live outside this folder, under `%USERPROFILE%\.config\lightsync\` - deleting it resets the app to a fresh install.
- `python control_center.py --stop` stops it; `--server-only` runs just the backend.
