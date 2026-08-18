import { postAction } from '../client';
import type { ShelfData } from '../types';

// server.py:2814-2829 (/api/shelves) - replaces the whole shelf list in
// one call. Passing a shelf's existing `id` renames it in place (claims
// carry over); omitting an id (a brand new shelf) gets one slugified from
// the label. This is the one place in the games/apps data model that
// genuinely supports a clean rename, because the route was built to take
// an explicit id.
export function saveShelves(
  shelves: { id?: string; label: string; claims?: string[] }[],
): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/shelves', { shelves });
}

export function shelfPayload(shelf: ShelfData): { id: string; label: string; claims?: string[] } {
  return { id: shelf.id, label: shelf.label, claims: shelf.claims };
}
