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
