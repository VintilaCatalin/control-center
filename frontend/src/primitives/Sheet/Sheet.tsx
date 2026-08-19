import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { duration, ease } from '../../tokens/motion';
import styles from './Sheet.module.css';

function CloseIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// A polished modal surface - backdrop, Escape-to-close, animated
// entrance/exit, and a real focus trap (not just role="dialog" for show):
// focus lands inside on open, Tab/Shift+Tab cycle within the sheet instead
// of leaking to the page behind it, and focus returns to whatever
// triggered the sheet once it closes. This is also the first real down
// payment on the overlay primitive Settings-as-a-sheet will need later -
// built now because Change Cover genuinely needs it, not speculatively.
export function Sheet({ open, onClose, title, subtitle, children, actions }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const first = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? sheetRef.current)?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  function handleScrimClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.scrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.base, ease }}
          onClick={handleScrimClick}
        >
          <motion.div
            ref={sheetRef}
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.slow, ease }}
          >
            {/* See Overlay.tsx's identical comment - .glass (backdrop-filter)
                can't sit inside an element Framer Motion transforms, so the
                y/scale pop lives on .content (a sibling of .glass) instead. */}
            <div className={styles.glass} />
            <motion.div
              className={styles.content}
              initial={{ y: 16, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 10, scale: 0.98 }}
              transition={{ duration: duration.slow, ease }}
            >
              <div className={styles.head}>
                <div className={styles.headText}>
                  <h2 className={styles.title}>{title}</h2>
                  {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                </div>
                <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
                  <CloseIcon />
                </button>
              </div>
              <div className={styles.body}>{children}</div>
              {actions && <div className={styles.footer}>{actions}</div>}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
