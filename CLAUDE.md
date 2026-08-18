

# Control Center — Permanent Project Context

## Product Design Principle — DO NOT REBUILD THE OLD APP

The old `panel/` application is a functional reference, not a product-design specification.

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

The old `panel/` application is the functional reference, NOT the visual target.

Core principle:

Understand → Preserve → Improve → Expand

Preserve useful functionality and proven integrations.
Improve the UI, UX, typography, motion, layout and interaction quality.
The React app should feel like the next generation of the original Control Center.

There is no user/admin/permission system.

---

## Architecture

Main frontend:

`control-center/`

Stack:

- React
- TypeScript
- Vite
- Framer Motion
- CSS Modules
- shared CSS tokens

Existing backend:

`panel/server.py`

The React frontend communicates with the existing backend through `/api/*`.

Do not create a second backend.

---

## Existing Engines

These scripts already contain working, tested functionality:

- `lights.py`
- `rgb_paint_win.py`
- `chroma_paint.py`
- `wallpicker.py`
- `wallhaven.py`
- `spanwall.py`
- `shortcuts.ahk`
- `tray.py`
- `panel.py`

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

`wallhaven.py` contains the existing `fix_desktops()` recovery mechanism for Windows virtual-desktop wallpaper problems.

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