import { launchTarget } from '../../api/actions/launch';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { Book, NoteEntry, PlexItem, ReadingItem } from '../../api/types';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import { readingThumbUrl } from '../Reading/media';
import { relativeTime } from '../Reading/time';
import styles from './ContinueGlance.module.css';

type ContinueItem = {
  id: string;
  kind: 'book' | 'plex' | 'note' | 'reading';
  eyebrow: string;
  title: string;
  detail: string;
  art?: string | null;
  progress?: number;
  activate: () => void;
};

function ContinueIcon() {
  return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 5v14l11-7z" /><path d="M4 5v14" /></svg>;
}

function bookItem(book: Book, open: () => void): ContinueItem {
  return { id: `book-${book.id}`, kind: 'book', eyebrow: 'Reading now', title: book.title, detail: `${book.author}${book.progress_pct > 0 ? ` · ${Math.round(book.progress_pct)}% complete` : ''}`, art: book.cover_url, progress: book.progress_pct, activate: open };
}

function plexItem(item: PlexItem, openPlex: () => void): ContinueItem {
  const title = item.type === 'episode' ? item.show || item.title || 'Untitled' : item.title || 'Untitled';
  const progress = item.duration && item.viewOffset ? Math.min(100, item.viewOffset / item.duration * 100) : 0;
  const episode = item.type === 'episode' && item.parentIndex != null && item.index != null ? `S${item.parentIndex} · E${item.index}` : item.year ? String(item.year) : 'Plex';
  return { id: `plex-${item.ratingKey || title}`, kind: 'plex', eyebrow: progress > 0 ? 'Continue watching' : 'From Plex', title, detail: episode, art: item.backdrop || item.art, progress, activate: () => item.launch ? void launchTarget(item.launch) : openPlex() };
}

function noteItem(note: NoteEntry, open: () => void): ContinueItem {
  return { id: `note-${note.rel}`, kind: 'note', eyebrow: 'Last note', title: note.name, detail: note.preview || `Edited ${relativeTime(note.when)}`, activate: open };
}

function readingItem(item: ReadingItem, open: () => void): ContinueItem {
  return { id: `reading-${item.id}`, kind: 'reading', eyebrow: item.saved ? 'Saved for later' : 'Keep reading', title: item.title, detail: item.source_label, art: readingThumbUrl(item.thumb), activate: open };
}

export function ContinueGlance() {
  const { snapshot } = useSnapshotData();
  const { navigateToApp } = useAppNavigation();
  const book = [...(snapshot?.reading?.books ?? [])].filter((item) => item.status === 'reading').sort((a, b) => (b.started_at ?? b.added_at) - (a.started_at ?? a.added_at))[0];
  const plex = (snapshot?.plex?.recent ?? []).find((item) => !!item.viewOffset) ?? snapshot?.plex?.recent?.[0];
  const note = [...(snapshot?.notes?.notes ?? [])].sort((a, b) => b.when - a.when)[0];
  const reading = snapshot?.reading?.bookmarks?.[0] ?? snapshot?.reading?.items?.find((item) => item.saved && !item.read);
  const items: ContinueItem[] = [];
  if (book) items.push(bookItem(book, () => navigateToApp('reading', { readingSection: 'books' })));
  if (plex) items.push(plexItem(plex, () => navigateToApp('plex')));
  if (note) items.push(noteItem(note, () => navigateToApp('notes')));
  if (reading) items.push(readingItem(reading, () => navigateToApp('reading', { readingSection: reading.topic })));
  const [featured, ...supporting] = items.slice(0, 4);

  return <div className={styles.glance}>
    <header className={styles.head}>
      <span className={styles.heading}><ContinueIcon /> Continue</span>
      <span className={styles.prompt}>Pick up where you left off</span>
    </header>
    {!featured ? <div className={styles.empty}><strong>Nothing waiting</strong><span>Start a book, note, article, or film and it will return here.</span></div> : <div className={styles.layout}>
      <button type="button" className={styles.featured} onClick={featured.activate}>
        <span className={styles.featuredArt} data-empty={!featured.art || undefined} style={featured.art ? { backgroundImage: `url("${featured.art}")` } : undefined} />
        <span className={styles.shade} />
        <span className={styles.featuredCopy}>
          <small>{featured.eyebrow}</small>
          <strong>{featured.title}</strong>
          <span>{featured.detail}</span>
        </span>
        {featured.progress != null && featured.progress > 0 && <span className={styles.progress}><i style={{ width: `${featured.progress}%` }} /></span>}
      </button>
      <div className={styles.supporting}>
        {supporting.length > 0 ? supporting.map((item) => <button type="button" key={item.id} className={styles.row} onClick={item.activate}>
          <span className={styles.rowArt} data-kind={item.kind} style={item.art ? { backgroundImage: `url("${item.art}")` } : undefined}><i /></span>
          <span className={styles.rowCopy}><small>{item.eyebrow}</small><strong>{item.title}</strong><span>{item.detail}</span></span>
          <span className={styles.arrow}>›</span>
        </button>) : <div className={styles.only}>One good thing is enough.</div>}
      </div>
    </div>}
  </div>;
}
