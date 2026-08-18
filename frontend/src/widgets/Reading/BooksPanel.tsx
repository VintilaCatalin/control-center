import type { Book } from '../../api/types';
import { BookCard } from './Books/BookCard';
import styles from './BooksPanel.module.css';

interface BooksPanelProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
}

// A compact preview of your shelf, not BooksHome shrunk down - just
// whatever you're actively reading right now (falling back to "want to
// read" so the panel isn't blank the moment nothing's in progress), capped
// small enough to sit alongside the topic panels instead of competing with
// them for the whole page.
export function BooksPanel({ books, onSelectBook }: BooksPanelProps) {
  const reading = books.filter((b) => b.status === 'reading');
  const shown = (reading.length > 0 ? reading : books.filter((b) => b.status === 'want')).slice(0, 6);

  if (shown.length === 0) {
    return <div className={styles.empty}>Nothing on your shelf yet.</div>;
  }

  return (
    <div className={styles.grid}>
      {shown.map((book) => (
        <BookCard key={book.id} book={book} onSelect={onSelectBook} />
      ))}
    </div>
  );
}
