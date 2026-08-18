import { useEffect, useRef, useState } from 'react';
import { addBook, searchBooks } from '../../../api/actions/books';
import type { BookSearchResult } from '../../../api/types';
import { Sheet } from '../../../primitives/Sheet/Sheet';
import { BookIcon } from '../icons';
import styles from './AddBookSheet.module.css';

interface AddBookSheetProps {
  open: boolean;
  onClose: () => void;
}

// Search-as-you-type over Open Library first (no key needed - see the
// Reading redesign plan's Books decision), with a manual-entry fallback
// for anything Open Library doesn't have. Either path lands the book on
// the "Want to Read" shelf; status changes happen in BookDetail.
export function AddBookSheet({ open, onClose }: AddBookSheetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSearchError(null);
      setManualOpen(false);
      setManualTitle('');
      setManualAuthor('');
    }
  }, [open]);

  function runSearch(q: string) {
    setSearching(true);
    setSearchError(null);
    searchBooks(q)
      .then(
        (res) => {
          setResults(res.results);
          if (!res.ok) setSearchError(res.error || "Couldn't reach Open Library");
        },
        () => {
          setResults([]);
          setSearchError("Couldn't reach Open Library");
        },
      )
      .finally(() => setSearching(false));
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleAdd(result: BookSearchResult) {
    setAdding(result.openlibrary_key ?? result.title);
    await addBook({
      title: result.title,
      author: result.author,
      cover_url: result.cover_url,
      openlibrary_key: result.openlibrary_key,
      status: 'want',
    }).catch(() => {});
    setAdding(null);
    onClose();
  }

  async function handleManualAdd() {
    const title = manualTitle.trim();
    if (!title) return;
    setAdding('manual');
    await addBook({ title, author: manualAuthor.trim() || 'Unknown', status: 'want' }).catch(() => {});
    setAdding(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a book" subtitle="Search Open Library, or add one by hand.">
      <div className={styles.field}>
        <input
          type="text"
          className={styles.input}
          placeholder="Search by title or author…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {searching && <span className={styles.hint}>Searching…</span>}

      {!searching && searchError && (
        <div className={styles.errorRow}>
          <span className={styles.errorText}>{searchError}</span>
          <button type="button" className={styles.retryBtn} onClick={() => runSearch(query.trim())}>
            Retry
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div className={styles.results}>
          {results.map((r) => (
            <button
              type="button"
              key={r.openlibrary_key ?? r.title}
              className={styles.resultRow}
              onClick={() => handleAdd(r)}
              disabled={adding !== null}
            >
              <span className={styles.resultCover}>
                {r.cover_url ? <img src={r.cover_url} alt="" /> : <BookIcon />}
              </span>
              <span className={styles.resultText}>
                <span className={styles.resultTitle}>{r.title}</span>
                <span className={styles.resultAuthor}>
                  {r.author}
                  {r.first_publish_year ? ` · ${r.first_publish_year}` : ''}
                </span>
              </span>
              <span className={styles.resultAdd}>{adding === (r.openlibrary_key ?? r.title) ? 'Adding…' : 'Add'}</span>
            </button>
          ))}
        </div>
      )}

      {query.trim() && !searching && !searchError && results.length === 0 && (
        <span className={styles.hint}>No matches on Open Library for "{query.trim()}".</span>
      )}

      <div className={styles.manualToggleRow}>
        <button type="button" className={styles.manualToggle} onClick={() => setManualOpen((v) => !v)}>
          {manualOpen ? 'Cancel manual entry' : "Can't find it? Add manually"}
        </button>
      </div>

      {manualOpen && (
        <div className={styles.manualForm}>
          <div className={styles.field}>
            <input
              type="text"
              className={styles.input}
              placeholder="Title"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <input
              type="text"
              className={styles.input}
              placeholder="Author"
              value={manualAuthor}
              onChange={(e) => setManualAuthor(e.target.value)}
            />
          </div>
          <button type="button" className={styles.manualAddBtn} onClick={handleManualAdd} disabled={!manualTitle.trim() || adding !== null}>
            Add to shelf
          </button>
        </div>
      )}
    </Sheet>
  );
}
