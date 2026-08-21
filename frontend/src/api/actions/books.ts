import { fetchJSON, postAction } from '../client';
import type { Book, BookCopyResult, BookSearchResult } from '../types';

// GET - a read-only proxy to Open Library, no state change. See
// server.py's search_open_library(). `ok: false` means the request itself
// failed (timeout, network, bad response) - distinct from `ok: true` with
// an empty `results` (a genuine "no matches").
export function searchBooks(query: string): Promise<{ ok: boolean; results: BookSearchResult[]; error?: string }> {
  return fetchJSON(`/api/books/search?q=${encodeURIComponent(query)}`);
}

// Legitimate free/public copies only (Gutenberg + Internet Archive / OL).
export function findBookCopies(opts: {
  title: string;
  author?: string;
  openlibrary_key?: string | null;
}): Promise<{ ok: boolean; results: BookCopyResult[]; error?: string; warning?: string }> {
  const params = new URLSearchParams();
  if (opts.title) params.set('title', opts.title);
  if (opts.author) params.set('author', opts.author);
  if (opts.openlibrary_key) params.set('key', opts.openlibrary_key);
  return fetchJSON(`/api/books/copies?${params.toString()}`);
}

// Walk the configured NAS/local books folder for matching EPUB/PDF files.
export function searchLocalBooks(opts: {
  title: string;
  author?: string;
}): Promise<{ ok: boolean; results: BookCopyResult[]; error?: string; root?: string }> {
  const params = new URLSearchParams();
  if (opts.title) params.set('title', opts.title);
  if (opts.author) params.set('author', opts.author);
  return fetchJSON(`/api/books/local-search?${params.toString()}`);
}

export function openLocalBook(opts: { rel?: string; url?: string }): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/books/local/open', opts);
}

/** Scan the configured books folder and add / link files missing from the shelf. */
export function syncLocalBooks(): Promise<{
  ok: boolean;
  added?: number;
  linked?: number;
  skipped?: number;
  scanned?: number;
  root?: string;
  error?: string;
}> {
  return postAction('/api/books/sync-local', {});
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
  patch: Partial<Pick<Book, 'status' | 'progress_pct' | 'notes' | 'file_url' | 'reading_cfi'>>,
): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/books/edit', { id, ...patch });
}

export function deleteBook(id: string): Promise<{ ok: boolean }> {
  return postAction('/api/books/delete', { id });
}
