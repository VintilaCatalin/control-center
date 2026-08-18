import { fetchJSON, postAction } from '../client';

export interface SteamNewsItem {
  title: string;
  url: string;
  date: number | null;
  summary: string;
  author: string;
}

// server.py's fetch_steam_news() - Steam's own public ISteamNews API, only
// ever called with a Steam appid (GameData.id for source === 'steam').
export function fetchSteamNews(appid: string): Promise<{ ok: boolean; items: SteamNewsItem[]; error?: string }> {
  return fetchJSON(`/api/games/news?appid=${encodeURIComponent(appid)}`);
}

// Named wrappers over the games routes (server.py:2575-2664) - the
// frontend half of turning route handlers into reusable actions. Every
// call site (tile click, drag reorder, a future Command Palette) goes
// through these instead of hand-building request bodies inline.

// server.py:2578-2592 - creates a manual game entry (id derived from
// name), optionally placed directly onto a shelf. `art` accepts a local
// path (copied server-side) or a URL; leave it empty and the shelf's
// automatic SteamGridDB lookup takes over on the next refresh.
export function addGame(
  name: string,
  launch: string,
  art?: string,
  shelf?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  return postAction('/api/games/add', { name, launch, art: art || undefined, shelf });
}

export function toggleFavorite(id: string, favorite: boolean): Promise<{ ok: boolean }> {
  return postAction('/api/games/favorite', { id, favorite });
}

export function hideGame(id: string, hidden: boolean): Promise<{ ok: boolean }> {
  return postAction('/api/games/hide', { id, hidden });
}

export function moveGame(id: string, shelf: string, index?: number): Promise<{ ok: boolean }> {
  return postAction('/api/games/move', { id, shelf, index });
}

export function reorderShelf(shelf: string, ids: string[]): Promise<{ ok: boolean }> {
  return postAction('/api/games/order', { shelf, ids });
}

// server.py:2651-2664 - deletes a manual entry outright, or hides a
// discovered one (it would just reappear on the next scan otherwise).
// Returns which one happened so the caller can toast accordingly.
export function removeGame(id: string): Promise<{ ok: boolean; deleted: boolean }> {
  return postAction('/api/games/remove', { id });
}
