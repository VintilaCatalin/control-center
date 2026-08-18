import { fetchJSON } from '../client';
import type { PlexItemDetail } from '../types';

// server.py's plex_item_detail() (server.py's /api/plex/item route) -
// the only Plex-specific action this app needs beyond the shared
// launchTarget() from actions/launch.ts, which every item's `launch`
// string already goes through unchanged.
export function fetchPlexItem(ratingKey: string): Promise<PlexItemDetail> {
  return fetchJSON(`/api/plex/item?ratingKey=${encodeURIComponent(ratingKey)}`);
}
