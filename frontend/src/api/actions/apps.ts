import { postAction } from '../client';

// server.py:2681-2698. `icon` accepts a local path (copied into
// COVER_DIR), a raw http(s)/​/api/ URL (used as-is), or is omitted - which
// triggers an auto-detect attempt server-side unless `clear` is set.
// Upserts by the slug of `label`, so calling this again with the same
// label updates the existing entry in place (that's how icon changes get
// applied without a dedicated "edit" route).
export function addApp(
  label: string,
  target: string,
  opts?: { icon?: string | null; clear?: boolean },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  return postAction('/api/apps/add', { label, target, icon: opts?.icon, clear: opts?.clear });
}

// server.py:2707 area - removes by id outright (apps have no "hide and
// rescan" concept the way discovered games do, they're always user-owned).
export function removeApp(id: string): Promise<{ ok: boolean }> {
  return postAction('/api/apps/remove', { id });
}

// server.py:2713-2719 - reorders store["apps"] to match this id list.
export function reorderApps(ids: string[]): Promise<{ ok: boolean }> {
  return postAction('/api/apps/order', { ids });
}

// server.py:2707-2720 - re-detects icons for every app missing one
// (or all of them, if force), in one pass.
export function detectAllAppIcons(
  force = false,
): Promise<{ ok: boolean; found: number; of: number; misses: string[] }> {
  return postAction('/api/apps/icons', { force });
}
