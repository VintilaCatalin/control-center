import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { duration, ease } from '../../tokens/motion';
import styles from './Sheet.module.css';

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
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: duration.slow, ease }}
          >
            <h2 className={styles.title}>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            <div className={styles.body}>{children}</div>
            {actions && <div className={styles.actions}>{actions}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
