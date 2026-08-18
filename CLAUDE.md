

# Control Center — Permanent Project Context

## Product Design Principle — DO NOT REBUILD THE OLD APP

The old `legacy/` application is a functional reference, not a product-design specification.

A successful migration must NOT simply reproduce the old screens in React.

For every surface:

1. Study the old implementation to understand functionality, data, integrations and edge cases.
2. Preserve important existing capabilities.
3. Rethink the information architecture and user experience.
4. Redesign the visual composition.
5. Improve interaction patterns, hierarchy, typography, motion and discoverability.
6. Add genuinely useful capabilities where appropriate.

The target is NOT:
"the old Control Center, but in React."

The target IS:
"the next-generation Control Center built from the capabilities of the old one."

A screen that looks 80–90% like the old application should be treated as a migration, not a successful redesign.

Before implementing a major surface, explicitly ask:
- What should be different from the old experience?
- What can be removed?
- What can be combined?
- What new interaction makes this better?
- What should the user understand faster than before?

Do not add novelty for its own sake. Improvements must remain coherent with the product.

## Product

This is a single-user Windows Control Center.

The old `legacy/` application is the functional reference, NOT the visual target.

Core principle:

Understand → Preserve → Improve → Expand

Preserve useful functionality and proven integrations.
Improve the UI, UX, typography, motion, layout and interaction quality.
The React app should feel like the next generation of the original Control Center.

There is no user/admin/permission system.

---

## Architecture

Main frontend:

`frontend/`

Stack:

- React
- TypeScript
- Vite
- Framer Motion
- CSS Modules
- shared CSS tokens

Existing backend:

`backend/server.py`

The React frontend communicates with the existing backend through `/api/*`.

Do not create a second backend.

---

## Repository/runtime boundaries

The mental model a new developer (or the release package) should have:

**Control Center → backend + frontend + optional capability scripts.**
**Personal Windows automation lives in a separate sibling repo, never here.**

Not "panel.py / server.py / tray.py / scripts / Vite" - those are implementation
details of the things below, not the architecture itself.

- **`backend/`** - the actual Control Center Python backend: `core.py`
  (shared infra/settings schema), `collectors/` (one module per data
  domain), `routes/` (one module per API surface), `server.py` (thin entry
  point that wires the two together). This is the product's own code.
- **`frontend/`** - the React/TypeScript/Vite UI. Also the product's own
  code. `frontend/dist/` (built, not committed) is what `backend/server.py`
  serves at `/`.
- **`capabilities/`** - generic Windows helper scripts the backend calls
  into by relative path (`ha_lights.py`, `wallpaper.py`,
  `wallpaper_desktops.py`, `wallpaper_span.py`). **Not the backend** -
  these are separate processes, invoked detached/fire-and-forget from
  `backend/routes` and `backend/collectors`. Every hardcoded personal
  default (Home Assistant URL/entities, wallpaper folder) has been removed
  from these - they run fine unconfigured and read the real values from
  Control Center's own settings store. Do not fold their logic into
  `backend/`, and do not add anything here that assumes specific personal
  hardware (Razer, OpenRGB, a particular monitor layout, etc.) - that
  belongs in the separate personal-tools repo below.
- **`scripts/`** - development/build tooling only (`build_release.py`).
  Not runtime application code. An end user never needs anything in this
  folder - it's how a maintainer produces the release package, not part of
  what ships in it.
- **`control_center.py`** - the actual application entry point. Starts the
  backend, opens/focuses the UI window. This is the one thing a Windows
  Startup shortcut should point at. It starts no personal background
  services - Control Center itself has zero dependency on any personal
  tooling, ever.
- **`control_center_tray.py`** - an *optional* convenience utility, not
  the application itself and not required for Control Center to run. It's
  the only way to get Open/Stop/Restart without a terminal, plus a visible
  tray icon - but it's also not load-bearing. Keep it clearly optional:
  never make it a dependency of the core launch path, never assume it's
  running.
- **Personal Windows automation** (AHK hotkeys, a Razer Chroma keyboard
  daemon, OpenRGB painting, a personal lighting tray) lives in a separate
  sibling repo, `Vinti-PC-Tools/`, cloned next to this one - never inside
  Control Center, never required by it. That repo is allowed to call into
  this one (its `capabilities/` scripts, `control_center.py` itself); this
  repo must never call into it or assume it exists. Someone running only
  `Control Center/` on a clean machine gets a fully working app.

