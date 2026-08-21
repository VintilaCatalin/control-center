import type { Book } from '../../../api/types';
import { ArtTile } from '../../../primitives/ArtTile/ArtTile';
import { BookIcon } from '../icons';
import styles from './BookCard.module.css';

interface BookCardProps {
  book: Book;
  onSelect: (book: Book) => void;
}

// A plain poster grid, not PlexPosterScroller's caption-less cinematic
// treatment - a personal library is a management view (you're scanning
// for a specific title), not a browsing rail, so title/author stay
// visible under the cover rather than being stripped for pure imagery.
export function BookCard({ book, onSelect }: BookCardProps) {
  const showProgress = book.status === 'reading';
  const pct = Math.max(0, Math.min(100, book.progress_pct || 0));

  return (
    <button type="button" className={styles.card} onClick={() => onSelect(book)}>
      <span className={styles.coverWrap}>
        <ArtTile aspect="portrait" src={book.cover_url} alt={book.title} fallback={<BookIcon />} className={styles.art} />
        {showProgress && (
          <span className={styles.progress} aria-hidden="true">
            <span className={styles.progressFill} style={{ width: `${pct}%` }} />
          </span>
        )}
      </span>
      <span className={styles.title}>{book.title}</span>
      <span className={styles.author}>{book.author}</span>
    </button>
  );
}
