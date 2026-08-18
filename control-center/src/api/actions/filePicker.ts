import { fetchJSON } from '../client';

// server.py:2467-2469 (/api/pick) - opens a native Tk file/folder dialog
// server-side and returns the chosen path. `kind` selects the dialog's
// filter/mode; "exe" and "image" are what the app/game add flows use.
export function pickPath(kind: 'exe' | 'image'): Promise<{ path: string | null }> {
  return fetchJSON(`/api/pick?kind=${kind}`);
}
