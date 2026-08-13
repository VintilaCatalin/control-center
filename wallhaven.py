#!/usr/bin/env python
"""
wallhaven.py - browse Wallhaven and set a wallpaper in one click.

The Windows answer to the Noctalia wallhaven plugin. Filter by toplist,
favourites, resolution and so on, see the results as thumbnails, click one:
it downloads the full-resolution file into your Spans folder, builds the
DPI-corrected span through spanwall, applies it, and hands the palette to
the light picker. No browser, no downloads folder, no dragging files about.

Usage:
    wallhaven.py                 # the browser

Optional, in %USERPROFILE%\\.config\\lightsync\\config.ini:
    wallhaven_key   = <your API key>      # enables NSFW + your own settings
    wallhaven_user  = <your username>     # enables your collections
    wallhaven_atleast = 3440x2880         # minimum resolution
"""

import configparser
import io
import os
import sys
import threading
import subprocess
import winreg
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests
from PIL import Image, ImageTk

import wallpicker            # reuse the download -> spanwall -> lights chain
import lights                # shared palette constants

API = "https://wallhaven.cc/api/v1"
CONFIG_FILE = Path.home() / ".config" / "lightsync" / "config.ini"
THUMB_CACHE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "spanwall" / "wh"

DEFAULTS = {
    "wallhaven_key": "",
    "wallhaven_user": "",
    "wallhaven_atleast": "3440x2880",
    "wallhaven_categories": "111",     
    "wallhaven_purity": "100",         
    "wallhaven_ratios": "",
}

COLS = 4
TILE_W, TILE_H = 250, 167          

BG, FG, MUTED, CARD = lights.BG, lights.FG, lights.MUTED, "#1c1f27"

SORTS = [
    ("Toplist", "toplist"),
    ("Most favourited", "favorites"),
    ("Most viewed", "views"),
    ("Latest", "date_added"),
    ("Random", "random"),
]
RANGES = [("Day", "1d"), ("Week", "1w"), ("Month", "1M"),
          ("3 months", "3M"), ("Year", "1y")]
PURITY_MAP = {
    "SFW": "100", 
    "Sketchy": "010", 
    "SFW + Sketchy": "110", 
    "NSFW (Key)": "001", 
    "Everything (Key)": "111"
}


def load_config():
    cfg = configparser.ConfigParser(inline_comment_prefixes=("#", ";"))
    cfg["lightsync"] = DEFAULTS
    if CONFIG_FILE.exists():
        cfg.read(CONFIG_FILE)
    section = cfg["lightsync"]
    for k, v in DEFAULTS.items():
        if k not in section:
            section[k] = v
    return section


# ──────────────────────────────────────────────
#  API
# ──────────────────────────────────────────────

class Wallhaven:
    def __init__(self, cfg):
        self.cfg = cfg
        self.key = cfg["wallhaven_key"].strip()
        self.session = requests.Session()
        self.seed = None

    def _get(self, path, **params):
        if self.key:
            params["apikey"] = self.key
        r = self.session.get(f"{API}{path}", params=params, timeout=15)
        if r.status_code == 429:
            raise RuntimeError("Wallhaven rate limit hit (45/min) - wait a moment")
        if r.status_code == 401:
            raise RuntimeError("Wallhaven rejected the API key")
        r.raise_for_status()
        return r.json()

    def search(self, query="", sorting="toplist", top_range="1M", page=1,
               categories=None, atleast=None, purity=None):
        params = {
            "sorting": sorting,
            "page": page,
            "categories": categories or self.cfg["wallhaven_categories"],
            "purity": purity or self.cfg["wallhaven_purity"],
        }
        if query.strip():
            params["q"] = query.strip()
        if sorting == "toplist":
            params["topRange"] = top_range
        if sorting == "random" and self.seed:
            params["seed"] = self.seed

        atleast = atleast if atleast is not None else self.cfg["wallhaven_atleast"]
        if atleast.strip():
            params["atleast"] = atleast.strip()
        if self.cfg["wallhaven_ratios"].strip():
            params["ratios"] = self.cfg["wallhaven_ratios"].strip()

        data = self._get("/search", **params)
        self.seed = (data.get("meta") or {}).get("seed") or self.seed
        return data.get("data", []), data.get("meta", {})

    def collections(self):
        user = self.cfg["wallhaven_user"].strip()
        if not user or not self.key:
            return []
        try:
            return self._get(f"/collections/{user}").get("data", [])
        except Exception:
            return []

    def collection(self, coll_id, page=1):
        user = self.cfg["wallhaven_user"].strip()
        data = self._get(f"/collections/{user}/{coll_id}", page=page)
        return data.get("data", []), data.get("meta", {})

    def thumb(self, item):
        THUMB_CACHE.mkdir(parents=True, exist_ok=True)
        cached = THUMB_CACHE / f"{item['id']}.jpg"
        if not cached.exists():
            url = (item.get("thumbs") or {}).get("small")
            r = self.session.get(url, timeout=15)
            r.raise_for_status()
            img = Image.open(io.BytesIO(r.content)).convert("RGB")
            img.thumbnail((TILE_W, TILE_H), Image.LANCZOS)
            img.save(cached, quality=88)
        return cached

    def download(self, item, folder):
        url = item["path"]
        name = f"wh-{item['id']}{Path(urlparse(url).path).suffix or '.jpg'}"
        target = Path(folder) / name
        if target.exists():
            return target
        r = self.session.get(url, timeout=60)
        r.raise_for_status()
        target.write_bytes(r.content)
        return target


