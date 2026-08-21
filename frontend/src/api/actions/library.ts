import { postAction } from '../client';
import type { LibraryItem } from '../types';

interface RaindropsResponse {
  ok: boolean;
  items?: LibraryItem[];
  count?: number;
  error?: string;
}

export function fetchLibraryItems(
  collectionId: string,
  opts?: { page?: number; search?: string; perpage?: number },
): Promise<RaindropsResponse> {
  const params = new URLSearchParams({
    collection: collectionId,
    page: String(opts?.page ?? 0),
    perpage: String(opts?.perpage ?? 50),
  });
  if (opts?.search?.trim()) params.set('search', opts.search.trim());
  return fetch(`/api/library/raindrops?${params}`).then((r) => r.json());
}

export function saveToRaindrop(payload: {
  url: string;
  title?: string;
  excerpt?: string;
  cover?: string | null;
  tags?: string[];
  source?: string;
}): Promise<{ ok: boolean; created?: boolean; error?: string; item?: LibraryItem }> {
  return postAction('/api/library/save', payload);
}

export function unsaveFromRaindrop(url: string): Promise<{ ok: boolean; removed?: boolean; error?: string }> {
  return postAction('/api/library/unsave', { url });
}

export function setRaindropFavorite(
  id: string,
  important: boolean,
): Promise<{ ok: boolean; error?: string; item?: LibraryItem }> {
  return postAction('/api/library/favorite', { id, important });
}

export function removeRaindrop(
  id: string,
  url?: string,
): Promise<{ ok: boolean; removed?: boolean; error?: string }> {
  return postAction('/api/library/remove', { id, url });
}

export function renameCollection(
  id: string,
  title: string,
): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/library/collection/rename', { id, title });
}

export function setCollectionIcon(
  id: string,
  icon: string,
): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/library/collection/icon', { id, icon });
}

export function reorderCollections(
  ids: string[],
): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/library/collection/reorder', { ids });
}

/** Feed / book Save toggle — Raindrop is the only store. */
export function toggleRaindropSave(
  item: { url: string; title?: string; excerpt?: string; cover?: string | null },
  saved: boolean,
  source = 'feed',
): Promise<{ ok: boolean; error?: string }> {
  if (!item.url) return Promise.resolve({ ok: false, error: 'no url' });
  if (saved) {
    return saveToRaindrop({
      url: item.url,
      title: item.title,
      excerpt: item.excerpt,
      cover: item.cover,
      source,
    });
  }
  return unsaveFromRaindrop(item.url);
}
