import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteBook, editBook, findBookCopies, searchLocalBooks } from '../../../api/actions/books';
import { toggleRaindropSave } from '../../../api/actions/library';
import { useSnapshotData } from '../../../api/SnapshotProvider';
import type { Book, BookCopyResult } from '../../../api/types';
import { ArtTile } from '../../../primitives/ArtTile/ArtTile';
import { useToast } from '../../../primitives/Toast/ToastProvider';
import { duration, ease } from '../../../tokens/motion';
import { BackIcon, BookIcon, CheckIcon, PencilIcon, TrashIcon } from '../icons';
import { SaveButton } from '../SaveButton';
import { BookReader, hasResumePoint } from './BookReader';
import styles from './BookDetail.module.css';

interface BookDetailProps {
  book: Book;
  onClose: () => void;
  onBookChange?: (patch: Partial<Book>) => void;
}

const STATUSES: { key: Book['status']; label: string }[] = [
  { key: 'want', label: 'Want to Read' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
];

function normalizeShelfFileUrl(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return raw;
  try {
    if (raw.startsWith('/')) return raw;
    const parsed = new URL(raw, window.location.origin);
    if (parsed.pathname.startsWith('/api/books/')) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* keep */
  }
  return raw;
}

// A quiet management screen, not another cinematic detail takeover - a
// book's cover is already the interesting part; this is where you update
// status/progress and get out, not a page designed to be lingered on.
export function BookDetail({ book, onClose, onBookChange }: BookDetailProps) {
  const { snapshot } = useSnapshotData();
  const { push } = useToast();
  const [status, setStatus] = useState(book.status);
  const [progress, setProgress] = useState(book.progress_pct);
  const [notes, setNotes] = useState(book.notes ?? '');
  const [fileUrl, setFileUrl] = useState(normalizeShelfFileUrl(book.file_url ?? ''));
  const [readingCfi, setReadingCfi] = useState(book.reading_cfi ?? null);
  const [coverUrl, setCoverUrl] = useState(book.cover_url ?? null);
  const [deleting, setDeleting] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [editingFileUrl, setEditingFileUrl] = useState(false);
  const [copyResults, setCopyResults] = useState<BookCopyResult[] | null>(null);
  const [copySearching, setCopySearching] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileUrlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const raindropUrl = useMemo(() => {
    if (book.openlibrary_key) return `https://openlibrary.org${book.openlibrary_key}`;
    if (fileUrl.startsWith('http')) return fileUrl;
    return null;
  }, [book.openlibrary_key, fileUrl]);

  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!raindropUrl) {
      setSaved(false);
      return;
    }
    setSaved((snapshot?.library?.saved_urls ?? []).includes(raindropUrl));
  }, [raindropUrl, snapshot?.library?.saved_urls]);

  useEffect(() => {
    setStatus(book.status);
    setProgress(book.progress_pct);
    setNotes(book.notes ?? '');
    setFileUrl(normalizeShelfFileUrl(book.file_url ?? ''));
    setReadingCfi(book.reading_cfi ?? null);
    setCoverUrl(book.cover_url ?? null);
    setEditingFileUrl(false);
    setCopyResults(null);
    setCopyError(null);
  }, [book.id, book.status, book.progress_pct, book.notes, book.file_url, book.reading_cfi, book.cover_url]);

  useEffect(() => {
    setReaderOpen(false);
  }, [book.id]);

  useEffect(
    () => () => {
      clearTimeout(notesTimer.current);
      clearTimeout(fileUrlTimer.current);
    },
    [],
  );

  function patchBook(patch: Partial<Book>) {
    if (patch.status) setStatus(patch.status);
    if (patch.progress_pct != null) setProgress(patch.progress_pct);
    if (patch.notes != null) setNotes(patch.notes);
    if (patch.file_url != null) setFileUrl(normalizeShelfFileUrl(patch.file_url));
    if (patch.reading_cfi !== undefined) setReadingCfi(patch.reading_cfi ?? null);
    if (patch.cover_url !== undefined) setCoverUrl(patch.cover_url ?? null);
    onBookChange?.(patch);
  }

  function handleStatus(next: Book['status']) {
    if (next === 'want') {
      // Manual demote → clean slate so it leaves Reading Now and starts at 0.
      try {
        localStorage.removeItem(`cc.book.pos.${book.id}`);
      } catch {
        /* ignore */
      }
      patchBook({ status: 'want', progress_pct: 0, reading_cfi: null });
      editBook(book.id, { status: 'want', progress_pct: 0, reading_cfi: '' }).catch(() => {
        push('Couldn’t update status', 'error');
      });
      return;
    }
    const extras = next === 'finished' ? { progress_pct: 100 as const } : {};
    patchBook({ status: next, ...extras });
    editBook(book.id, { status: next, ...extras }).catch(() => {
      push('Couldn’t update status', 'error');
    });
  }

  function handleProgress(next: number) {
    patchBook({ progress_pct: next });
    editBook(book.id, { progress_pct: next }).catch(() => {});
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      editBook(book.id, { notes: value }).catch(() => {});
      onBookChange?.({ notes: value });
    }, 700);
  }

  function handleFileUrlChange(value: string) {
    const next = normalizeShelfFileUrl(value);
    setFileUrl(next);
    clearTimeout(fileUrlTimer.current);
    fileUrlTimer.current = setTimeout(() => {
      editBook(book.id, { file_url: next }).catch(() => {});
      onBookChange?.({ file_url: next });
    }, 700);
  }

  function useCopy(copy: BookCopyResult) {
    const next = normalizeShelfFileUrl(copy.url);
    setFileUrl(next);
    clearTimeout(fileUrlTimer.current);
    editBook(book.id, { file_url: next }).catch(() => {});
    onBookChange?.({ file_url: next });
    setEditingFileUrl(false);
    setCopyResults(null);
    if (copy.kind === 'read') openReader(next);
  }

  function openReader(overrideUrl?: string) {
    const target = normalizeShelfFileUrl(overrideUrl ?? fileUrl);
    if (!target) return;
    setFileUrl(target);
    setReaderOpen(true);
    if (status === 'want') {
      patchBook({ status: 'reading' });
      editBook(book.id, { status: 'reading' }).catch(() => push('Couldn’t mark as Reading', 'error'));
    }
  }

  async function handleFindCopies() {
    setCopySearching(true);
    setCopyError(null);
    try {
      const res = await findBookCopies({
        title: book.title,
        author: book.author,
        openlibrary_key: book.openlibrary_key,
      });
      if (!res.ok && !res.results?.length) {
        setCopyResults([]);
        setCopyError(res.error || 'Couldn’t search free copies');
      } else {
        setCopyResults(res.results ?? []);
        if (!(res.results ?? []).length) setCopyError('No free public copy found — paste your own link below');
      }
    } catch {
      setCopyResults([]);
      setCopyError('Couldn’t reach the free-copy search');
    } finally {
      setCopySearching(false);
    }
  }

  async function handleFindLocal() {
    setCopySearching(true);
    setCopyError(null);
    try {
      const res = await searchLocalBooks({ title: book.title, author: book.author });
      if (!res.ok && !res.results?.length) {
        setCopyResults([]);
        setCopyError(res.error || 'Couldn’t search your library');
      } else {
        setCopyResults(res.results ?? []);
        if (!(res.results ?? []).length) {
          setCopyError('Not in your library folder — paste a link or try Find free copy');
        }
      }
    } catch {
      setCopyResults([]);
      setCopyError('Couldn’t reach your library folder');
    } finally {
      setCopySearching(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    await deleteBook(book.id).catch(() => {});
    onClose();
  }

  const showLinkEditor = editingFileUrl || !fileUrl.trim();

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
            <ArtTile aspect="portrait" src={coverUrl} alt={book.title} fallback={<BookIcon />} />
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

            {raindropUrl && (
              <div className={styles.saveRow}>
                <SaveButton
                  saved={saved}
                  onToggle={() => {
                    const next = !saved;
                    setSaved(next);
                    toggleRaindropSave(
                      {
                        url: raindropUrl,
                        title: book.title,
                        excerpt: book.author,
                        cover: coverUrl,
                      },
                      next,
                      'books',
                    ).catch(() => setSaved(!next));
                  }}
                  variant="panel"
                  inline
                />
                <span className={styles.saveHint}>{saved ? 'In Raindrop · From Reading' : 'Save to Raindrop'}</span>
              </div>
            )}

            <div className={styles.fileBlock}>
              {showLinkEditor ? (
                <>
                  <span className={styles.fileLabel}>Reading link</span>
                  <div className={styles.fileActions}>
                    <button
                      type="button"
                      className={styles.findBtn}
                      onClick={handleFindLocal}
                      disabled={copySearching}
                    >
                      {copySearching ? 'Searching…' : 'Search my library'}
                    </button>
                    <button
                      type="button"
                      className={styles.findBtn}
                      onClick={handleFindCopies}
                      disabled={copySearching}
                    >
                      Find free copy
                    </button>
                    {editingFileUrl && (
                      <button type="button" className={styles.fileDoneBtn} onClick={() => setEditingFileUrl(false)}>
                        Done
                      </button>
                    )}
                  </div>
                  {copyError && <p className={styles.copyHint}>{copyError}</p>}
                  {copyResults && copyResults.length > 0 && (
                    <ul className={styles.copyList}>
                      {copyResults.map((c) => (
                        <li key={c.url} className={styles.copyItem}>
                          <div className={styles.copyMeta}>
                            <span className={styles.copySource}>
                              {c.source}
                              {c.format ? ` · ${c.format}` : ''}
                              {c.kind === 'borrow' ? ' · borrow' : ''}
                            </span>
                            <span className={styles.copyTitle}>{c.title}</span>
                          </div>
                          <button type="button" className={styles.copyUseBtn} onClick={() => useCopy(c)}>
                            Use
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className={styles.fileRow}>
                    <input
                      type="text"
                      className={styles.fileInput}
                      placeholder="Or paste PDF/EPUB, Drive, or your own link…"
                      value={fileUrl}
                      onChange={(e) => handleFileUrlChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingFileUrl(false)}
                      autoFocus={editingFileUrl}
                    />
                  </div>
                </>
              ) : (
                <div className={styles.fileRow}>
                  <button type="button" className={styles.readBtn} onClick={() => openReader()}>
                    {hasResumePoint(readingCfi) ? 'Continue' : 'Read'}
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

      {readerOpen && fileUrl.trim() && (
        <BookReader
          title={book.title}
          url={fileUrl.trim()}
          bookId={book.id}
          initialCfi={readingCfi}
          onClose={() => setReaderOpen(false)}
          onLocation={(cfi, pct, meta) => {
            const patch: Partial<Book> = { reading_cfi: cfi };
            if (pct != null) patch.progress_pct = pct;
            if (meta?.status) patch.status = meta.status;
            patchBook(patch);
          }}
        />
      )}
    </motion.div>
  );
}
