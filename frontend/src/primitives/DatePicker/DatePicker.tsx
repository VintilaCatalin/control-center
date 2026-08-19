import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { duration, ease } from '../../tokens/motion';
import { localDateKey, parseDateDraft } from './dateMath';
import styles from './DatePicker.module.css';

interface DatePickerProps {
  open: boolean;
  x: number;
  y: number;
  value: string | null;
  intent?: 'schedule' | 'deadline';
  onChange: (date: string | null) => void;
  onClose: () => void;
}

const MONTHS = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2024, month, 1)));
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function dateKey(daysFromToday: number): string {
  return localDateKey(addDays(new Date(), daysFromToday));
}

function nextWeekday(target: number): string {
  const today = new Date();
  const delta = (target - today.getDay() + 7) % 7 || 7;
  return dateKey(delta);
}

const PRESETS: { label: string; get: () => string }[] = [
  { label: 'Today', get: () => dateKey(0) },
  { label: 'Tomorrow', get: () => dateKey(1) },
  { label: 'This weekend', get: () => nextWeekday(6) },
  { label: 'Next week', get: () => dateKey(7) },
];

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function moveMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

function moveFocusedMonth(date: Date, amount: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function calendarDates(view: Date) {
  const first = monthStart(view);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function longDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} /></svg>;
}

