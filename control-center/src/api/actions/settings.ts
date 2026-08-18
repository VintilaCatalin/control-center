import { fetchJSON, postAction } from '../client';
import type { SettingsResponse } from '../types';

// GET /api/settings - server.py's schema-driven settings surface, the
// same one the old app's own settings screen read. One fetch gets the
// full schema (labels/types/hints), every field's current effective
// value, and which of DEFAULTS/config.ini/the panel's own settings each
// one actually came from.
export function fetchSettings(): Promise<SettingsResponse> {
  return fetchJSON('/api/settings');
}

// POST /api/settings/save - partial by design: only send the keys that
// actually changed. An empty string clears a panel-set override back to
// config.ini/default rather than writing a literal blank (see
// server.py's own comment on this in the save route).
export function saveSettings(values: Record<string, string>): Promise<{ ok: boolean }> {
  return postAction('/api/settings/save', { values });
}

// POST /api/settings/profile-photo - the upload counterpart to the plain
// text `_profile_photo` field: a browser file picker can only ever hand
// this app a data: URL (there's no local filesystem access from here),
// so the backend decodes and writes it as the cover itself instead of
// treating the value as an already-on-disk path.
export function uploadProfilePhoto(dataUrl: string): Promise<{ ok: boolean; url?: string | null; error?: string }> {
  return postAction('/api/settings/profile-photo', { data: dataUrl });
}

export function removeProfilePhoto(): Promise<{ ok: boolean; url?: null }> {
  return postAction('/api/settings/profile-photo', { remove: true });
}

// POST /api/settings/background-image - same upload shape as the profile
// photo, just writing into the plain `background_image` settings key
// instead of the profile's own photo field.
export function uploadBackgroundImage(dataUrl: string): Promise<{ ok: boolean; url?: string | null; error?: string }> {
  return postAction('/api/settings/background-image', { data: dataUrl });
}

export function removeBackgroundImage(): Promise<{ ok: boolean; url?: null }> {
  return postAction('/api/settings/background-image', { remove: true });
}

// POST /api/settings/test-connection - one generic reachability check
// every Integrations card uses instead of a bespoke tester per service.
export function testConnection(url: string): Promise<{ ok: boolean; status?: number; ms?: number; error?: string }> {
  return postAction('/api/settings/test-connection', { url });
}
