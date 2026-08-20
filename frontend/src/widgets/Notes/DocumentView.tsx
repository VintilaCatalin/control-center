import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { NoteEntry } from '../../api/types';
import { duration, ease } from '../../tokens/motion';
import { BookIcon, DotsIcon, NoteIcon, PencilIcon, StarIcon } from './icons';
import { Markdown } from './markdown';
import { findMarkdownTable, findMarkdownTableByRaw, serializeMarkdownTable, type MarkdownTableRange } from './markdownTable';
import { TableEditor } from './TableEditor';
import styles from './DocumentView.module.css';

interface DocumentViewProps {
  note: NoteEntry;
  text: string;
  loading: boolean;
  saving: boolean;
  saveError?: string | null;
  onTextChange: (rel: string, text: string) => void | Promise<void>;
  onTogglePin: () => void;
  onMove: () => void;
  onRename: (name: string) => Promise<void>;
  onWikiLink: (name: string) => void;
  onOpenMenu: (e: React.MouseEvent) => void;
}

type ViewMode = 'write' | 'split' | 'read';

export function DocumentView({ note, text, loading, saving, saveError, onTextChange, onTogglePin, onMove, onRename, onWikiLink, onOpenMenu }: DocumentViewProps) {
  const [mode, setMode] = useState<ViewMode>(() => note.size > 0 ? 'read' : 'write');
  const [formatOpen, setFormatOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(note.name);
  const [draft, setDraft] = useState(text);
  const [tableRange, setTableRange] = useState<MarkdownTableRange | null>(null);
  const activeNoteRef = useRef(note.rel);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const noteChanged = activeNoteRef.current !== note.rel;
    activeNoteRef.current = note.rel;
    if (!noteChanged) return;
    setMode(note.size > 0 ? 'read' : 'write');
    setFormatOpen(false);
    setEditingTitle(false);
    setTitleDraft(note.name);
    setTableRange(null);
  }, [note.rel, note.name, note.size]);

  useEffect(() => {
    if (!editingTitle) setTitleDraft(note.name);
  }, [editingTitle, note.name]);

  useEffect(() => setDraft(text), [note.rel, text]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  function queueSave(next: string, immediate = false) {
    setDraft(next);
    clearTimeout(saveTimer.current);
    if (immediate) onTextChange(note.rel, next);
    else saveTimer.current = setTimeout(() => onTextChange(note.rel, next), 650);
  }

  function replaceSelection(before: string, after = before, placeholder = 'text') {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = draft.slice(start, end) || placeholder;
    const next = `${draft.slice(0, start)}${before}${selected}${after}${draft.slice(end)}`;
    queueSave(next);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function prefixLines(prefix: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const start = draft.lastIndexOf('\n', Math.max(0, editor.selectionStart - 1)) + 1;
    const tail = draft.indexOf('\n', editor.selectionEnd);
    const end = tail < 0 ? draft.length : tail;
    const block = draft.slice(start, end).split('\n').map((line) => `${prefix}${line}`).join('\n');
    queueSave(`${draft.slice(0, start)}${block}${draft.slice(end)}`);
    requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(start + prefix.length, start + block.length); });
  }

  function insertLink() {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const label = draft.slice(start, end) || 'link text';
    const insertion = `[${label}](https://)`;
    queueSave(`${draft.slice(0, start)}${insertion}${draft.slice(end)}`);
    requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(start + label.length + 3, start + insertion.length - 1); });
  }

  function insertAtCursor(value: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = `${draft.slice(0, start)}${value}${draft.slice(end)}`;
    queueSave(next);
    requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(start + value.length, start + value.length); });
  }

  function openTable(raw?: string) {
    const editor = editorRef.current;
    const existing = raw ? findMarkdownTableByRaw(draft, raw) : findMarkdownTable(draft, editor?.selectionStart ?? 0);
    if (existing) {
      setTableRange(existing);
      return;
    }
    const start = editor?.selectionStart ?? draft.length;
    const seed = '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n|  |  |';
    const needsLeadingBreak = start > 0 && draft[start - 1] !== '\n';
    const needsTrailingBreak = start < draft.length && draft[start] !== '\n';
    const insertion = `${needsLeadingBreak ? '\n\n' : ''}${seed}${needsTrailingBreak ? '\n\n' : ''}`;
    const tableStart = start + (needsLeadingBreak ? 2 : 0);
    const next = `${draft.slice(0, start)}${insertion}${draft.slice(start)}`;
    queueSave(next);
    const range = findMarkdownTable(next, tableStart + 2);
    if (range) setTableRange(range);
  }

  function handleTableSave(table: Parameters<typeof serializeMarkdownTable>[0]) {
    if (!tableRange) return;
    const replacement = serializeMarkdownTable(table);
    const next = `${draft.slice(0, tableRange.start)}${replacement}${draft.slice(tableRange.end)}`;
    setTableRange(null);
    queueSave(next, true);
  }

  function handleTaskToggle(raw: string, checked: boolean) {
    const swapped = checked ? raw.replace('[ ]', '[x]') : raw.replace(/\[x\]/i, '[ ]');
    if (swapped !== raw) queueSave(draft.replace(raw, swapped), true);
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 'b') { event.preventDefault(); replaceSelection('**'); }
    if (event.key.toLowerCase() === 'i') { event.preventDefault(); replaceSelection('*'); }
    if (event.key.toLowerCase() === 's') { event.preventDefault(); queueSave(draft, true); }
  }

  async function handleMove() {
    clearTimeout(saveTimer.current);
    await onTextChange(note.rel, draft);
    onMove();
  }

  async function commitTitle() {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === note.name) {
      setTitleDraft(note.name);
      return;
    }
    clearTimeout(saveTimer.current);
    await onTextChange(note.rel, draft);
    await onRename(next);
  }

  const status = saveError ? saveError : saving ? 'Saving…' : 'Saved';

  return (
    <div className={styles.canvas}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.identity}>
            <button type="button" className={styles.breadcrumb} onClick={handleMove} title="Move this note to another folder">{note.folder || 'Unfiled'} <span>›</span></button>
            <h1>
              <span><NoteIcon size={19} /></span>
              {editingTitle ? (
                <input
                  className={styles.titleInput}
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => void commitTitle()}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
                    if (event.key === 'Escape') { event.preventDefault(); setTitleDraft(note.name); setEditingTitle(false); }
                  }}
                  aria-label="Note title"
                  autoFocus
                />
              ) : <button type="button" className={styles.titleButton} onClick={() => setEditingTitle(true)} title="Rename note">{note.name}</button>}
            </h1>
            <div className={`${styles.status} ${saveError ? styles.statusError : ''}`}>{status}</div>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.modes} aria-label="Note view">
              <ModeButton active={mode === 'write'} onClick={() => setMode('write')} icon={<PencilIcon />} label="Write" />
              <ModeButton active={mode === 'split'} onClick={() => setMode('split')} label="Split" />
              <ModeButton active={mode === 'read'} onClick={() => setMode('read')} icon={<BookIcon />} label="Read" />
            </div>
            <button type="button" className={`${styles.iconButton} ${note.pinned ? styles.pinned : ''}`} onClick={onTogglePin} title={note.pinned ? 'Unpin' : 'Pin'}><StarIcon filled={note.pinned} /></button>
            <button type="button" className={styles.iconButton} onClick={onOpenMenu} title="More"><DotsIcon /></button>
          </div>
        </div>
      </header>

      {mode !== 'read' && (
        <FormattingDock
          open={formatOpen}
          onToggle={() => setFormatOpen((current) => !current)}
          onClose={() => setFormatOpen(false)}
          onTitle={() => prefixLines('# ')}
          onHeading={() => prefixLines('## ')}
          onBold={() => replaceSelection('**')}
          onItalic={() => replaceSelection('*')}
          onStrike={() => replaceSelection('~~')}
          onCode={() => replaceSelection('`', '`', 'code')}
          onBullet={() => prefixLines('- ')}
          onNumbered={() => prefixLines('1. ')}
          onTask={() => prefixLines('- [ ] ')}
          onQuote={() => prefixLines('> ')}
          onLink={insertLink}
          onWikiLink={() => replaceSelection('[[', ']]', 'Note name')}
          onCodeBlock={() => replaceSelection('```\n', '\n```', 'code')}
          onDivider={() => insertAtCursor('\n\n---\n\n')}
          onTable={() => openTable()}
        />
      )}

      <div className={`${styles.workspace} ${mode === 'split' ? styles.split : ''}`}>
        {loading ? <div className={styles.loading}>Opening note…</div> : (
          <>
            {mode !== 'read' && (
              <motion.div className={styles.editorPane} initial={reduceMotion ? undefined : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: duration.fast, ease }}>
                <textarea ref={editorRef} className={styles.editor} value={draft} onChange={(event) => queueSave(event.target.value)} onKeyDown={handleEditorKeyDown} onBlur={() => queueSave(draft, true)} placeholder="Start writing…" spellCheck autoFocus />
              </motion.div>
            )}
            {mode !== 'write' && (
              <motion.div className={styles.previewPane} initial={reduceMotion ? undefined : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: duration.fast, ease }}>
                <div className={styles.previewColumn}><Markdown text={withoutDuplicateTitle(draft, note.name)} onWikiLink={onWikiLink} onToggleTask={handleTaskToggle} onEditTable={openTable} /></div>
              </motion.div>
            )}
          </>
        )}
      </div>

      <TableEditor open={!!tableRange} initial={tableRange?.table ?? null} onClose={() => setTableRange(null)} onSave={handleTableSave} />
    </div>
  );
}

