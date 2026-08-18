"""Virtual desktop switcher (VirtualDesktopAccessor.dll).

Extracted verbatim from the pre-modularization panel/server.py.
"""

import ctypes



# ──────────────────────────────────────────────
#  VIRTUAL DESKTOPS - the same DLL shortcuts.ahk already drives
# ──────────────────────────────────────────────

_vda = {"dll": None, "path": None}

def _vda_dll(cfg):
    """Talks to VirtualDesktopAccessor.dll directly via ctypes rather than
    going through the running AHK script - it's a plain DLL with no IPC of
    its own, and shortcuts.ahk never added one, so this loads a second,
    independent handle to the same DLL rather than trying to bolt an IPC
    channel onto a script that's already doing its job."""
    path = str(cfg["vda_dll"]).strip()
    if not path: return None
    if _vda["dll"] is not None and _vda["path"] == path:
        return _vda["dll"]
    try:
        dll = ctypes.WinDLL(path)
        dll.GetDesktopCount()  # prove the export table is what we expect before trusting it
    except Exception:
        return None
    _vda.update(dll=dll, path=path)
    return dll

def collect_desktops(cfg, _shared):
    dll = _vda_dll(cfg)
    if not dll: return {"configured": False}
    try:
        return {"configured": True, "count": int(dll.GetDesktopCount()),
                "current": int(dll.GetCurrentDesktopNumber()) + 1}   # 1-indexed for display
    except Exception as e:
        return {"configured": True, "error": str(e)[:140]}

class _RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                ("right", ctypes.c_long), ("bottom", ctypes.c_long)]

class _MONITORINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("rcMonitor", _RECT),
                ("rcWork", _RECT), ("dwFlags", ctypes.c_ulong)]

_MONITOR_DEFAULTTONEAREST = 2
_MONITORINFOF_PRIMARY = 1
_EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

def _pin_non_primary_windows(dll):
    """Windows virtual desktops are one global concept, not per-monitor -
    switching desktops hides every window that isn't on the new one, on
    every monitor at once, unless a window is pinned (visible on all
    desktops). shortcuts.ahk already solves exactly this for its own
    top-monitor workaround by pinning whatever sits on the secondary
    monitor before every switch (see UpdateTopMonitorWindows in that
    script) - this does the same thing, generalized to "not the primary
    monitor" instead of a hardcoded screen position, so a switch triggered
    from the panel (which itself lives on the secondary monitor) doesn't
    drag that monitor's windows along with it."""
    try:
        user32 = ctypes.windll.user32
        pin = dll.PinWindow
        pin.argtypes = [ctypes.c_void_p]

        def callback(hwnd, _lparam):
            if not user32.IsWindowVisible(hwnd): return True
            rect = _RECT()
            if not user32.GetWindowRect(hwnd, ctypes.byref(rect)): return True
            if rect.right <= rect.left or rect.bottom <= rect.top: return True
            mon = user32.MonitorFromWindow(hwnd, _MONITOR_DEFAULTTONEAREST)
            info = _MONITORINFO()
            info.cbSize = ctypes.sizeof(_MONITORINFO)
            if not user32.GetMonitorInfoW(mon, ctypes.byref(info)): return True
            if not (info.dwFlags & _MONITORINFOF_PRIMARY):
                try: pin(hwnd)
                except Exception: pass
            return True

        user32.EnumWindows(_EnumWindowsProc(callback), 0)
    except Exception:
        pass

def go_to_desktop(cfg, n):
    dll = _vda_dll(cfg)
    if not dll: return False
    try:
        _pin_non_primary_windows(dll)
        dll.GoToDesktopNumber(max(0, int(n) - 1))
        return True
    except Exception:
        return False
