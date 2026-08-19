import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { duration, ease } from '../../tokens/motion';
import styles from './DatePicker.module.css';

interface DatePickerProps {
  open: boolean;
  x: number;
  y: number;
  value: number | null;
  onChange: (ts: number | null) => void;
  onClose: () => void;
}

function atLocalNoon(daysFromToday: number): number {
  // Noon, not midnight - keeps the stored timestamp on the intended
  // calendar day regardless of timezone offset when it's later rendered.
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(12, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function nextWeekday(target: number): number {
  // 0=Sunday..6=Saturday. Used for "This weekend" (Saturday).
  const d = new Date();
  const delta = (target - d.getDay() + 7) % 7 || 7;
  return atLocalNoon(delta);
}

const PRESETS: { label: string; get: () => number }[] = [
  { label: 'Today', get: () => atLocalNoon(0) },
  { label: 'Tomorrow', get: () => atLocalNoon(1) },
  { label: 'This weekend', get: () => nextWeekday(6) },
  { label: 'Next week', get: () => atLocalNoon(7) },
];

// A compact "when" popover - Things' own preset shortcuts (Today/
// Tomorrow/This weekend/Next week) plus a plain native date input for
// anything else, not a custom calendar-grid widget (real extra risk/code
// for marginal gain over presets + native input - there's no editable
// date-picker precedent anywhere else in the app to match either).
// Same shared --popup-* glass surface + two-layer motion split as Menu -
// see Overlay.tsx's comment on why background/backdrop-filter can't sit
// on the same element Framer Motion transforms.
export function DatePicker({ open, x, y, value, onChange, onClose }: DatePickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 260));
  const top = Math.max(8, Math.min(y, window.innerHeight - 220));

  const inputValue = value ? new Date(value * 1000).toISOString().slice(0, 10) : '';

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={styles.picker}
          style={{ left, top }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.fast, ease }}
          role="dialog"
          aria-label="Pick a date"
        >
          <div className={styles.glass} />
          <motion.div
            className={styles.content}
            initial={{ scale: 0.96, y: -4 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98 }}
            transition={{ duration: duration.fast, ease }}
          >
            <div className={styles.presets}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => {
                    onChange(p.get());
                    onClose();
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="date"
              className={styles.dateInput}
              value={inputValue}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y2, m, d] = e.target.value.split('-').map(Number);
                const dt = new Date(y2, m - 1, d, 12, 0, 0);
                onChange(Math.floor(dt.getTime() / 1000));
                onClose();
              }}
            />
            {value !== null && (
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => {
                  onChange(null);
                  onClose();
                }}
              >
                Remove date
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
