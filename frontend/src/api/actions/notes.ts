import { fetchJSON, postAction } from '../client';
import type { NoteContent } from '../types';

// GET, not postAction - server.py's /api/note?rel= is a pass-through
// read, no state change (server.py's read_note()). The snapshot's own
// `notes` collector only ever carries previews; this is how the reader/
// editor gets a note's actual body, fetched on demand.
export function fetchNote(rel: string): Promise<NoteContent> {
  return fetchJSON(`/api/note?rel=${encodeURIComponent(rel)}`);
}

export function saveNote(rel: string, text: string): Promise<{ ok: boolean; rel?: string; when?: number }> {
  return postAction('/api/note/save', { rel, text });
}

export function newNote(name: string, folder = ''): Promise<{ ok: boolean; rel?: string; error?: string }> {
  return postAction('/api/note/new', { name, folder });
}

export function deleteNote(rel: string): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/note/delete', { rel });
}

export function renameNote(rel: string, name: string): Promise<{ ok: boolean; rel?: string; error?: string }> {
  return postAction('/api/note/rename', { rel, name });
}

export function moveNote(rel: string, folder = ''): Promise<{ ok: boolean; rel?: string; error?: string }> {
  return postAction('/api/note/move', { rel, folder });
}

export function removeNoteFolder(folder: string, destination = ''): Promise<{ ok: boolean; moved?: { from: string; to: string }[]; error?: string }> {
  return postAction('/api/note/folder/remove', { folder, destination });
}

export function renameNoteFolder(folder: string, name: string): Promise<{ ok: boolean; folder?: string; error?: string }> {
  return postAction('/api/note/folder/rename', { folder, name });
}

// store.json annotation, not vault content - see server.py's pin_note().
export function pinNote(rel: string, pinned: boolean): Promise<{ ok: boolean }> {
  return postAction('/api/note/pin', { rel, pinned });
}
