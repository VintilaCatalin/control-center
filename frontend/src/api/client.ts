import type { SnapshotUpdate } from './types';
import { normalizeTasksData } from './taskCompatibility';

export interface SnapshotCursor {
  epoch: string;
  versions: Record<string, number>;
}

export async function fetchSnapshot(cursor?: SnapshotCursor): Promise<SnapshotUpdate> {
  const query = cursor
    ? `?epoch=${encodeURIComponent(cursor.epoch)}&v=${encodeURIComponent(Object.entries(cursor.versions).map(([key, version]) => `${key}:${version}`).join(','))}`
    : '';
  const res = await fetch(`/api/data${query}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`/api/data ${res.status}`);
  const update = await res.json() as SnapshotUpdate;
  if (update.tasks) update.tasks = normalizeTasksData(update.tasks as unknown as Record<string, unknown>);
  return update;
}

// The first generic mutating-call helper - every future action (media,
// lights, wallpaper, desktops...) wires through this instead of each
// widget hand-rolling its own fetch(). Mirrors how the old app's every
// mutating route was a POST with a JSON body (index.html's post()/send()).
export async function postAction<T = { ok: boolean }>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await res.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!res.ok) throw new Error(payload?.error || `${path} ${res.status}`);
  if (!payload) throw new Error(`${path} returned an invalid response`);
  return payload;
}

// Generic read-only GET helper, for the same reason postAction exists -
// one place that knows how to talk to the backend, not one fetch() per
// call site.
export async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}
