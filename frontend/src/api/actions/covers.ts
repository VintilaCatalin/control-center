import { fetchJSON, postAction } from '../client';
import { pickPath } from './filePicker';

export interface CoverCandidate {
  thumb: string;
  url: string;
  author?: string;
}

// server.py:2456-2462 - up to 18 SteamGridDB grid candidates. appid is
// only meaningful for Steam games.
export function fetchCovers(name: string, appid?: string) {
  const params = new URLSearchParams({ name });
  if (appid) params.set('appid', appid);
  return fetchJSON<{ covers: CoverCandidate[]; error?: string }>(`/api/covers?${params}`);
}

export function pickImage() {
  return pickPath('image');
}

// server.py:2594-2606 - a local path gets copied into COVER_DIR; a falsy
// url reverts to the automatically-resolved cover.
export function setGameArt(id: string, url: string | null) {
  return postAction<{ ok: boolean; url?: string; error?: string }>('/api/games/art', { id, url });
}
