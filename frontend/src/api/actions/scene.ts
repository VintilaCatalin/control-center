import { fetchJSON, postAction } from '../client';
import type { WallhavenResult } from '../types';

// server.py's /api/wall serves a cropped-to-fill JPEG of any wallpaper
// inside wallpaper_dir at an arbitrary size (server.py:2510-2527, sized
// per Scene's needs via ?w=&h= - the grid thumbnail size was previously
// hardcoded). Building the URL is just string formatting; there's no
// separate fetch here since an <img>/background-image does that itself.
export function wallImageUrl(path: string, w: number, h: number): string {
  return `/api/wall?path=${encodeURIComponent(path)}&w=${w}&h=${h}`;
}

// Sends one of the wallpaper's extracted palette swatches straight to the
// lights - the same /api/lights route Quick Modes (Phase D) uses, just
// with an explicit colour instead of a named mode. Mirrors the old app's
// swatch click behaviour (index.html:6018-6027) exactly.
export function setLightsColor(hex: string): Promise<{ ok: boolean }> {
  return postAction('/api/lights', { color: hex.replace('#', '') });
}

export interface WallhavenSearchParams {
  sorting?: string;
  page?: number;
  query?: string;
  range?: string;
  purity?: string;
  categories?: string;
}

// GET, not a postAction - server.py's /api/wallhaven is a pass-through
// search, no state changes (server.py:2563-2567).
export function searchWallhaven(params: WallhavenSearchParams): Promise<WallhavenResult> {
  const q = new URLSearchParams();
  if (params.sorting) q.set('sorting', params.sorting);
  if (params.page) q.set('page', String(params.page));
  if (params.query) q.set('q', params.query);
  if (params.range) q.set('range', params.range);
  if (params.purity) q.set('purity', params.purity);
  if (params.categories) q.set('categories', params.categories);
  return fetchJSON(`/api/wallhaven?${q.toString()}`);
}

// Applies a wallpaper already on disk (Yours tab). The backend refreshes
// its own `wallpapers` collector immediately on success and `accent`
// already polls on a fast 2s cycle either way (server.py:2412) - so the
// existing shared snapshot poll is what carries the change into Hero and
// Atmosphere, not anything this call does itself. That's what makes the
// apply feel like one coordinated transition instead of three separate
// updates: they're all just reacting to the same next poll tick.
export function applyLocalWallpaper(path: string): Promise<{ ok: boolean; path?: string }> {
  return postAction('/api/wallpaper', { path });
}

// Applies a Wallhaven result - the backend downloads it into
// wallpaper_dir first, then runs the exact same set_wallpaper() path as
// applyLocalWallpaper (server.py:3018-3028).
export function applyWallhavenWallpaper(url: string, id: string): Promise<{ ok: boolean; path?: string }> {
  return postAction('/api/wallpaper', { url, id });
}

// Local-only concept, distinct from Wallhaven's own site-wide favourites
// count (WallhavenItem.favourites) - pins a wallpaper already in
// wallpaper_dir into its own small panel (server.py's new
// wallpaper_favorites store key + /api/wallpaper/favorite route).
export function favoriteWallpaper(path: string, favorite: boolean): Promise<{ ok: boolean }> {
  return postAction('/api/wallpaper/favorite', { path, favorite });
}

// wallhaven.py --fix-desktops, detached (server.py:3029-3038) - manual
// recovery only, never called except from an explicit, confirmed click.
export function fixDesktopWallpapers(): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/wallpaper/fix-desktops');
}

// "Set, then match the lights" - mirrors the old app's own delay exactly
// (index.html:6074-6079): give the wallpaper apply + accent recompute
// time to actually land before asking the lights to match "the current
// wallpaper" (lights.py --colorful reads the same last_source).
export function matchLightsToWallpaper(): void {
  setTimeout(() => {
    postAction('/api/lights', { mode: 'colorful' });
  }, 2500);
}

export type LightsMode = 'colorful' | 'white' | 'bias' | 'off' | 'video' | 'game';

// The manual side of /api/lights (server.py:3029-3047) - `video`/`game`
// are the exact same two modes shortcuts.ahk's Hue Sync automation
// triggers on its own via fullscreen detection. Calling this is always a
// deliberate manual override; nothing here reads or changes AHK's own
// state, which lives entirely in its own process memory.
export function setLightsMode(mode: LightsMode): Promise<{ ok: boolean }> {
  return postAction('/api/lights', { mode });
}

// `mode` is an optional hint, not a mode change: pass the currently-active
// LightsMode (specifically 'colorful') so the backend re-runs lights.py's
// own segment-aware colorful painter instead of flattening every light to
// one flat rgb_color - see server.py's set_brightness()/_rerun_colorful().
// Omit it for the flat modes (white/bias/off/...), where a direct patch is
// correct and faster.
export function setBrightness(percent: number, mode?: LightsMode): Promise<{ ok: boolean }> {
  return postAction('/api/brightness', { percent, mode });
}

// server.py's /api/saturation (new, additive) - live-adjusts each light's
// current colour to the given saturation and persists it as the baseline
// lights.py's own main() already reads on every subsequent invocation.
export function setSaturation(percent: number, mode?: LightsMode): Promise<{ ok: boolean }> {
  return postAction('/api/saturation', { percent, mode });
}
