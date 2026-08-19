import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import styles from './ToastProvider.module.css';

interface Toast {
  id: string;
  title: string;
  tone: 'error' | 'warning' | 'success' | 'info';
}

interface ToastApi {
  push: (title: string, tone?: Toast['tone']) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// A small fixed stack, not a per-widget ad-hoc banner - this is the one
// place any part of the app can surface a transient alert (first consumer:
// Homelab service-down detection, see useServiceAlerts) without inventing
// its own floating notification each time. Auto-dismisses; the same
// --popup-* surface tokens as Overlay/Sheet so it reads as native to the
// app, not a browser-notification-style intrusion.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const reduceMotion = useReducedMotion();

  const push = useCallback((title: string, tone: Toast['tone'] = 'info') => {
    const id = `t${++idRef.current}`;
    setToasts((prev) => [...prev, { id, title, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className={styles.stack}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={styles.toast}
              data-tone={t.tone}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => dismiss(t.id)}
            >
              {/* See Overlay.tsx's identical comment - .glass (backdrop-filter)
                  can't sit inside an element Framer Motion transforms, so the
                  x slide lives on .content (a sibling of .glass) instead. */}
              <div className={styles.glass} />
              <motion.div
                className={styles.content}
                initial={reduceMotion ? undefined : { x: 24 }}
                animate={{ x: 0 }}
                exit={reduceMotion ? undefined : { x: 24 }}
                transition={{ duration: 0.2 }}
              >
                <span className={styles.dot} data-tone={t.tone} />
                <span className={styles.title}>{t.title}</span>
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