function withoutDuplicateTitle(text: string, title: string): string {
  const lines = text.split('\n');
  const first = lines[0]?.match(/^#\s+(.+?)\s*$/);
  if (!first) return text;
  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (normalize(first[1]) !== normalize(title)) return text;
  return lines.slice(1).join('\n').replace(/^\s*\n/, '');
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon?: React.ReactNode; label: string }) {
  return <button type="button" className={active ? styles.modeActive : ''} onClick={onClick} aria-pressed={active}>{icon}{label}</button>;
}

interface FormattingBarProps {
  onTitle: () => void;
  onHeading: () => void;
  onBold: () => void;
  onItalic: () => void;
  onStrike: () => void;
  onCode: () => void;
  onBullet: () => void;
  onNumbered: () => void;
  onTask: () => void;
  onQuote: () => void;
  onLink: () => void;
  onWikiLink: () => void;
  onCodeBlock: () => void;
  onDivider: () => void;
  onTable: () => void;
}

function FormattingDock({ open, onToggle, onClose, onTitle, onHeading, onBold, onItalic, onStrike, onCode, onBullet, onNumbered, onTask, onQuote, onLink, onWikiLink, onCodeBlock, onDivider, onTable }: FormattingBarProps & { open: boolean; onToggle: () => void; onClose: () => void }) {
  function run(action: () => void) {
    action();
    onClose();
  }

  const groups = [
    { label: 'Text', tools: [
      { glyph: 'H1', label: 'Title', action: onTitle },
      { glyph: 'H2', label: 'Heading', action: onHeading },
      { glyph: 'B', label: 'Bold', action: onBold },
      { glyph: 'I', label: 'Italic', action: onItalic },
      { glyph: 'S', label: 'Strike', action: onStrike },
      { glyph: '</>', label: 'Code', action: onCode },
    ] },
    { label: 'Blocks', tools: [
      { glyph: '•', label: 'Bullets', action: onBullet },
      { glyph: '1.', label: 'Numbered', action: onNumbered },
      { glyph: '☑', label: 'Checklist', action: onTask },
      { glyph: '❯', label: 'Quote', action: onQuote },
      { glyph: '{ }', label: 'Code block', action: onCodeBlock },
      { glyph: '▦', label: 'Table', action: onTable },
    ] },
    { label: 'Insert', tools: [
      { glyph: '↗', label: 'Web link', action: onLink },
      { glyph: '[[ ]]', label: 'Note link', action: onWikiLink },
      { glyph: '―', label: 'Divider', action: onDivider },
    ] },
  ];

  return (
    <div className={styles.formatDock}>
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.formatMenu}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: duration.fast, ease }}
            aria-label="Formatting tools"
          >
            {groups.map((group) => (
              <div key={group.label} className={styles.formatGroup}>
                <span className={styles.formatLabel}>{group.label}</span>
                <div className={styles.formatGrid}>
                  {group.tools.map((tool) => (
                    <button key={tool.label} type="button" onClick={() => run(tool.action)}>
                      <strong>{tool.glyph}</strong>
                      <span>{tool.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        className={`${styles.formatToggle} ${open ? styles.formatToggleOpen : ''}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Formatting tools"
        title="Formatting tools"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
      >
        Aa
      </motion.button>
    </div>
  );
}
