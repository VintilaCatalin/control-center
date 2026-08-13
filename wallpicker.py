#!/usr/bin/env python
"""
wallpicker.py - see the wallpapers before you pick one.

Replaces the random pick behind Ctrl+Shift+W. Shows the Spans folder as a
thumbnail grid, builds the chosen one through spanwall (so it stays
DPI-correct across the mismatched monitors), applies it, then opens the
light picker so the room follows.

Usage:
    wallpicker.py              # the grid
    wallpicker.py --random     # old behaviour, no window
"""

import argparse
import os
import subprocess
import sys
import random
import hashlib
from pathlib import Path

# pythonw has no stdout, and spanwall prints - that would kill the whole app.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

sys.path.insert(0, str(Path(__file__).resolve().parent))

import spanwall
import lights
from PIL import Image, ImageTk

WALL_FOLDER = Path(r"C:\Users\catal\Pictures\Wallpapers\Spans")
THUMB_CACHE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "spanwall" / "thumbs"
EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

COLS = 4
THUMB_W, THUMB_H = 260, 218   # roughly the 3440x2880 canvas ratio

BG = lights.BG
FG = lights.FG
MUTED = lights.MUTED
CARD = "#1c1f27"


def wallpapers():
    if not WALL_FOLDER.is_dir():
        return []
    return sorted((p for p in WALL_FOLDER.iterdir() if p.suffix.lower() in EXTS),
                  key=lambda p: p.stat().st_mtime, reverse=True)


def thumbnail(path):
    """Cached by path + mtime, so reopening the grid is instant."""
    THUMB_CACHE.mkdir(parents=True, exist_ok=True)
    stamp = f"{path}|{path.stat().st_mtime_ns}".encode()
    cached = THUMB_CACHE / (hashlib.sha1(stamp).hexdigest() + ".png")
    if not cached.exists():
        img = Image.open(path).convert("RGB")
        # Cover-crop to the tile ratio rather than letterboxing - a grid of
        # different aspect ratios reads as broken.
        scale = max(THUMB_W / img.width, THUMB_H / img.height)
        img = img.resize((max(1, int(img.width * scale)),
                          max(1, int(img.height * scale))), Image.LANCZOS)
        left = (img.width - THUMB_W) // 2
        top = (img.height - THUMB_H) // 2
        img.crop((left, top, left + THUMB_W, top + THUMB_H)).save(cached)
    return cached


def set_wallpaper(path, then_lights=True):
    out, _size = spanwall.build(str(path), spanwall.next_out_path())
    spanwall.apply(out)
    lights.save_state(last_source=str(path))

    if then_lights:
        # Detached, so this process can exit and the picker survives it.
        pyw = Path(sys.executable).with_name("pythonw.exe")
        exe = str(pyw) if pyw.exists() else sys.executable
        subprocess.Popen([exe, str(Path(__file__).resolve().parent / "lights.py"),
                          "--image", str(path)],
                         creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))


def open_wallhaven():
    """Hand off to the Wallhaven browser. Detached so this process can exit
    and take its window with it."""
    script = Path(__file__).resolve().parent / "wallhaven.py"
    if not script.is_file():
        return
    pyw = Path(sys.executable).with_name("pythonw.exe")
    exe = str(pyw) if pyw.exists() else sys.executable
    subprocess.Popen([exe, str(script)],
                     creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))


