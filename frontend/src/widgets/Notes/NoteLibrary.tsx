import { useState } from 'react';
import type { NoteEntry } from '../../api/types';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { ClockIcon, FolderIcon, NoteIcon, PlusIcon, StarIcon } from './icons';
import type { NotesCollection } from './Sidebar';
import styles from './NoteLibrary.module.css';

interface NoteLibraryProps {
  collection: NotesCollection;
  notes: NoteEntry[];
  onSelect: (rel: string) => void;
  onNew: (folder?: string) => void;
  onTogglePin: (rel: string, pinned: boolean) => void;
  onRequestMove: (note: NoteEntry) => void;
}

export function NoteLibrary({ collection, notes, onSelect, onNew, onTogglePin, onRequestMove }: NoteLibraryProps) {
  const contextMenu = useMenu();
  const [contextNote, setContextNote] = useState<NoteEntry | null>(null);
  const folder = collection.startsWith('folder:') ? collection.slice('folder:'.length) : '';
  const shown = notes.filter((note) => {
    if (collection === 'pinned') return note.pinned;
    if (collection === 'unfiled') return !note.folder || note.folder === 'Quick Notes';
    if (collection === 'recent') return true;
    if (folder) return note.folder === folder || note.folder.startsWith(`${folder}/`);
    return true;
  }).slice(0, collection === 'recent' ? 12 : undefined);
  const title = collection === 'recent' ? 'Recent notes' : collection === 'pinned' ? 'Pinned' : collection === 'unfiled' ? 'Unfiled' : collection === 'all' ? 'All notes' : folder.split('/').at(-1) || 'Folder';
  const subtitle = collection === 'recent'
    ? 'Pick up where you left off.'
    : collection === 'pinned'
      ? 'The notes you want close at hand.'
      : collection === 'unfiled'
        ? 'Notes waiting for a folder—or perfectly fine without one.'
      : folder
        ? `${shown.length} ${shown.length === 1 ? 'note' : 'notes'} in ${folder}`
        : 'Everything in your library.';
  const contextItems: MenuItem[] = contextNote ? [
    { label: 'Open', onClick: () => onSelect(contextNote.rel) },
    { label: 'Move to folder…', onClick: () => onRequestMove(contextNote) },
    { sep: true },
    { label: contextNote.pinned ? 'Unpin' : 'Pin', onClick: () => onTogglePin(contextNote.rel, !contextNote.pinned) },
  ] : [];

  return (
    <section className={styles.library}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>{folder ? <FolderIcon /> : collection === 'pinned' ? <StarIcon filled /> : <ClockIcon />}{folder ? 'Folder' : 'Library'}</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <button type="button" className={styles.newButton} onClick={() => onNew(folder || undefined)}><PlusIcon size={16} /> New note</button>
      </header>

      {shown.length ? (
        <div className={styles.list}>
          {shown.map((note) => (
            <article
              key={note.rel}
              className={styles.note}
              onClick={() => onSelect(note.rel)}
              onContextMenu={(event) => {
                setContextNote(note);
                contextMenu.openAt(event);
              }}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-control-center-note', note.rel);
                event.dataTransfer.setData('text/plain', note.rel);
              }}
            >
              <button type="button" className={styles.open} onClick={() => onSelect(note.rel)}>
                <span className={styles.noteIcon}><NoteIcon size={17} /></span>
                <span className={styles.copy}>
                  <strong>{note.name}</strong>
                  <span>{note.preview || 'A quiet page, ready for an idea.'}</span>
                </span>
                <span className={styles.meta}>
                  {note.folder && note.folder !== 'Quick Notes' && <span className={styles.folderName}>{note.folder}</span>}
                  <time dateTime={new Date(note.when * 1000).toISOString()}>{relativeTime(note.when)}</time>
                </span>
              </button>
              <button
                type="button"
                className={`${styles.pin} ${note.pinned ? styles.pinned : ''}`}
                title={note.pinned ? 'Unpin' : 'Pin'}
                aria-label={note.pinned ? 'Unpin' : 'Pin'}
                onClick={(event) => { event.stopPropagation(); onTogglePin(note.rel, !note.pinned); }}
              >
                <StarIcon filled={note.pinned} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>{collection === 'pinned' ? <StarIcon /> : <NoteIcon size={22} />}</span>
          <strong>{collection === 'pinned' ? 'Nothing pinned yet' : 'This folder is beautifully empty'}</strong>
          <p>{collection === 'pinned' ? 'Pin a note and it will stay easy to find.' : 'Start writing—the file stays normal Markdown.'}</p>
          {collection !== 'pinned' && <button type="button" onClick={() => onNew(folder || undefined)}>Create a note</button>}
        </div>
      )}
      <Menu open={contextMenu.open} x={contextMenu.x} y={contextMenu.y} items={contextItems} onClose={contextMenu.close} />
    </section>
  );
}

function relativeTime(seconds: number): string {
  const delta = Date.now() - seconds * 1000;
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(seconds * 1000));
}
