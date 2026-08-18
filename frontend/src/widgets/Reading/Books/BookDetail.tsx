import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { deleteBook, editBook } from '../../../api/actions/books';
import type { Book } from '../../../api/types';
import { ArtTile } from '../../../primitives/ArtTile/ArtTile';
import { duration, ease } from '../../../tokens/motion';
import { BackIcon, BookIcon, CheckIcon, PencilIcon, TrashIcon } from '../icons';
import { BookReader } from './BookReader';
import styles from './BookDetail.module.css';

interface BookDetailProps {
  book: Book;
  onClose: () => void;
}

const STATUSES: { key: Book['status']; label: string }[] = [
  { key: 'want', label: 'Want to Read' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
];

// A quiet management screen, not another cinematic detail takeover - a
// book's cover is already the interesting part; this is where you update
// status/progress and get out, not a page designed to be lingered on.
export function BookDetail({ book, onClose }: BookDetailProps) {
  const [status, setStatus] = useState(book.status);
  const [progress, setProgress] = useState(book.progress_pct);
  const [notes, setNotes] = useState(book.notes ?? '');
  const [fileUrl, setFileUrl] = useState(book.file_url ?? '');
  const [deleting, setDeleting] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [editingFileUrl, setEditingFileUrl] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileUrlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // AnimatePresence keeps a closing BookDetail instance (and its state)
  // mounted through its exit animation - reopening the same book quickly
  // enough can reuse that instance rather than getting a fresh mount, so
  // local state needs to resync from the prop explicitly (same pattern
  // ArticleDetail/VideoDetail already use), not just seed once via
  // useState's initial value.
  useEffect(() => {
    setStatus(book.status);
    setProgress(book.progress_pct);
    setNotes(book.notes ?? '');
    setFileUrl(book.file_url ?? '');
    setEditingFileUrl(false);
  }, [book.id, book.status, book.progress_pct, book.notes, book.file_url]);

  useEffect(
    () => () => {
      clearTimeout(notesTimer.current);
      clearTimeout(fileUrlTimer.current);
    },
    [],
  );

  function handleStatus(next: Book['status']) {
    setStatus(next);
    if (next === 'finished') setProgress(100);
    editBook(book.id, { status: next, ...(next === 'finished' ? { progress_pct: 100 } : {}) }).catch(() => {});
  }

  function handleProgress(next: number) {
    setProgress(next);
    editBook(book.id, { progress_pct: next }).catch(() => {});
  }

  // Debounced save-as-you-type, not save-on-blur - blur is easy to miss
  // (closing the sheet, switching apps) and left notes silently unsaved.
  // Same pattern Notes' own editor uses for exactly this reason.
  function handleNotesChange(value: string) {
    setNotes(value);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => editBook(book.id, { notes: value }).catch(() => {}), 700);
  }

  function handleFileUrlChange(value: string) {
    setFileUrl(value);
    clearTimeout(fileUrlTimer.current);
    fileUrlTimer.current = setTimeout(() => editBook(book.id, { file_url: value }).catch(() => {}), 700);
  }

  async function handleDelete() {
    setDeleting(true);
    await deleteBook(book.id).catch(() => {});
    onClose();
  }

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: duration.base, ease }}
    >
      <div className={styles.scroll}>
        <button type="button" className={styles.backBtn} onClick={onClose}>
          <BackIcon />
          <span>Back to Books</span>
        </button>

        <div className={styles.layout}>
          <div className={styles.cover}>
            <ArtTile aspect="portrait" src={book.cover_url} alt={book.title} fallback={<BookIcon />} />
          </div>

          <div className={styles.info}>
            <h1 className={styles.title}>{book.title}</h1>
            <span className={styles.author}>{book.author}</span>

            <div className={styles.statusRow}>
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={[styles.statusBtn, status === s.key ? styles.statusBtnActive : ''].filter(Boolean).join(' ')}
                  onClick={() => handleStatus(s.key)}
                >
                  {status === s.key && <CheckIcon />}
                  {s.label}
                </button>
              ))}
            </div>

            {status === 'reading' && (
              <div className={styles.progressBlock}>
                <div className={styles.progressLabel}>
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => handleProgress(Number(e.target.value))}
                  className={styles.slider}
                />
              </div>
            )}

            {book.openlibrary_key && (
              <a
                className={styles.olLink}
                href={`https://openlibrary.org${book.openlibrary_key}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Open Library ↗
              </a>
            )}

            {/* What makes the shelf actually usable, not just a tracker -
                a link to a real reading copy (PDF/EPUB URL, Drive share,
                a personal server), with an in-app reader once it's set.
                Once a link exists, the raw URL stays hidden behind a
                plain "Read" button - a pencil re-opens it for editing,
                rather than a permanently-visible text field. */}
            <div className={styles.fileBlock}>
              {editingFileUrl || !fileUrl.trim() ? (
                <>
                  <span className={styles.fileLabel}>Reading link</span>
                  <div className={styles.fileRow}>
                    <input
                      type="text"
                      className={styles.fileInput}
                      placeholder="PDF/EPUB URL, Google Drive link, or your own server…"
                      value={fileUrl}
                      onChange={(e) => handleFileUrlChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingFileUrl(false)}
                      autoFocus={editingFileUrl}
                    />
                    {editingFileUrl && (
                      <button type="button" className={styles.fileDoneBtn} onClick={() => setEditingFileUrl(false)}>
                        Done
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className={styles.fileRow}>
                  <button type="button" className={styles.readBtn} onClick={() => setReaderOpen(true)}>
                    Read
                  </button>
                  <button type="button" className={styles.fileEditBtn} onClick={() => setEditingFileUrl(true)} title="Change reading link">
                    <PencilIcon />
                  </button>
                </div>
              )}
            </div>

            <textarea
              className={styles.notes}
              placeholder="Notes…"
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={4}
            />

            <button type="button" className={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
              <TrashIcon />
              Remove from shelf
            </button>
          </div>
        </div>
      </div>

      {readerOpen && fileUrl.trim() && <BookReader title={book.title} url={fileUrl.trim()} onClose={() => setReaderOpen(false)} />}
    </motion.div>
  );
}
