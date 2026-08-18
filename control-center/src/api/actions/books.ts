import { fetchJSON, postAction } from '../client';
import type { Book, BookSearchResult } from '../types';

// GET - a read-only proxy to Open Library, no state change. See
// server.py's search_open_library(). `ok: false` means the request itself
// failed (timeout, network, bad response) - distinct from `ok: true` with
// an empty `results` (a genuine "no matches").
export function searchBooks(query: string): Promise<{ ok: boolean; results: BookSearchResult[]; error?: string }> {
  return fetchJSON(`/api/books/search?q=${encodeURIComponent(query)}`);
}

export function addBook(payload: {
  title: string;
  author: string;
  cover_url?: string | null;
  status: Book['status'];
  openlibrary_key?: string | null;
  pages?: number | null;
  file_url?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  return postAction('/api/books/add', payload);
}

export function editBook(
  id: string,
  patch: Partial<Pick<Book, 'status' | 'progress_pct' | 'notes' | 'file_url'>>,
): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/books/edit', { id, ...patch });
}

export function deleteBook(id: string): Promise<{ ok: boolean }> {
  return postAction('/api/books/delete', { id });
}
