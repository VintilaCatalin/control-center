import type { Snapshot } from './types';

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch('/api/data', { cache: 'no-store' });
  if (!res.ok) throw new Error(`/api/data ${res.status}`);
  return res.json() as Promise<Snapshot>;
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
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

// Generic read-only GET helper, for the same reason postAction exists -
// one place that knows how to talk to the backend, not one fetch() per
// call site.
export async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}