export function DatePicker({ open, x, y, value, intent = 'schedule', onChange, onClose }: DatePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialDate = parseDateDraft(value ?? '') ?? new Date();
  const [view, setView] = useState(() => monthStart(initialDate));
  const [draft, setDraft] = useState(value ?? '');
  const [inputError, setInputError] = useState<string | null>(null);
  const [focusDay, setFocusDay] = useState(localDateKey(initialDate));
  const [jumpOpen, setJumpOpen] = useState(false);
  const [yearDraft, setYearDraft] = useState(String(initialDate.getFullYear()));

  useEffect(() => {
    if (!open) return;
    const selected = parseDateDraft(value ?? '') ?? new Date();
    setDraft(value ?? '');
    setInputError(null);
    setView(monthStart(selected));
    setFocusDay(localDateKey(selected));
    setYearDraft(String(selected.getFullYear()));
    setJumpOpen(false);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  const days = useMemo(() => calendarDates(view), [view]);
  const todayKey = localDateKey();
  const selectedKey = parseDateDraft(value ?? '') ? value : null;
  const schedule = intent === 'schedule';
  const left = Math.max(10, Math.min(x, window.innerWidth - 354));
  const top = Math.max(10, Math.min(y, window.innerHeight - 526));

  function choose(date: Date) {
    onChange(localDateKey(date));
    onClose();
  }

  function choosePreset(get: () => string) {
    onChange(get());
    onClose();
  }

  function commitDraft(close = false) {
    const parsed = parseDateDraft(draft);
    if (!parsed) {
      if (draft.trim()) setInputError(/^\d{4}-\d{2}-\d{2}$/.test(draft.trim()) ? 'That date does not exist.' : 'Use the complete format YYYY-MM-DD.');
      return false;
    }
    const key = localDateKey(parsed);
    setDraft(key);
    setInputError(null);
    setView(monthStart(parsed));
    setFocusDay(key);
    if (key !== value) onChange(key);
    if (close) onClose();
    return true;
  }

  function focusCalendarDate(date: Date) {
    const key = localDateKey(date);
    setFocusDay(key);
    setView(monthStart(date));
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(`[data-date="${key}"]`)?.focus());
  }

  function handleDayKey(event: ReactKeyboardEvent<HTMLButtonElement>, date: Date) {
    let next: Date | null = null;
    if (event.key === 'ArrowLeft') next = addDays(date, -1);
    if (event.key === 'ArrowRight') next = addDays(date, 1);
    if (event.key === 'ArrowUp') next = addDays(date, -7);
    if (event.key === 'ArrowDown') next = addDays(date, 7);
    if (event.key === 'Home') next = addDays(date, -((date.getDay() + 6) % 7));
    if (event.key === 'End') next = addDays(date, 6 - ((date.getDay() + 6) % 7));
    if (event.key === 'PageUp') next = moveFocusedMonth(date, event.shiftKey ? -12 : -1);
    if (event.key === 'PageDown') next = moveFocusedMonth(date, event.shiftKey ? 12 : 1);
    if (!next) return;
    event.preventDefault();
    focusCalendarDate(next);
  }

  function setJumpYear(raw: string) {
    setYearDraft(raw);
    if (!/^\d{4}$/.test(raw)) return;
    const year = Number(raw);
    if (year < 1 || year > 9999) return;
    setView(new Date(year, view.getMonth(), 1, 12));
  }

  return createPortal(
    <AnimatePresence>
      {open && <motion.div
        ref={ref}
        className={styles.picker}
        style={{ left, top }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: duration.fast, ease }}
        role="dialog"
        aria-modal="false"
        aria-label={schedule ? 'Choose when to work on this task' : 'Choose when this task must be finished'}
      >
        <div className={styles.material} />
        <motion.div className={styles.content} initial={{ scale: .97, y: -5 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .985, y: -2 }} transition={{ duration: duration.fast, ease }}>
          <header className={styles.intentHeader}>
            <span className={[styles.intentMark, schedule ? styles.scheduleMark : styles.deadlineMark].join(' ')} aria-hidden="true" />
            <span><strong>{schedule ? 'Do on' : 'Due by'}</strong><small>{schedule ? 'When you intend to work on it' : 'When it must be finished'}</small></span>
          </header>

          <div className={styles.shortcuts} aria-label="Date shortcuts">
            {PRESETS.map((preset) => <button type="button" key={preset.label} onClick={() => choosePreset(preset.get)}>{preset.label}</button>)}
          </div>

          <div className={styles.calendarHeader}>
            <button type="button" className={styles.navButton} onClick={() => setView((current) => moveMonth(current, -1))} aria-label="Previous month"><Chevron direction="left" /></button>
            <button type="button" className={styles.monthButton} onClick={() => setJumpOpen((current) => !current)} aria-expanded={jumpOpen} aria-label="Choose month and year">
              <strong>{new Intl.DateTimeFormat(undefined, { month: 'long' }).format(view)}</strong><span>{view.getFullYear()}</span>
            </button>
            <button type="button" className={styles.navButton} onClick={() => setView((current) => moveMonth(current, 1))} aria-label="Next month"><Chevron direction="right" /></button>
          </div>

          <AnimatePresence initial={false}>
            {jumpOpen && <motion.div className={styles.jumpPanel} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <div className={styles.yearControl}>
                <button type="button" onClick={() => setJumpYear(String(view.getFullYear() - 1))} aria-label="Previous year"><Chevron direction="left" /></button>
                <input value={yearDraft} onChange={(event) => setJumpYear(event.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={() => setYearDraft(String(view.getFullYear()))} inputMode="numeric" aria-label="Calendar year" />
                <button type="button" onClick={() => setJumpYear(String(view.getFullYear() + 1))} aria-label="Next year"><Chevron direction="right" /></button>
              </div>
              <div className={styles.monthGrid}>{MONTHS.map((month, index) => <button type="button" key={month} className={index === view.getMonth() ? styles.monthSelected : ''} onClick={() => { setView(new Date(view.getFullYear(), index, 1, 12)); setJumpOpen(false); }}>{month}</button>)}</div>
            </motion.div>}
          </AnimatePresence>

          {!jumpOpen && <div className={styles.calendar} role="grid" aria-label={`${new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(view)} calendar`}>
            <div className={styles.weekdays} role="row">{WEEKDAYS.map((day, index) => <span role="columnheader" aria-label={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][index]} key={`${day}-${index}`}>{day}</span>)}</div>
            <div className={styles.days}>
              {days.map((date) => {
                const key = localDateKey(date);
                const outside = date.getMonth() !== view.getMonth();
                return <button
                  type="button"
                  role="gridcell"
                  key={key}
                  data-date={key}
                  tabIndex={key === focusDay ? 0 : -1}
                  className={[outside ? styles.outside : '', key === todayKey ? styles.today : '', key === selectedKey ? styles.selected : ''].filter(Boolean).join(' ')}
                  aria-label={longDate(date)}
                  aria-selected={key === selectedKey}
                  onFocus={() => setFocusDay(key)}
                  onKeyDown={(event) => handleDayKey(event, date)}
                  onClick={() => choose(date)}
                ><span>{date.getDate()}</span></button>;
              })}
            </div>
          </div>}

          <div className={styles.manual}>
            <label htmlFor={`date-draft-${intent}`}>Enter a date</label>
            <div className={[styles.inputWrap, inputError ? styles.inputInvalid : ''].filter(Boolean).join(' ')}>
              <input
                ref={inputRef}
                id={`date-draft-${intent}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="YYYY-MM-DD"
                value={draft}
                aria-invalid={!!inputError}
                aria-describedby={inputError ? `date-error-${intent}` : undefined}
                onChange={(event) => { setDraft(event.target.value); setInputError(null); }}
                onBlur={(event) => {
                  if (ref.current?.contains(event.relatedTarget as Node | null)) return;
                  if (/^\d{4}-\d{2}-\d{2}$/.test(draft.trim())) commitDraft();
                }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitDraft(true); } }}
              />
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => commitDraft(true)}>Set</button>
            </div>
            {inputError && <p id={`date-error-${intent}`} role="alert">{inputError}</p>}
          </div>

          <footer className={styles.footer}>
            {value && <button type="button" className={styles.clearButton} onClick={() => { onChange(null); onClose(); }}>{schedule ? 'Clear scheduled date' : 'Remove deadline'}</button>}
            <button type="button" className={styles.cancelButton} onClick={onClose}>Cancel</button>
          </footer>
        </motion.div>
      </motion.div>}
    </AnimatePresence>,
    document.body,
  );
}
