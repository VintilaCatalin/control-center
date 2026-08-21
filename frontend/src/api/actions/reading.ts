import { fetchJSON, postAction } from '../client';
import type { ArticleExtraction, ReadingSource } from '../types';

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

// Topic management - see backend/collectors/reading.py's
// reading_add_topic()/reading_remove_topic()/reading_set_topic_icon()/
// reading_reorder_topics(). "interesting" can't be removed (it's the
// fallback every invalid/removed topic reassigns to).
export function addTopic(label: string, icon?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  return postAction('/api/reading/topics/add', { label, icon });
}

export function setTopicIcon(id: string, icon: string): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/reading/topics/icon', { id, icon });
}

export function renameTopic(id: string, label: string): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/reading/topics/rename', { id, label });
}

export function reorderTopics(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/reading/topics/reorder', { ids });
}

export function removeTopic(id: string): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/reading/topics/remove', { id });
}
