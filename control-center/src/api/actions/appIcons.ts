import { fetchJSON, postAction } from '../client';
import type { CoverCandidate } from './covers';

// server.py:2707-2712 area (/api/app-icons) - up to 18 SteamGridDB icon
// candidates (square, not 2:3 like covers).
export function fetchAppIcons(name: string) {
  const params = new URLSearchParams({ name });
  return fetchJSON<{ icons: CoverCandidate[]; error?: string }>(`/api/app-icons?${params}`);
}

// server.py:2700-2705 (/api/apps/icon-detect) - read-only detection, does
// not persist anything; the caller still has to POST /api/apps/add with
// the result to save it.
export function detectAppIcon(target: string, id: string) {
  return postAction<{ ok: boolean; icon?: string; error?: string }>('/api/apps/icon-detect', { target, id });
}
