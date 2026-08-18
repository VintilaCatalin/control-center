import type { Book } from '../../../api/types';
import { PlusIcon } from '../icons';
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

// Its own visual system, not the news feed's - a plain multi-shelf poster
// grid (fixed uniform tile size), no masonry, no scrim-title overlays.
// Book covers are already designed objects; they don't need editorial
// treatment the way a photo thumbnail does.
export function BooksHome({ books, onSelectBook, onAddBook }: BooksHomeProps) {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Books</h1>
        <button type="button" className={styles.addBtn} onClick={onAddBook}>
          <PlusIcon />
          Add book
        </button>
      </div>

      {books.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyTitle}>Your shelf is empty</span>
          <span>Search Open Library or add a book by hand to start tracking what you're reading.</span>
          <button type="button" className={styles.emptyBtn} onClick={onAddBook}>
            <PlusIcon />
            Add your first book
          </button>
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
