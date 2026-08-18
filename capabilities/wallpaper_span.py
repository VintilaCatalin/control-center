#!/usr/bin/env python
"""
spanwall.py v3 - Simplified spanned wallpaper builder.

Since all monitors now run at native 100% scaling, Windows handles the physical
mapping perfectly. This script simply grabs the total virtual desktop bounds,
center-crops the wallpaper to match that aspect ratio, resizes it to the
exact pixel dimensions, and applies it. 

It silently removes Windows 11's isolated per-desktop wallpapers from the
registry, but leaves the cache flush (explorer restart) up to the user via
the UI tools so the taskbar doesn't constantly flash while browsing.
"""

import argparse
import ctypes
import glob
import os
import random
import sys
import time
import winreg

from PIL import Image

OUT_DIR = os.path.join(os.path.expanduser("~"), "Pictures", "spanwall")
KEEP_LAST = 3
EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")

def get_virtual_bounds():
    user32 = ctypes.windll.user32
    # 76 = SM_XVIRTUALSCREEN, 77 = SM_YVIRTUALSCREEN
    # 78 = SM_CXVIRTUALSCREEN, 79 = SM_CYVIRTUALSCREEN
    x = user32.GetSystemMetrics(76)
    y = user32.GetSystemMetrics(77)
    w = user32.GetSystemMetrics(78)
    h = user32.GetSystemMetrics(79)
    return x, y, w, h

def next_out_path():
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"span_{int(time.time())}.png")

    old = sorted(glob.glob(os.path.join(OUT_DIR, "span_*.png")),
                 key=os.path.getmtime, reverse=True)
    for stale in old[KEEP_LAST:]:
        try:
            os.remove(stale)
        except OSError:
            pass
    return path

def build(src_path, out_path):
    vx, vy, vw, vh = get_virtual_bounds()
    print(f"virtual canvas: {vw}x{vh} at ({vx}, {vy})")
    
    src = Image.open(src_path).convert("RGB")
    
    # Cover-crop to exact virtual desktop aspect ratio
    target_ratio = vw / vh
    src_ratio = src.width / src.height
    
    if src_ratio > target_ratio:
        # Source is wider, crop sides
        new_w = int(src.height * target_ratio)
        left = (src.width - new_w) // 2
        src = src.crop((left, 0, left + new_w, src.height))
    elif src_ratio < target_ratio:
        # Source is taller, crop top/bottom
        new_h = int(src.width / target_ratio)
        top = (src.height - new_h) // 2
        src = src.crop((0, top, src.width, top + new_h))
        
    canvas = src.resize((vw, vh), Image.LANCZOS)
    canvas.save(out_path)
    return out_path, (vw, vh)

def apply(path):
    # 1. Nuke Windows 11 per-desktop wallpaper overrides silently
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

    # 2. Set global wallpaper style to Span
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Control Panel\Desktop",
                         0, winreg.KEY_SET_VALUE)
    winreg.SetValueEx(key, "WallpaperStyle", 0, winreg.REG_SZ, "22")
    winreg.SetValueEx(key, "TileWallpaper", 0, winreg.REG_SZ, "0")
    winreg.SetValueEx(key, "JPEGImportQuality", 0, winreg.REG_DWORD, 100)
    winreg.CloseKey(key)

    # 3. Apply the image
    ctypes.windll.user32.SystemParametersInfoW(
        20, 0, os.path.abspath(path), 3
    )

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", help="source wallpaper image")
    ap.add_argument("-r", "--random", metavar="FOLDER",
                    help="pick a random image from this folder")
    ap.add_argument("--probe", action="store_true",
                    help="print monitor layout and exit")
    ap.add_argument("--no-apply", action="store_true", help="build only")
    args = ap.parse_args()

    if args.probe:
        vx, vy, vw, vh = get_virtual_bounds()
        print(f"Virtual Canvas : {vw}x{vh} at ({vx}, {vy})")
        return

    src = args.source
    if args.random:
        pool = [os.path.join(args.random, f) for f in os.listdir(args.random)
                if f.lower().endswith(EXTS)]
        if not pool:
            sys.exit(f"No images in {args.random}")
        src = random.choice(pool)
        print(f"picked        : {os.path.basename(src)}")
    if not src:
        ap.error("need a source image, --random FOLDER, or --probe")

    out, size = build(src, next_out_path())
    print(f"built         : {size[0]}x{size[1]} -> {out}")

    if not args.no_apply:
        apply(out)
        print("applied as Span")

if __name__ == "__main__":
    main()