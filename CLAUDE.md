

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

**Control Center → backend + frontend + optional system helpers/integrations.**

Not "panel.py / server.py / tray.py / scripts / Vite" - those are implementation
details of the four things above, not the architecture itself.

- **`backend/`** - the actual Control Center Python backend: `core.py`
  (shared infra/settings schema), `collectors/` (one module per data
  domain), `routes/` (one module per API surface), `server.py` (thin entry
  point that wires the two together). This is the product's own code.
- **`frontend/`** - the React/TypeScript/Vite UI. Also the product's own
  code. `frontend/dist/` (built, not committed) is what `backend/server.py`
  serves at `/`.
- **`system/`** - Windows/system helper tooling Control Center calls into
  (`lights.py`, `wallpicker.py`, `wallhaven.py`, `chroma_paint.py`,
  `rgb_paint_win.py`, `spanwall.py`) or that's retained personal automation
  living alongside it (`shortcuts.ahk`, `tray.py`). **Not the backend** -
  these are separate processes the backend subprocess-invokes by relative
  path, several of which also work standalone via hotkeys, independent of
  whether Control Center is even running. Do not fold their logic into
  `backend/`.
- **`scripts/`** - development/build tooling only (`build_release.py`).
  Not runtime application code. An end user never needs anything in this
  folder - it's how a maintainer produces the release package, not part of
  what ships in it.
- **`control_center.py`** - the actual application entry point. Starts the
  backend, ensures required background helpers are running (currently:
  the Chroma keyboard daemon - see its own "Background helpers" section),
  opens/focuses the UI window. This is the one thing a Windows Startup
  shortcut should point at.
- **`control_center_tray.py`** - an *optional* convenience utility, not
  the application itself and not required for Control Center to run.
  Audited against "is this still necessary now that control_center.py
  manages its own startup/runtime": it isn't redundant - it's the only way
  to get Open/Stop/Restart without a terminal, plus a visible tray icon -
  but it's also not load-bearing. Keep it clearly optional: never make it
  a dependency of the core launch path, never assume it's running.
  `system/tray.py` is a *different*, separate, personal-only tray
  (lighting controls) - the two must never be merged back together.

Release packaging (`scripts/build_release.py`) only ever bundles
`backend/`, `frontend/dist/`, `legacy/`, `system/`, `control_center.py`,
`control_center_tray.py`, `requirements.txt`, and `README.md` - `scripts/`
itself is never copied into the release folder.

---

## Existing Engines

These scripts already contain working, tested functionality. `system/` holds
Windows integration tooling that predates Control Center and isn't owned by
it - the backend subprocess-invokes some of these, but their logic lives
here, not in the backend package:

- `system/lights.py`
- `system/rgb_paint_win.py`
- `system/chroma_paint.py`
- `system/wallpicker.py`
- `system/wallhaven.py`
- `system/spanwall.py`
- `system/shortcuts.ahk`
- `system/tray.py` — personal lighting tray only, not part of the product (see `control_center_tray.py`)
- `control_center.py` — the application entry point
- `control_center_tray.py` — Control Center's own tray launcher, deliberately separate from `system/tray.py`

Do not reimplement their internal logic in React.

React should call the existing backend/actions.

Do not duplicate automation already handled by AHK/scripts.

Especially do not recreate:
- fullscreen detection
- Hue Sync automatic Game/Video switching
- automatic lighting triggers
- wallpaper application internals
- OpenRGB logic
- Chroma logic

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

`system/wallhaven.py` contains the existing `fix_desktops()` recovery mechanism for Windows virtual-desktop wallpaper problems.

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