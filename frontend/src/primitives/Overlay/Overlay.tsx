import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { duration, ease } from '../../tokens/motion';
import styles from './Overlay.module.css';

function CloseIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  // 'center': a focused card in the middle of the screen (Quick Capture,
  // Search). 'drawer': slides in from the right edge instead, for
  // content meant to sit alongside whatever's behind it rather than
  // interrupt it (Tasks). Same surface/radius/typography/motion either
  // way - the one shared overlay language every transient popup in the
  // app goes through, instead of each feature inventing its own.
  variant?: 'center' | 'drawer';
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Overlay({ open, onClose, title, icon, variant = 'center', width, children, footer }: OverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => {
      const preferred = cardRef.current?.querySelector<HTMLElement>('[autofocus]');
      const first = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (preferred ?? first ?? cardRef.current)?.focus();
    }, 0);
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;
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
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKey);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  const isDrawer = variant === 'drawer';

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.scrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.fast, ease }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
          />
          <div className={isDrawer ? styles.drawerWrap : styles.centerWrap}>
            <motion.div
              ref={cardRef}
              className={[styles.card, isDrawer ? styles.cardDrawer : styles.cardCenter].join(' ')}
              style={width ? { maxWidth: width } : undefined}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              tabIndex={-1}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.base, ease }}
            >
              {/* .glass (the backdrop-filter layer) must never sit inside an
                  element Framer Motion applies transform to - Chromium
                  doesn't reliably run backdrop-filter under an animated
                  transform, which is what made every popup read as flat
                  opaque colour with sharp content visible straight through
                  it. This outer element only ever animates opacity now;
                  the y/scale/slide "pop" moved onto .content below, a
                  sibling of .glass rather than an ancestor, so it can
                  still transform freely without breaking the blur. */}
              <div className={styles.glass} />
              <motion.div
                className={styles.content}
                initial={isDrawer ? { x: '100%' } : { y: -10, scale: 0.97 }}
                animate={isDrawer ? { x: 0 } : { y: 0, scale: 1 }}
                exit={isDrawer ? { x: '100%' } : { y: -8, scale: 0.98 }}
                transition={{ duration: duration.base, ease }}
              >
                <div className={styles.head}>
                  <div className={styles.headTitle}>
                    {icon && <span className={styles.headIcon}>{icon}</span>}
                    <span>{title}</span>
                  </div>
                  <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
                    <CloseIcon />
                  </button>
                </div>
                <div className={styles.body}>{children}</div>
                {footer && <div className={styles.footer}>{footer}</div>}
              </motion.div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
