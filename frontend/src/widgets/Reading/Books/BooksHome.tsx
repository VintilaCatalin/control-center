import { useEffect, useRef, useState } from 'react';
import { syncLocalBooks } from '../../../api/actions/books';
import type { Book } from '../../../api/types';
import { useToast } from '../../../primitives/Toast/ToastProvider';
import { FolderScanIcon, PlusIcon } from '../icons';
import { BookCard } from './BookCard';
import styles from './BooksHome.module.css';

interface BooksHomeProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onAddBook: () => void;
}

const SHELVES: { key: Book['status']; label: string }[] = [
  { key: 'reading', label: 'Reading Now' },
  { key: 'want', label: 'Want to Read' },
  { key: 'finished', label: 'Finished' },
];

function syncToastMessage(added: number, linked: number): string | null {
  if (added > 0 && linked > 0) {
    return `Added ${added} book${added === 1 ? '' : 's'}, linked ${linked}`;
  }
  if (added > 0) return `Added ${added} book${added === 1 ? '' : 's'} from your folder`;
  if (linked > 0) return `Linked ${linked} book${linked === 1 ? '' : 's'} to local files`;
  return null;
}

// Its own visual system, not the news feed's - a plain multi-shelf poster
// grid (fixed uniform tile size), no masonry, no scrim-title overlays.
// Book covers are already designed objects; they don't need editorial
// treatment the way a photo thumbnail does.
export function BooksHome({ books, onSelectBook, onAddBook }: BooksHomeProps) {
  const { push } = useToast();
  const [scanning, setScanning] = useState(false);
  const autoSynced = useRef(false);

  async function runSync(opts: { quietIfEmpty: boolean }) {
    if (scanning) return;
    setScanning(true);
    try {
      const res = await syncLocalBooks();
      if (!res.ok) {
        if (!opts.quietIfEmpty) {
          push(res.error || "Couldn't scan books folder", 'error');
        }
        return;
      }
      const msg = syncToastMessage(res.added ?? 0, res.linked ?? 0);
      if (msg) push(msg, 'success');
      else if (!opts.quietIfEmpty) push('Shelf already matches your folder', 'success');
    } catch {
      if (!opts.quietIfEmpty) push("Couldn't scan books folder", 'error');
    } finally {
      setScanning(false);
    }
  }

  // When you open Books, pull in anything new under the configured folder
  // so you don't have to Add → search local for every file.
  useEffect(() => {
    if (autoSynced.current) return;
    autoSynced.current = true;
    void runSync({ quietIfEmpty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Books</h1>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.scanBtn}
            onClick={() => void runSync({ quietIfEmpty: false })}
            disabled={scanning}
          >
            <FolderScanIcon />
            {scanning ? 'Scanning…' : 'Scan folder'}
          </button>
          <button type="button" className={styles.addBtn} onClick={onAddBook}>
            <PlusIcon />
            Add book
          </button>
        </div>
      </div>

      {books.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyTitle}>Your shelf is empty</span>
          <span>
            Scan your books folder to import what&apos;s already on disk, or search Open Library to
            add one by hand.
          </span>
          <div className={styles.emptyActions}>
            <button
              type="button"
              className={styles.emptyBtn}
              onClick={() => void runSync({ quietIfEmpty: false })}
              disabled={scanning}
            >
              <FolderScanIcon />
              {scanning ? 'Scanning…' : 'Scan books folder'}
            </button>
            <button type="button" className={styles.emptyBtnSecondary} onClick={onAddBook}>
              <PlusIcon />
              Add manually
            </button>
          </div>
        </div>
      ) : (
        SHELVES.map((shelf) => {
          const items = books.filter((b) => b.status === shelf.key);
          if (items.length === 0) return null;
          return (
            <section key={shelf.key} className={styles.shelf}>
              <h2 className={styles.shelfHeading}>{shelf.label}</h2>
              <div className={styles.grid}>
                {items.map((book) => (
                  <BookCard key={book.id} book={book} onSelect={onSelectBook} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