# ──────────────────────────────────────────────
#  GUI
# ──────────────────────────────────────────────

def fix_desktops():
    """Force flush Windows per-desktop wallpaper cache."""
    try:
        vd_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops\Desktops"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, vd_path, 0, winreg.KEY_READ) as hkey:
            num_subkeys = winreg.QueryInfoKey(hkey)[0]
            for i in range(num_subkeys):
                subkey_name = winreg.EnumKey(hkey, i)
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, rf"{vd_path}\{subkey_name}", 0, winreg.KEY_ALL_ACCESS) as subkey:
                    try:
                        winreg.DeleteValue(subkey, "Wallpaper")
                    except FileNotFoundError:
                        pass
    except FileNotFoundError:
        pass
    subprocess.run(["taskkill", "/f", "/im", "explorer.exe"], capture_output=True)
    subprocess.Popen(["explorer.exe"])


def run_gui():
    import tkinter as tk
    from tkinter import ttk, messagebox

    cfg = load_config()
    api = Wallhaven(cfg)

    root = tk.Tk()
    root.title("Wallhaven")
    root.configure(bg=BG)

    state = {"page": 1, "items": [], "mode": ("search", None), "busy": False}
    keep = []                       

    # ── controls ──
    bar = tk.Frame(root, bg=BG, padx=20, pady=16)
    bar.pack(fill="x")

    tk.Label(bar, text="Wallhaven", bg=BG, fg=FG,
             font=("Segoe UI Semibold", 14)).pack(side="left", padx=(0, 16))

    query = tk.Entry(bar, bg=CARD, fg=FG, insertbackground=FG, bd=0,
                     relief="flat", font=("Segoe UI", 10), width=26)
    query.pack(side="left", ipady=6, padx=(0, 10))

    sort_names = [n for n, _ in SORTS]
    colls = api.collections()
    for c in colls:
        sort_names.append(f"\u2605 {c['label']}")

    sort_box = ttk.Combobox(bar, values=sort_names, state="readonly", width=18)
    sort_box.current(0)
    sort_box.pack(side="left", padx=(0, 10))

    range_box = ttk.Combobox(bar, values=[n for n, _ in RANGES],
                             state="readonly", width=10)
    range_box.current(2)
    range_box.pack(side="left", padx=(0, 10))

    res_box = ttk.Combobox(bar, state="normal", width=12,
                           values=["3440x2880", "3440x1440", "3840x2160",
                                   "2560x1440", "1920x1080", ""])
    res_box.set(cfg["wallhaven_atleast"])
    res_box.pack(side="left", padx=(0, 10))

    purity_box = ttk.Combobox(bar, values=list(PURITY_MAP.keys()), state="readonly", width=16)
    
    p_val = cfg.get("wallhaven_purity", "100")
    inv_map = {v: k for k, v in PURITY_MAP.items()}
    purity_box.set(inv_map.get(p_val, "SFW"))
    purity_box.pack(side="left", padx=(0, 10))

    status = tk.Label(bar, text="", bg=BG, fg=MUTED, font=("Segoe UI", 9))
    status.pack(side="right")

    # ── grid ──
    shell = tk.Frame(root, bg=BG)
    shell.pack(fill="both", expand=True)
    canvas = tk.Canvas(shell, bg=BG, highlightthickness=0, bd=0)
    scroll = tk.Scrollbar(shell, orient="vertical", command=canvas.yview)
    grid = tk.Frame(canvas, bg=BG, padx=20, pady=4)
    grid.bind("<Configure>",
              lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.create_window((0, 0), window=grid, anchor="nw")
    canvas.configure(yscrollcommand=scroll.set)
    canvas.pack(side="left", fill="both", expand=True)
    scroll.pack(side="right", fill="y")
    canvas.bind_all("<MouseWheel>",
                    lambda e: canvas.yview_scroll(int(-e.delta / 120), "units"))

    foot = tk.Frame(root, bg=BG, padx=20, pady=12)
    foot.pack(fill="x")

    def flat(parent, text, cmd, bg="#1f232c"):
        return tk.Button(parent, text=text, bg=bg, fg=FG, bd=0, relief="flat",
                         cursor="hand2", activebackground=bg, activeforeground=FG,
                         highlightthickness=0, font=("Segoe UI", 9),
                         padx=16, pady=6, command=cmd)

    def choose(item):
        if state.get("busy"):
            return
        state["busy"] = True
        status.configure(text="Applying wallpaper...")
        
        def work():
            try:
                path = api.download(item, wallpicker.WALL_FOLDER)
                wallpicker.set_wallpaper(path, then_lights=False)
                root.after(0, lambda: status.configure(text="Wallpaper applied!"))
            except Exception as e:
                root.after(0, lambda: status.configure(text="Failed to apply"))
            finally:
                state["busy"] = False
                
        threading.Thread(target=work, daemon=True).start()

    def clear_grid():
        for child in grid.winfo_children():
            child.destroy()
        keep.clear()

    def place_thumb(label, path):
        try:
            photo = ImageTk.PhotoImage(file=str(path))
        except Exception:
            return
        keep.append(photo)
        label.configure(image=photo, text="")

    def render(items):
        clear_grid()
        pool = ThreadPoolExecutor(max_workers=6)

        for i, item in enumerate(items):
            card = tk.Frame(grid, bg=CARD, highlightthickness=1,
                            highlightbackground=CARD)
            card.grid(row=i // COLS, column=i % COLS, padx=6, pady=6)

            thumb = tk.Label(card, bg=CARD, fg=MUTED, text="\u2026",
                             width=TILE_W, height=TILE_H, compound="center")
            thumb.configure(width=0, height=0)
            thumb.pack()
            thumb.bind("<Button-1>", lambda _e, it=item: choose(it))
            card.bind("<Button-1>", lambda _e, it=item: choose(it))

            meta = f"{item['dimension_x']}x{item['dimension_y']}"
            fav = item.get("favorites")
            if fav:
                meta += f"   \u2605 {fav}"
            tk.Label(card, text=meta, bg=CARD, fg=MUTED,
                     font=("Segoe UI", 8), pady=5).pack()

            for widget in (card, thumb):
                widget.bind("<Enter>",
                            lambda _e, c=card: c.configure(highlightbackground="#3d4658"))
                widget.bind("<Leave>",
                            lambda _e, c=card: c.configure(highlightbackground=CARD))

            def worker(it=item, lbl=thumb):
                try:
                    path = api.thumb(it)
                except Exception:
                    return
                root.after(0, place_thumb, lbl, path)

            pool.submit(worker)

        canvas.yview_moveto(0)

    def fetch(page=None):
        if state["busy"]:
            return
        state["busy"] = True
        if page is not None:
            state["page"] = page
        status.configure(text="loading\u2026")

        choice = sort_box.get()
        collection = next((c for c in colls if f"\u2605 {c['label']}" == choice), None)

        def work():
            try:
                if collection:
                    items, meta = api.collection(collection["id"], state["page"])
                else:
                    sorting = dict(SORTS)[choice]
                    items, meta = api.search(
                        query.get(), sorting,
                        dict(RANGES)[range_box.get()],
                        state["page"], 
                        atleast=res_box.get(),
                        purity=PURITY_MAP[purity_box.get()])
            except Exception as e:
                root.after(0, lambda: (status.configure(text="failed"),
                                       messagebox.showerror("Wallhaven", str(e)),
                                       state.update(busy=False)))
                return

            def done():
                state["items"] = items
                state["busy"] = False
                total = (meta or {}).get("last_page", "?")
                status.configure(text=f"page {state['page']} of {total}"
                                      f"   ·   {len(items)} results")
                render(items)
            root.after(0, done)

        threading.Thread(target=work, daemon=True).start()

    flat(foot, "\u2190 Prev", lambda: fetch(max(1, state["page"] - 1))).pack(side="left")
    flat(foot, "Next \u2192", lambda: fetch(state["page"] + 1)).pack(side="left", padx=8)
    flat(foot, "Fix Desktops", fix_desktops).pack(side="left", padx=8)
    flat(foot, "Search", lambda: fetch(1), bg="#242a36").pack(side="right")

    query.bind("<Return>", lambda _e: fetch(1))
    sort_box.bind("<<ComboboxSelected>>", lambda _e: fetch(1))
    range_box.bind("<<ComboboxSelected>>", lambda _e: fetch(1))
    res_box.bind("<Return>", lambda _e: fetch(1))
    purity_box.bind("<<ComboboxSelected>>", lambda _e: fetch(1))
    root.bind("<Escape>", lambda _e: root.destroy())

    width = 20 * 2 + COLS * (TILE_W + 12) + 24
    root.geometry(f"{width}x{min(root.winfo_screenheight() - 200, 980)}")
    root.update_idletasks()
    root.geometry(f"+{(root.winfo_screenwidth() - width) // 2}+60")
    root.focus_force()

    fetch(1)
    root.mainloop()

if __name__ == "__main__":
    try:
        run_gui()
    except Exception:
        import traceback
        lights.fail("Wallhaven browser broke:\n\n" + traceback.format_exc())