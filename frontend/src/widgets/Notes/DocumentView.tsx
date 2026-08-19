import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { NoteEntry } from '../../api/types';
import { duration, ease } from '../../tokens/motion';
import { BookIcon, DotsIcon, NoteIcon, PencilIcon, StarIcon } from './icons';
import { Markdown } from './markdown';
import styles from './DocumentView.module.css';

interface DocumentViewProps {
  note: NoteEntry;
  text: string;
  loading: boolean;
  saving: boolean;
  onTextChange: (text: string) => void;
  onTogglePin: () => void;
  onWikiLink: (name: string) => void;
  onOpenMenu: (e: React.MouseEvent) => void;
}

// The document IS the application - no surrounding card, no border, just
// a centred reading column on the shell's own background. Reading is the
// resting state; editing is a deliberate mode entered via the pencil,
// typography-matched to the reader so the two never feel like different
// apps stitched together.
export function DocumentView({ note, text, loading, saving, onTextChange, onTogglePin, onWikiLink, onOpenMenu }: DocumentViewProps) {
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const reduceMotion = useReducedMotion();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(text);

  // Split deliberately: switching to a different note should reset both
  // the draft and the view mode, but a `text` prop change alone (the
  // debounced save echoing back through the parent, or the note's real
  // content arriving asynchronously just after `note.rel` changes - see
  // NotesShell's fetchNote) must never flip Edit back to Read on its own.
  // Read/Edit only ever changes from the pencil/book button below.
  useEffect(() => {
    setMode('read');
  }, [note.rel]);

  useEffect(() => {
    setDraft(text);
  }, [note.rel, text]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // A textarea never grows to fit its own content the way a div does -
  // left alone it just clips to min-height and scrolls internally,
  // which is exactly the "edit mode looks smaller than read mode" bug.
  // Match Read mode's behaviour by resizing the element itself to its
  // content on every keystroke and on entry, so the page's own .scroll
  // container is what scrolls, not a box-within-a-box.
  function resizeEditor() {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // AnimatePresence's mode="wait" holds the previous element on screen
  // until its exit animation finishes, so the textarea doesn't actually
  // mount into the DOM the instant `mode` becomes 'edit' - a useEffect
  // keyed on `mode` fires too early and finds editorRef.current still
  // null. A callback ref fires exactly when the node mounts, so resize
  // it there instead of trying to time it against React state.
  function attachEditorRef(el: HTMLTextAreaElement | null) {
    editorRef.current = el;
    if (el) resizeEditor();
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onTextChange(value), 900);
    resizeEditor();
  }

  function handleTaskToggle(raw: string, checked: boolean) {
    const swapped = checked ? raw.replace('[ ]', '[x]') : raw.replace(/\[x\]/i, '[ ]');
    if (swapped === raw) return;
    const next = draft.replace(raw, swapped);
    setDraft(next);
    onTextChange(next);
  }

  return (
    <div className={styles.canvas}>
      <div className={styles.scroll}>
        <div className={styles.column}>
          <div className={styles.surface}>
            <div className={styles.head}>
              {note.folder && <div className={styles.breadcrumb}>{note.folder}</div>}
              <div className={styles.titleRow}>
                <h1 className={styles.title}>
                  <span className={styles.titleIcon}>
                    <NoteIcon size={20} />
                  </span>
                  {note.name}
                </h1>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={[styles.iconBtn, note.pinned ? styles.iconBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={onTogglePin}
                    title={note.pinned ? 'Unpin' : 'Pin'}
                    aria-pressed={note.pinned}
                  >
                    <StarIcon filled={note.pinned} />
                  </button>
                  <button type="button" className={styles.editBtn} onClick={() => setMode((m) => (m === 'read' ? 'edit' : 'read'))}>
                    {mode === 'read' ? <PencilIcon /> : <BookIcon />}
                    <span>{mode === 'read' ? 'Edit' : 'Read'}</span>
                  </button>
                  <button type="button" className={styles.iconBtn} onClick={onOpenMenu} title="More" aria-label="More">
                    <DotsIcon />
                  </button>
                </div>
              </div>
              <div className={styles.meta}>{saving ? 'Saving…' : 'Saved'}</div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {loading ? (
                <motion.div key="loading" className={styles.loading} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              ) : mode === 'edit' ? (
                <motion.textarea
                  key="edit"
                  ref={attachEditorRef}
                  className={styles.editor}
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  initial={reduceMotion ? undefined : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: duration.fast, ease }}
                  spellCheck
                  autoFocus
                />
              ) : (
                <motion.div
                  key={note.rel}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: duration.base, ease }}
                >
                  <Markdown text={draft} onWikiLink={onWikiLink} onToggleTask={handleTaskToggle} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