Release packaging (`scripts/build_release.py`) only ever bundles
`backend/`, `frontend/dist/`, `capabilities/`, `control_center.py`,
`control_center_tray.py`, `VirtualDesktopAccessor.dll`, `requirements.txt`,
and `README.md` - `scripts/`, `legacy/`, and anything from the personal
tools repo are never copied into the release folder.

---

## Existing Engines

These scripts already contain working, tested functionality. `capabilities/`
holds generic Windows integration tooling the backend subprocess-invokes by
relative path - their logic lives here, not in the backend package:

- `capabilities/ha_lights.py` - wallpaper-driven Home Assistant light sync
- `capabilities/wallpaper.py` - apply/pick a wallpaper from the configured folder
- `capabilities/wallpaper_desktops.py` - Windows per-virtual-desktop wallpaper recovery
- `capabilities/wallpaper_span.py` - build a spanned wallpaper across all monitors
- `control_center.py` — the application entry point
- `control_center_tray.py` — Control Center's own tray launcher

Do not reimplement their internal logic in React.

React should call the existing backend/actions.

Personal automation (AHK hotkeys, Razer Chroma, OpenRGB, a personal tray)
lives entirely in the separate `Vinti-PC-Tools` repo - do not recreate it
here and do not have Control Center call into it.

Especially do not recreate:
- fullscreen detection
- Hue Sync automatic Game/Video switching
- automatic lighting triggers
- wallpaper application internals

---

## Frontend Design

Visual quality is a first-class requirement.

Every new feature should consider:

- hierarchy
- spacing
- typography
- motion
- hover/focus/press states
- loading
- empty states
- errors
- accessibility
- perceived performance

Primary font:

Segoe UI Variable

Minimum readable text size:

12px

Use shared typography and motion tokens instead of arbitrary widget-specific values.

Do not blindly copy old CSS or layouts.

---

## Shared Systems

Existing important primitives/systems include:

- Card
- IconButton
- Skeleton
- Menu
- Sheet
- ArtTile
- PanelGrid
- shared drag/reorder geometry
- shared draggable interaction
- Atmosphere

Do not create duplicate versions of these without a clear reason.

PanelGrid is the shared dashboard layout system.

Games, Overview, Scene panels and future Homelab panels should use the same underlying layout model where appropriate.

---

## Scene

Scene is a flagship surface.

Its purpose is to connect:

Wallpaper
→ Palette
→ Atmosphere
→ Lighting
→ existing RGB/Chroma/Hue Sync ecosystem

The wallpaper should influence the application's visual atmosphere.

Do not treat Scene as merely a wallpaper picker.

Current Scene architecture includes:

- global Atmosphere
- Environment Hero
- Yours wallpaper panel
- Wallhaven wallpaper panel
- Favorites wallpaper panel
- lighting controls integrated into the Hero

Scene should continue to evolve visually rather than simply reproduce the old implementation.

---

## Wallpaper Recovery

`capabilities/wallpaper_desktops.py` contains the existing `fix_desktops()` recovery mechanism for Windows virtual-desktop wallpaper problems.

Reuse it.

Do not recreate its registry/Explorer logic elsewhere.

---

## PanelGrid

Panels should support:

- move
- resize
- hide/show
- persistence

Interaction should feel:

- smooth
- predictable
- non-jittery
- no accidental clicks
- no unexpected jumps

Do not introduce another dashboard layout engine.

---

## UX Rule

If old behavior is awkward, outdated, cramped or visually poor:

Preserve the functionality.
Improve the experience.

Do not preserve bad UI merely because it existed before.

---

## Testing

Testing should be proportional.

For important interactions and system-level changes, verify against the real backend.

For simple CSS/visual changes, use lightweight verification.

Do not spend large amounts of tool time building elaborate test harnesses for trivial visual fixes.

---

## Git Safety

Do not:

- reset/revert history without permission
- force-push
- delete working functionality casually
- modify unrelated systems
- rewrite existing automation without approval

Before large changes:

1. inspect existing code
2. understand the current implementation
3. make the smallest coherent change
4. typecheck/lint/build where relevant
5. verify the result