def run_gui():
    import tkinter as tk

    files = wallpapers()
    if not files:
        sys.exit(f"No images in {WALL_FOLDER}")

    root = tk.Tk()
    root.title("Wallpaper")
    root.configure(bg=BG)
    root.attributes("-topmost", True)

    head = tk.Frame(root, bg=BG, padx=22, pady=18)
    head.pack(fill="x")
    tk.Label(head, text="Wallpaper", bg=BG, fg=FG,
             font=("Segoe UI Semibold", 14), anchor="w").pack(side="left")

    follow = tk.BooleanVar(value=True)
    tk.Checkbutton(head, text="then pick lights", variable=follow,
                   bg=BG, fg=MUTED, selectcolor=CARD, activebackground=BG,
                   activeforeground=FG, bd=0, highlightthickness=0,
                   font=("Segoe UI", 9)).pack(side="right")

    # ── scrollable grid ──
    shell = tk.Frame(root, bg=BG)
    shell.pack(fill="both", expand=True)
    canvas = tk.Canvas(shell, bg=BG, highlightthickness=0, bd=0)
    scroll = tk.Scrollbar(shell, orient="vertical", command=canvas.yview)
    grid = tk.Frame(canvas, bg=BG, padx=22, pady=4)

    grid.bind("<Configure>",
              lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.create_window((0, 0), window=grid, anchor="nw")
    canvas.configure(yscrollcommand=scroll.set)
    canvas.pack(side="left", fill="both", expand=True)
    scroll.pack(side="right", fill="y")
    canvas.bind_all("<MouseWheel>",
                    lambda e: canvas.yview_scroll(int(-e.delta / 120), "units"))

    keep = []          # Tk drops images that nothing holds a reference to
    picked = {"path": None}

    def choose(path):
        picked["path"] = path
        root.destroy()

    for i, path in enumerate(files):
        photo = ImageTk.PhotoImage(file=str(thumbnail(path)))
        keep.append(photo)

        card = tk.Frame(grid, bg=CARD, bd=0, highlightthickness=1,
                        highlightbackground=CARD)
        card.grid(row=i // COLS, column=i % COLS, padx=6, pady=6)

        btn = tk.Button(card, image=photo, bd=0, relief="flat", bg=CARD,
                        activebackground=CARD, highlightthickness=0,
                        cursor="hand2", command=lambda p=path: choose(p))
        btn.pack()
        tk.Label(card, text=path.stem, bg=CARD, fg=MUTED,
                 font=("Segoe UI", 8), pady=5).pack()

        # Highlight on hover so it reads as clickable.
        for widget in (card, btn):
            widget.bind("<Enter>",
                        lambda _e, c=card: c.configure(highlightbackground="#3d4658"))
            widget.bind("<Leave>",
                        lambda _e, c=card: c.configure(highlightbackground=CARD))

    foot = tk.Frame(root, bg=BG, padx=22, pady=14)
    foot.pack(fill="x")
    tk.Button(foot, text="Surprise me", bg="#1f232c", fg=FG, bd=0,
              relief="flat", cursor="hand2", activebackground="#1f232c",
              activeforeground=FG, highlightthickness=0,
              font=("Segoe UI", 9), padx=16, pady=6,
              command=lambda: choose(random.choice(files))).pack(side="left")
    flat_foot = tk.Button(foot, text="Browse Wallhaven", bg="#242a36", fg=FG,
                          bd=0, relief="flat", cursor="hand2",
                          activebackground="#242a36", activeforeground=FG,
                          highlightthickness=0, font=("Segoe UI", 9),
                          padx=16, pady=6,
                          command=lambda: (root.destroy(), open_wallhaven()))
    flat_foot.pack(side="left", padx=(8, 0))
    tk.Label(foot, text=f"{len(files)} in {WALL_FOLDER.name}", bg=BG, fg=MUTED,
             font=("Segoe UI", 8)).pack(side="right")

    rows = (len(files) + COLS - 1) // COLS
    height = min(root.winfo_screenheight() - 300, 140 + rows * (THUMB_H + 40))
    width = 22 * 2 + COLS * (THUMB_W + 12) + 20
    root.geometry(f"{width}x{int(height)}")
    root.update_idletasks()
    x = (root.winfo_screenwidth() - width) // 2
    y = max(0, (root.winfo_screenheight() - int(height)) // 2)
    root.geometry(f"+{x}+{y}")

    root.bind("<Escape>", lambda _e: root.destroy())
    root.focus_force()
    root.mainloop()

    if picked["path"]:
        set_wallpaper(picked["path"], then_lights=follow.get())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--random", action="store_true",
                    help="no window - pick one at random")
    ap.add_argument("--set", metavar="PATH",
                    help="no window - apply this image (used by the panel)")
    args = ap.parse_args()

    if args.set:
        path = Path(args.set)
        if path.is_file():
            set_wallpaper(path, then_lights=False)
        return

    if args.random:
        files = wallpapers()
        if files:
            set_wallpaper(random.choice(files), then_lights=False)
        return
    run_gui()


if __name__ == "__main__":
    main()
