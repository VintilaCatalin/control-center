import { fetchJSON, postAction } from '../client';
import type { ArticleExtraction, ReadingSource } from '../types';

// See server.py's _reading_set_membership()/reading_set_saved() - toggles
// membership in the store-side reading_saved list, keyed by the item's
// stable id (not a field on the ephemeral feed item itself).
export function saveItem(id: string, saved: boolean): Promise<{ ok: boolean }> {
  return postAction('/api/reading/save', { id, saved });
}

export function markRead(id: string, read: boolean): Promise<{ ok: boolean }> {
  return postAction('/api/reading/read', { id, read });
}

// "Not interested" - permanent dismiss, see reading_hide_item().
export function hideItem(id: string): Promise<{ ok: boolean }> {
  return postAction('/api/reading/hide', { id });
}

// On-demand full-text extraction for the article reader - see server.py's
// _extract_article(). GET, not postAction: no state changes, and the
// server disk-caches the result by id so repeat opens are instant.
export function fetchArticleText(id: string, url: string): Promise<ArticleExtraction> {
  return fetchJSON(`/api/reading/article?id=${encodeURIComponent(id)}&url=${encodeURIComponent(url)}`);
}

// Source management - see server.py's reading_add_source()/
// reading_edit_source()/reading_delete_source()/reading_import_subscriptions().
export function addSource(
  label: string,
  url: string,
  type: ReadingSource['type'],
  topic: ReadingSource['topic'],
): Promise<{ ok: boolean; id?: string; error?: string }> {
  return postAction('/api/reading/source/add', { label, url, type, topic });
}

export function editSource(
  id: string,
  patch: Partial<Pick<ReadingSource, 'label' | 'type' | 'topic' | 'enabled'>>,
): Promise<{ ok: boolean }> {
  return postAction('/api/reading/source/edit', { id, ...patch });
}

export function deleteSource(id: string): Promise<{ ok: boolean }> {
  return postAction('/api/reading/source/delete', { id });
}

export function importSubscriptions(text: string): Promise<{ ok: true; found: number; added: number } | { ok: false; error: string }> {
  return postAction('/api/reading/import-subscriptions', { text });
}

export function fetchFeedPresets(): Promise<{ presets: { group: string; feeds: { label: string; url: string }[] }[] }> {
  return fetchJSON('/api/feed-presets');
}

// Raindrop-style bookmarks - see server.py's add_bookmark()/delete_bookmark().
export function addBookmark(url: string, topic?: ReadingSource['topic']): Promise<{ ok: boolean; id?: string; error?: string }> {
  return postAction('/api/reading/bookmark/add', { url, topic });
}

export function deleteBookmark(id: string): Promise<{ ok: boolean }> {
  return postAction('/api/reading/bookmark/delete', { id });
}
